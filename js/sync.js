// Cloud backend: Firebase (Auth + Firestore), loaded only when the user turns on
// sync. Mirrors db.js's data interface so store.js can swap backends
// transparently. Date/text data syncs via Firestore; photo blobs stay
// device-local because the project is on the free Spark plan (no Cloud Storage).
// See SYNC_PLAN.md for the full design.

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
  // include Cloud Storage, so photo blobs stay device-local (see photo section).
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
  if (entry?.photos?.length) await Promise.all(entry.photos.map(pid => local.deletePhoto(pid)));
  await sdk.deleteDoc(sdk.doc(sdk.fs, "spaces", spaceId, "dates", id));
}

// ---- Photos: device-local only ----
// The free Spark plan has no Cloud Storage, so photo blobs live in each device's
// IndexedDB exactly as in local mode. A date doc's `photos[]` id list still syncs
// via Firestore, so a partner sees the entry but not any photo they didn't add
// themselves. (Upgrading to the Blaze plan + firebase-storage would let these
// sync too — see the photo handling that lived here in git history.)
export async function putPhoto(blob) { return local.putPhoto(blob); }
export async function getPhoto(id) { return local.getPhoto(id); }
export async function deletePhoto(id) { return local.deletePhoto(id); }

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
    await local.cachePhoto(pid, blob);
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
// joiners never auto-push, to avoid duplicating the partner's data). Photo blobs
// already live in this device's IndexedDB and stay there; only the date docs
// (with their photos[] id lists) go up to Firestore.
export async function migrateLocalData(localDates) {
  for (const entry of localDates) await putDate(entry);
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
