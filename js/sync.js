// Cloud backend: Firebase (Auth + Firestore), loaded only when the user turns on
// sync. Mirrors db.js's data interface so store.js can swap backends
// transparently. Date/text data and photos both sync via Firestore — photos ride
// as base64 docs (no Cloud Storage on the free Spark plan). See the photo section
// below and SYNC_PLAN.md for the full design.

import { firebaseConfig } from "./firebase-config.js";
import * as local from "./db.js";

const SDK_VERSION = "12.15.0";
const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

let sdk = null;          // { app, auth, fs, ...firebase fns }
let spaceId = null;
let unsubscribe = null;
let datesCache = [];
let remoteChangeCb = null;
let firstSnapshot = null; // promise that resolves once the first onSnapshot fires

function assertConfigured() {
  if (!firebaseConfig.apiKey) {
    throw new Error("Add your Firebase project config in js/firebase-config.js first");
  }
}

async function ensureFirebase() {
  if (sdk) return sdk;
  assertConfigured();
  // No firebase-storage: the project is on the free Spark plan, which doesn't
  // include Cloud Storage. Photos sync as base64 Firestore docs instead (see
  // the photo section below).
  const [appMod, authMod, fsMod] = await Promise.all([
    import(/* @vite-ignore */ `${CDN}/firebase-app.js`),
    import(/* @vite-ignore */ `${CDN}/firebase-auth.js`),
    import(/* @vite-ignore */ `${CDN}/firebase-firestore.js`),
  ]);
  const app = appMod.initializeApp(firebaseConfig);
  sdk = {
    app,
    auth: authMod.getAuth(app),
    fs: fsMod.getFirestore(app),
    ...appMod, ...authMod, ...fsMod,
  };
  return sdk;
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
  const provider = new s.GoogleAuthProvider();
  const { user } = await s.signInWithPopup(s.auth, provider);
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

export async function signOut() {
  detachSpace();
  if (sdk?.auth) await sdk.signOut(sdk.auth);
}

function detachSpace() {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  spaceId = null;
  datesCache = [];
  firstSnapshot = null;
}

function attachSpace(id) {
  detachSpace();
  spaceId = id;
  const s = sdk;
  const col = s.collection(s.fs, "spaces", spaceId, "dates");
  firstSnapshot = new Promise((resolve, reject) => {
    let resolved = false;
    unsubscribe = s.onSnapshot(col, snap => {
      datesCache = snap.docs.map(d => d.data());
      if (!resolved) { resolved = true; resolve(); }
      remoteChangeCb?.();
    }, err => { if (!resolved) { resolved = true; reject(err); } });
  });
  return firstSnapshot;
}

function genCode() {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export async function createSpace() {
  const s = await ensureFirebase();
  const user = await waitForAuthUser();
  if (!user) throw new Error("Sign in first");

  // Order matters: the invite must exist before any member doc references it
  // (security rules validate new member docs against an existing invite/code).
  const spaceRef = s.doc(s.collection(s.fs, "spaces"));
  const code = genCode();
  await s.setDoc(s.doc(s.fs, "invites", code), {
    spaceId: spaceRef.id, createdBy: user.uid,
    createdAt: s.serverTimestamp(), expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  await s.setDoc(spaceRef, { createdAt: s.serverTimestamp(), createdBy: user.uid });
  await s.setDoc(s.doc(s.fs, "spaces", spaceRef.id, "members", user.uid),
    { joinedAt: s.serverTimestamp(), joinedVia: "created", code });

  await attachSpace(spaceRef.id);
  await local.setSetting("spaceInviteCode", code);
  return { spaceId: spaceRef.id, code };
}

export async function joinSpace(codeRaw) {
  const s = await ensureFirebase();
  const user = await waitForAuthUser();
  if (!user) throw new Error("Sign in first");

  const code = codeRaw.trim().toUpperCase();
  const inviteSnap = await s.getDoc(s.doc(s.fs, "invites", code));
  if (!inviteSnap.exists()) throw new Error("That code isn't valid");
  const invite = inviteSnap.data();
  if (invite.expiresAt?.toDate?.() < new Date()) throw new Error("That code has expired");

  await s.setDoc(s.doc(s.fs, "spaces", invite.spaceId, "members", user.uid),
    { joinedAt: s.serverTimestamp(), joinedVia: "code", code });

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

// Every member's token except mine (the partner, in a 2-person space).
export async function getPartnerTokens() {
  if (!sdk || !spaceId) return [];
  const me = sdk.auth?.currentUser?.uid;
  const snap = await sdk.getDocs(sdk.collection(sdk.fs, "spaces", spaceId, "members"));
  return snap.docs.filter(d => d.id !== me).map(d => d.data().fcmToken).filter(Boolean);
}

// ---- Data interface (mirrors db.js) ----

export async function getAllDates() {
  if (firstSnapshot) await firstSnapshot;
  return datesCache;
}

export async function putDate(entry) {
  const clean = JSON.parse(JSON.stringify(entry));
  await sdk.setDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", clean.id), clean);
}

export async function getDate(id) {
  const cached = datesCache.find(d => d.id === id);
  if (cached) return cached;
  const snap = await sdk.getDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", id));
  return snap.exists() ? snap.data() : undefined;
}

export async function deleteDate(id) {
  const entry = await getDate(id);
  if (entry?.photos?.length) await Promise.all(entry.photos.map(pid => deletePhoto(pid)));
  await sdk.deleteDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", id));
}

// ---- Photos: base64 Firestore docs ----
// No Cloud Storage on the free Spark plan, so each photo blob rides along as a
// base64 field in its own doc under spaces/{spaceId}/photos/{photoId}. The id is
// the same UUID already in date.photos[], so the date schema and UI are unchanged.
// Photos aren't streamed by onSnapshot (that listens on `dates`); they're fetched
// lazily on first view and cached in IndexedDB, mirroring the local-only path.
// Firestore caps a doc at 1 MiB, so fitUnderLimit() re-encodes before writing.
const MAX_PHOTO_BYTES = 900_000; // base64 length ceiling, safely under Firestore's 1 MiB doc cap

async function uploadPhoto(id, blob) {
  const fitted = await fitUnderLimit(blob);
  const data = await blobToDataURL(fitted);
  await sdk.setDoc(sdk.doc(sdk.fs, "spaces", spaceId, "photos", id),
    { data, mime: fitted.type || "image/jpeg", createdAt: sdk.serverTimestamp() });
  await local.cachePhoto(id, fitted); // warm local cache so the uploader sees it instantly
}

export async function putPhoto(blob) {
  const id = crypto.randomUUID();
  await uploadPhoto(id, blob);
  return id;
}

export async function getPhoto(id) {
  const cached = await local.getPhoto(id);
  if (cached) return cached;
  const snap = await sdk.getDoc(sdk.doc(sdk.fs, "spaces", spaceId, "photos", id));
  if (!snap.exists()) return null;
  const blob = await dataURLToBlob(snap.data().data);
  await local.cachePhoto(id, blob);
  return blob;
}

export async function deletePhoto(id) {
  await sdk.deleteDoc(sdk.doc(sdk.fs, "spaces", spaceId, "photos", id));
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

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
async function dataURLToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
