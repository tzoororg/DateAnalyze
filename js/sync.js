// Cloud backend: Firebase (Auth + Firestore, plus Cloud Storage on Blaze), loaded
// only when the user turns on sync. Mirrors db.js's data interface so store.js can
// swap backends transparently. Date/text data syncs via Firestore; photo blobs go
// to Cloud Storage when firebaseConfig.useStorage is set (Blaze), otherwise ride as
// base64 Firestore docs (Spark). See the photo section below and
// plans/done/SYNC_PLAN.md for the full design.

import { firebaseConfig } from "./firebase-config.js";
import * as local from "./db.js";
import * as e2ee from "./crypto.js";

const SDK_VERSION = "12.15.0";
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
// Test-only: ?emu=1 routes Auth+Firestore to the local Firebase Emulator Suite
// and swaps the Google popup for anonymous sign-in (see test/sync.test.mjs).
const EMU = typeof location !== "undefined" && new URLSearchParams(location.search).has("emu");
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

let sdk = null;          // { app, auth, fs, ...firebase fns }
let storageSdk = null;   // { storage, ...firebase-storage fns } — only when useStorage
let spaceId = null;
let unsubscribe = null;
let datesCache = [];
let remoteChangeCb = null;
let firstSnapshot = null; // promise that resolves once the first onSnapshot fires
let spaceKey = null;      // CryptoKey for E2EE, loaded from the `spaceKey` setting
let lastSnapshot = null;  // raw docs of the latest snapshot, so a late-arriving key can re-decrypt

function assertConfigured() {
  if (!firebaseConfig.apiKey) {
    throw new Error("Add your Firebase project config in js/firebase-config.js first");
  }
}

async function ensureFirebase() {
  if (sdk) return sdk;
  assertConfigured();
  // firebase-storage is imported separately and lazily (ensureStorage), only when
  // firebaseConfig.useStorage is set, so Spark/local users never download it.
  const [appMod, authMod, fsMod] = await Promise.all([
    import(/* @vite-ignore */ `${CDN}/firebase-app.js`),
    import(/* @vite-ignore */ `${CDN}/firebase-auth.js`),
    import(/* @vite-ignore */ `${CDN}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  // Persistent local cache: dates survive offline restarts even in cloud mode.
  let fs;
  try {
    fs = fsMod.initializeFirestore(app, {
      localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn("Persistent Firestore cache unavailable, using memory cache:", err);
    fs = fsMod.getFirestore(app);
  }
  sdk = {
    app,
    auth: authMod.getAuth(app),
    fs,
    ...appMod, ...authMod, ...fsMod,
  };
  if (EMU) {
    authMod.connectAuthEmulator(sdk.auth, "http://127.0.0.1:9099", { disableWarnings: true });
    fsMod.connectFirestoreEmulator(sdk.fs, "127.0.0.1", 8080);
  }
  return sdk;
}

// Cloud Storage backend for photo blobs. Lazily imported only when
// firebaseConfig.useStorage is true (Blaze plan) — Spark/local users never load
// the firebase-storage SDK. Routes to the Storage emulator under ?emu=1.
async function ensureStorage() {
  if (storageSdk) return storageSdk;
  const s = await ensureFirebase();
  const mod = await import(/* @vite-ignore */ `${CDN}/firebase-storage.js`);
  const storage = mod.getStorage(s.app);
  if (EMU) mod.connectStorageEmulator(storage, "127.0.0.1", 9199);
  storageSdk = { storage, ...mod };
  return storageSdk;
}

function photoRef(st, id) {
  return st.ref(st.storage, `spaces/${spaceId}/photos/${id}`);
}

function waitForAuthUser() {
  return ensureFirebase().then(s => new Promise(resolve => {
    const off = s.onAuthStateChanged(s.auth, user => { off(); resolve(user); });
  }));
}

export function setRemoteChangeHandler(cb) { remoteChangeCb = cb; }

export function getCurrentUser() {
  const u = sdk?.auth?.currentUser;
  return u ? { uid: u.uid, email: u.email, displayName: u.displayName } : null;
}

export async function signIn() {
  const s = await ensureFirebase();
  if (EMU) { // the emulator has no Google popup; anonymous gives a real uid
    const { user } = await s.signInAnonymously(s.auth);
    return { uid: user.uid, email: null, displayName: "Emulator user" };
  }
  const provider = new s.GoogleAuthProvider();
  try {
    const { user } = await s.signInWithPopup(s.auth, provider);
    return { uid: user.uid, email: user.email, displayName: user.displayName };
  } catch (err) {
    // The user closing/cancelling the popup is intent, not an unsupported popup —
    // surface it, don't bounce them through a full-page redirect.
    if (err?.code === "auth/popup-closed-by-user" || err?.code === "auth/cancelled-popup-request") {
      throw err;
    }
    // Installed iOS PWAs and many store webviews can't use popups (the popup opens
    // detached and its result never returns, or is blocked outright). Fall back to
    // a full-page redirect; the page navigates away here and completeRedirectSignIn()
    // finishes it on next load.
    localStorage.setItem("pendingRedirectSignIn", "1");
    await s.signInWithRedirect(s.auth, provider);
    return new Promise(() => {}); // never resolves — the page is navigating away
  }
}

// Called at boot when a redirect sign-in is pending. Returns the signed-in user
// (populating auth.currentUser) or null if there was no pending redirect.
export async function completeRedirectSignIn() {
  const s = await ensureFirebase();
  const result = await s.getRedirectResult(s.auth);
  const user = result?.user;
  return user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null;
}

export async function signOut() {
  detachSpace();
  if (sdk?.auth) await sdk.signOut(sdk.auth);
}

// Delete the signed-in user's account. If they're the space's only member, the
// whole space (dates, photos, space doc) is deleted; if the partner is still a
// member, only this user's membership is removed and the shared history stays.
// Order matters: content and the space doc are deleted while isMember still holds
// (member doc present), and the member doc is deleted LAST. Local data is wiped by
// store.deleteAccount() after this resolves.
export async function deleteAccount() {
  const s = await ensureFirebase();
  const user = s.auth.currentUser;
  if (!user) throw new Error("Not signed in");
  if (spaceId) {
    const members = await s.getDocs(s.collection(s.fs, "spaces", spaceId, "members"));
    if (members.size <= 1) {
      const dates = await s.getDocs(s.collection(s.fs, "spaces", spaceId, "dates"));
      for (const d of dates.docs) await s.deleteDoc(d.ref);
      const photos = await s.getDocs(s.collection(s.fs, "spaces", spaceId, "photos"));
      for (const p of photos.docs) await s.deleteDoc(p.ref);
      await s.deleteDoc(s.doc(s.fs, "spaces", spaceId));   // isMember still true here
      await s.deleteDoc(s.doc(s.fs, "spaces", spaceId, "members", user.uid)); // last
    } else {
      await s.deleteDoc(s.doc(s.fs, "spaces", spaceId, "members", user.uid));
    }
  }
  detachSpace();
  // Auth user last. deleteUser needs a recent login; re-auth once if demanded.
  try {
    await s.deleteUser(user);
  } catch (err) {
    // ponytail: popup re-auth covers the common case; installed iOS PWAs would
    // need a redirect re-auth — edge case, revisit if it shows up.
    if (err?.code === "auth/requires-recent-login" && !EMU) {
      await s.reauthenticateWithPopup(user, new s.GoogleAuthProvider());
      await s.deleteUser(user);
    } else {
      throw err;
    }
  }
}

// ---- E2EE key ----
async function loadSpaceKey() {
  const b64 = await local.getSetting("spaceKey", null);
  spaceKey = b64 ? await e2ee.importKeyB64(b64) : null;
}

// Decrypt one raw Firestore date doc. Plaintext (legacy) docs pass through.
async function decryptDate(doc) {
  if (!doc?.enc) return doc;
  if (!spaceKey) return { id: doc.id, date: doc.date, title: "🔒 Encrypted (enter key in ⋯ menu)" };
  try {
    return { id: doc.id, date: doc.date, ...(await e2ee.decryptJSON(spaceKey, doc.enc)) };
  } catch {
    return { id: doc.id, date: doc.date, title: "🔒 Encrypted (wrong key?)" };
  }
}

async function applySnapshot(docs) {
  lastSnapshot = docs;
  datesCache = await Promise.all(docs.map(decryptDate));
}

function detachSpace() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  spaceId = null;
  datesCache = [];
  lastSnapshot = null;
  firstSnapshot = null;
}

function attachSpace(id) {
  detachSpace();
  spaceId = id;
  const s = sdk;
  const col = s.collection(s.fs, "spaces", spaceId, "dates");
  firstSnapshot = loadSpaceKey().then(() => new Promise((resolve, reject) => {
    let resolved = false;
    unsubscribe = s.onSnapshot(col, snap => {
      applySnapshot(snap.docs.map(d => d.data())).then(() => {
        if (!resolved) { resolved = true; resolve(); }
        remoteChangeCb?.();
      });
    }, err => { if (!resolved) { resolved = true; reject(err); } });
  }));
  return firstSnapshot;
}

function genCode() {
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export async function createSpace() {
  const s = await ensureFirebase();
  const user = await waitForAuthUser();
  if (!user) throw new Error("Sign in first");

  // Order matters: the invite must exist before any member doc references it
  // (security rules validate new member docs against an existing invite/code).
  const spaceRef = s.doc(s.collection(s.fs, "spaces"));
  // E2EE: generate the space key up front. The invite code shared with the
  // partner is `${serverCode}.${keyB64}` — the server only ever sees serverCode.
  const key = await e2ee.genKey();
  const keyB64 = await e2ee.exportKeyB64(key);
  await local.setSetting("spaceKey", keyB64);
  const code = genCode();
  await s.setDoc(s.doc(s.fs, "invites", code), {
    spaceId: spaceRef.id, createdBy: user.uid,
    createdAt: s.serverTimestamp(), expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  await s.setDoc(spaceRef, { createdAt: s.serverTimestamp(), createdBy: user.uid });
  await s.setDoc(s.doc(s.fs, "spaces", spaceRef.id, "members", user.uid),
    { joinedAt: s.serverTimestamp(), joinedVia: "created", code });

  await attachSpace(spaceRef.id);
  const combined = `${code}.${keyB64}`;
  await local.setSetting("spaceInviteCode", combined);
  await local.setSetting("spaceInviteCodeExp", Date.now() + INVITE_TTL_MS);
  return { spaceId: spaceRef.id, code: combined };
}

export async function joinSpace(codeRaw) {
  const s = await ensureFirebase();
  const user = await waitForAuthUser();
  if (!user) throw new Error("Sign in first");

  // Combined code: `${serverCode}.${keyB64}`. Only the server part is
  // case-insensitive — the key is base64url and must keep its case.
  const [serverPart, keyPart] = codeRaw.trim().split(".");
  const code = serverPart.trim().toUpperCase();
  if (keyPart) {
    await e2ee.importKeyB64(keyPart); // validate before saving
    await local.setSetting("spaceKey", keyPart);
  }
  const inviteRef = s.doc(s.fs, "invites", code);
  const inviteSnap = await s.getDoc(inviteRef);
  if (!inviteSnap.exists()) throw new Error("That code isn't valid");
  const invite = inviteSnap.data();
  if (invite.expiresAt?.toDate?.() < new Date()) throw new Error("That code has expired");

  // Batched so the invite is consumed atomically with membership creation — the
  // security rules require both writes to land together (see firestore.rules).
  const batch = s.writeBatch(s.fs);
  batch.update(inviteRef, { usedBy: user.uid });
  batch.set(s.doc(s.fs, "spaces", invite.spaceId, "members", user.uid),
    { joinedAt: s.serverTimestamp(), joinedVia: "code", code });
  try {
    await batch.commit();
  } catch (err) {
    if (err?.code === "permission-denied") {
      throw new Error("That code was already used or has expired");
    }
    throw err;
  }
  try { await s.deleteDoc(inviteRef); } catch { /* best-effort cleanup */ }

  await attachSpace(invite.spaceId);
  return invite.spaceId;
}

export async function restoreSession(id) {
  await ensureFirebase();
  const user = await waitForAuthUser();
  if (!user) throw new Error("Not signed in");
  await attachSpace(id);
}

export function getInviteCode() {
  return local.getSetting("spaceInviteCode", null);
}

// Mint a fresh 7-day pairing code for the current space (the old one may have
// expired before the partner joined). Same E2EE key — only the server code
// changes; the previous invite is best-effort retired so it can't be reused.
export async function regenerateInviteCode() {
  const s = await ensureFirebase();
  const user = s.auth.currentUser;
  if (!user || !spaceId) throw new Error("No active space");
  const keyB64 = await local.getSetting("spaceKey", null);
  if (!keyB64) throw new Error("Missing encryption key");
  const oldCombined = await local.getSetting("spaceInviteCode", null);
  const code = genCode();
  await s.setDoc(s.doc(s.fs, "invites", code), {
    spaceId, createdBy: user.uid,
    createdAt: s.serverTimestamp(), expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  const combined = `${code}.${keyB64}`;
  await local.setSetting("spaceInviteCode", combined);
  await local.setSetting("spaceInviteCodeExp", Date.now() + INVITE_TTL_MS);
  const oldServer = oldCombined ? oldCombined.split(".")[0] : null;
  if (oldServer && oldServer !== code) {
    try { await s.deleteDoc(s.doc(s.fs, "invites", oldServer)); } catch { /* best-effort */ }
  }
  return combined;
}

// ---- Push notifications ----

// Obtain (or refresh) this device's FCM token. Messaging is imported here because
// sync.js owns the Firebase app; the caller supplies the already-registered SW.
export async function getPushToken(vapidKey, swReg) {
  const s = await ensureFirebase();
  const mod = await import(/* @vite-ignore */ `${CDN}/firebase-messaging.js`);
  const messaging = mod.getMessaging(s.app);
  return mod.getToken(messaging, { vapidKey, serviceWorkerRegistration: swReg });
}

export async function setMyPushToken(token) {
  const uid = sdk?.auth?.currentUser?.uid;
  if (!uid || !spaceId) return;
  await sdk.setDoc(sdk.doc(sdk.fs, "spaces", spaceId, "members", uid),
    { fcmToken: token, tokenUpdatedAt: sdk.serverTimestamp() }, { merge: true });
}

export function getSpaceId() { return spaceId; }

// Current user's Firebase ID token, for authenticating to our own workers
// (push-worker verifies this server-side against the space membership).
export async function getIdToken() {
  return sdk?.auth?.currentUser ? sdk.auth.currentUser.getIdToken() : null;
}

// ---- Data interface (mirrors db.js) ----

export async function getAllDates() {
  if (firstSnapshot) await firstSnapshot;
  return datesCache;
}

export async function putDate(entry) {
  const clean = JSON.parse(JSON.stringify(entry));
  let doc = clean;
  if (spaceKey) {
    const { id, date, ...rest } = clean;
    doc = { id, date, enc: await e2ee.encryptJSON(spaceKey, rest) };
  }
  await sdk.setDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", clean.id), doc);
}

export async function getDate(id) {
  const cached = datesCache.find(d => d.id === id);
  if (cached) return cached;
  const snap = await sdk.getDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", id));
  return snap.exists() ? decryptDate(snap.data()) : undefined;
}

export async function deleteDate(id) {
  const entry = await getDate(id);
  if (entry?.photos?.length) await Promise.all(entry.photos.map(pid => deletePhoto(pid)));
  await sdk.deleteDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", id));
}

// ---- Photos ----
// Two backends, chosen by firebaseConfig.useStorage:
//   Storage (Blaze): blob bytes live in Cloud Storage at spaces/{spaceId}/photos/{id},
//     no 1 MiB cap and no Firestore quota pressure. This is the launch path.
//   base64 Firestore (Spark): each photo rides as a base64 field in its own doc
//     under spaces/{spaceId}/photos/{id}, capped by fitUnderLimit(). Legacy path.
// Reads try Storage first and fall back to the base64 doc, so photos written before
// the Blaze migration still load. The id is the same UUID already in date.photos[],
// so the date schema and UI are unchanged; photos are fetched lazily and cached in
// IndexedDB. E2EE: bytes are encrypted client-side either way (mime "enc:<orig>").
const MAX_PHOTO_BYTES = 900_000; // base64 length ceiling, safely under Firestore's 1 MiB doc cap

async function uploadPhoto(id, blob) {
  if (firebaseConfig.useStorage) {
    const st = await ensureStorage();
    const orig = blob.type || "image/jpeg";
    const wire = spaceKey ? await e2ee.encryptBlob(spaceKey, blob) : blob;
    // contentType carries the enc marker so getPhoto knows to decrypt; the
    // spaceKey invariant below is the backstop if a store drops it.
    const contentType = spaceKey ? `enc:${orig}` : orig;
    await st.uploadBytes(photoRef(st, id), wire, { contentType });
    await local.cachePhoto(id, blob); // warm local cache (plaintext) so the uploader sees it instantly
    return;
  }
  const fitted = await fitUnderLimit(blob);
  // E2EE: encrypt the blob; mime becomes "enc:<origMime>" so no new doc field
  // is needed (firestore.rules allows only data/mime/createdAt).
  const wire = spaceKey ? await e2ee.encryptBlob(spaceKey, fitted) : fitted;
  const mime = spaceKey ? `enc:${fitted.type || "image/jpeg"}` : (fitted.type || "image/jpeg");
  const data = await blobToDataURL(wire);
  await sdk.setDoc(sdk.doc(sdk.fs, "spaces", spaceId, "photos", id),
    { data, mime, createdAt: sdk.serverTimestamp() });
  await local.cachePhoto(id, fitted); // warm local cache (plaintext) so the uploader sees it instantly
}

export async function putPhoto(blob) {
  const id = crypto.randomUUID();
  await uploadPhoto(id, blob);
  return id;
}

export async function getPhoto(id) {
  const cached = await local.getPhoto(id);
  if (cached) return cached;
  // Storage first (Blaze); a miss falls through to the base64 Firestore doc so
  // photos written before the migration still load.
  if (firebaseConfig.useStorage) {
    const st = await ensureStorage();
    try {
      let blob = await st.getBlob(photoRef(st, id));
      const { encrypted, origMime } = e2ee.photoDecryptInfo(blob.type);
      if (encrypted || (spaceKey && !blob.type.startsWith("image/"))) {
        if (!spaceKey) return null; // can't decrypt without the key
        blob = await e2ee.decryptBlob(spaceKey, blob, origMime);
      }
      await local.cachePhoto(id, blob);
      return blob;
    } catch (err) {
      if (err?.code !== "storage/object-not-found") throw err;
      // fall through to the base64 fallback
    }
  }
  const snap = await sdk.getDoc(sdk.doc(sdk.fs, "spaces", spaceId, "photos", id));
  if (!snap.exists()) return null;
  const { data, mime } = snap.data();
  let blob = await dataURLToBlob(data);
  const { encrypted, origMime } = e2ee.photoDecryptInfo(mime);
  if (encrypted) {
    if (!spaceKey) return null; // can't decrypt without the key
    blob = await e2ee.decryptBlob(spaceKey, blob, origMime);
  }
  await local.cachePhoto(id, blob);
  return blob;
}

export async function deletePhoto(id) {
  // Delete from both backends best-effort: a photo may live in Storage, the
  // base64 Firestore doc, or (mid-migration) leftovers of both.
  if (firebaseConfig.useStorage) {
    try {
      const st = await ensureStorage();
      await st.deleteObject(photoRef(st, id));
    } catch (err) {
      if (err?.code !== "storage/object-not-found") throw err;
    }
  }
  try { await sdk.deleteDoc(sdk.doc(sdk.fs, "spaces", spaceId, "photos", id)); } catch { /* may not exist */ }
  await local.deletePhoto(id);
}

// Retroactive backfill: push every photo blob that lives only in this device's
// IndexedDB up to the shared space, reusing its existing id (idempotent — setDoc
// overwrites). Run once per phone; the partner then lazy-fetches what it was
// missing. Photos whose only copy is on the other phone come from that phone.
export async function backfillPhotos(onProgress) {
  const dates = await getAllDates();
  const jobs = [];
  for (const d of dates) {
    for (const id of (d.photos || [])) {
      const blob = await local.getPhoto(id);
      if (blob) jobs.push({ id, blob });
    }
  }
  let done = 0;
  for (const { id, blob } of jobs) { // ponytail: serial; a couple's few hundred photos, no need to batch
    await uploadPhoto(id, blob);
    onProgress?.(++done, jobs.length);
  }
  return done;
}

// Re-encode until the base64 payload fits under a Firestore doc. Only the cloud
// path uses this; local-mode photo quality is untouched. Reuses the canvas
// downscale approach from ui.js but keeps sync.js dependency-free.
async function fitUnderLimit(blob) {
  const b64len = b => Math.ceil(b.size / 3) * 4; // exact base64 char count for a blob
  if (b64len(blob) <= MAX_PHOTO_BYTES) return blob;
  const bitmap = await createImageBitmap(blob);
  for (const dim of [1280, 1024, 800]) {
    for (const q of [0.82, 0.7, 0.6]) {
      const scale = Math.min(1, dim / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
      const out = await new Promise(res => canvas.toBlob(res, "image/jpeg", q));
      if (out && b64len(out) <= MAX_PHOTO_BYTES) { bitmap.close?.(); return out; }
    }
  }
  bitmap.close?.();
  throw new Error("Photo too large to sync even after re-encoding");
}

export async function exportAll() {
  const dates = await getAllDates();
  const photos = {};
  for (const d of dates) {
    for (const pid of (d.photos || [])) {
      const blob = await getPhoto(pid);
      if (blob) photos[pid] = await blobToDataURL(blob);
    }
  }
  return { version: 1, exportedAt: new Date().toISOString(), dates, photos };
}

export async function importAll(payload, { merge = true } = {}) {
  if (!payload || !Array.isArray(payload.dates)) throw new Error("Invalid backup file");
  if (!merge) await wipeAll();
  const photos = payload.photos || {};
  for (const [pid, dataUrl] of Object.entries(photos)) {
    const blob = await dataURLToBlob(dataUrl);
    await uploadPhoto(pid, blob); // land imported photos in the shared space, not just locally
  }
  for (const d of payload.dates) await putDate(d);
  return payload.dates.length;
}

export async function wipeAll() {
  const dates = await getAllDates();
  for (const d of dates) await deleteDate(d.id);
  await local.wipeAll();
}

// Push existing local-only data up into a freshly created space (creator only;
// joiners never auto-push, to avoid duplicating the partner's data). Both the date
// docs and their photo blobs go up, so the partner sees the full history.
export async function migrateLocalData(localDates) {
  for (const entry of localDates) {
    await putDate(entry);
    for (const id of (entry.photos || [])) {
      const blob = await local.getPhoto(id);
      if (blob) await uploadPhoto(id, blob);
    }
  }
}

// ---- E2EE key management ----

export function getSpaceKeyB64() {
  return local.getSetting("spaceKey", null);
}

export async function setSpaceKeyB64(b64) {
  const key = await e2ee.importKeyB64(b64.trim()); // throws if malformed
  await local.setSetting("spaceKey", b64.trim());
  spaceKey = key;
  if (lastSnapshot) {
    datesCache = await Promise.all(lastSnapshot.map(decryptDate));
    remoteChangeCb?.();
  }
}

// Migration: encrypt every plaintext date + photo doc already in the space.
// Idempotent — already-encrypted docs are skipped.
export async function encryptExistingData(onProgress) {
  if (!spaceKey) {
    const key = await e2ee.genKey();
    const b64 = await e2ee.exportKeyB64(key);
    await local.setSetting("spaceKey", b64);
    spaceKey = key;
  }
  const s = sdk;
  const snap = await s.getDocs(s.collection(s.fs, "spaces", spaceId, "dates"));
  const raw = snap.docs.map(d => d.data());
  const plainDates = raw.filter(d => !d.enc);
  const photoIds = [...new Set(raw.flatMap(d => d.photos || []))];
  const total = plainDates.length + photoIds.length;
  let done = 0;
  for (const d of plainDates) { // ponytail: serial; a couple's data set is small
    await putDate(d); // putDate encrypts now that spaceKey is set
    onProgress?.(++done, total);
  }
  for (const pid of photoIds) {
    const psnap = await s.getDoc(s.doc(s.fs, "spaces", spaceId, "photos", pid));
    if (psnap.exists() && !psnap.data().mime?.startsWith("enc:")) {
      const blob = await dataURLToBlob(psnap.data().data);
      await uploadPhoto(pid, blob);
    }
    onProgress?.(++done, total);
  }
  return done;
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
function dataURLToBlob(dataUrl) {
  // Decode directly rather than fetch(dataUrl) — the app's CSP connect-src does
  // not allow data:, so fetching a data URL throws "Failed to fetch".
  const [head, b64] = dataUrl.split(",");
  const mime = head.slice(5, head.indexOf(";")); // "data:<mime>;base64"
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
