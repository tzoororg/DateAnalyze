// Façade over the local (IndexedDB) and cloud (Firebase) backends. ui.js talks to
// this module exclusively — same interface as db.js, plus mode control so cloud
// sync is an opt-in layer the local-only path never has to know about.
// Settings (spaceId, currency-rate cache, etc.) always stay on-device, even in
// cloud mode, since they include the very setting that decides which mode to use.

import * as local from "./db.js";

let backend = local;
let cloud = null;      // lazily-imported sync.js module, once sync is ever enabled
let mode = "local";    // "local" | "cloud"
let subscribers = [];

function notify() { subscribers.slice().forEach(cb => { try { cb(); } catch (e) { console.error(e); } }); }

async function loadCloud() {
  if (!cloud) {
    cloud = await import("./sync.js");
    cloud.setRemoteChangeHandler(notify);
  }
  return cloud;
}

export function subscribe(cb) {
  subscribers.push(cb);
  return () => { subscribers = subscribers.filter(f => f !== cb); };
}

export function getMode() { return mode; }
export function getUser() { return cloud ? cloud.getCurrentUser() : null; }
export function getInviteCode() { return cloud ? cloud.getInviteCode() : Promise.resolve(null); }

// Called once at boot, before the first render, so a returning cloud user lands
// straight in their shared space instead of flashing local-only data first.
export async function autoEnableSync() {
  const spaceId = await local.getSetting("spaceId", null);
  if (!spaceId) return;
  try {
    await loadCloud();
    await cloud.restoreSession(spaceId);
    backend = cloud;
    mode = "cloud";
  } catch (err) {
    console.warn("Cloud sync unavailable, staying local:", err);
  }
}

export async function signIn() {
  await loadCloud();
  return cloud.signIn();
}

export async function createSpace(uploadExisting) {
  await loadCloud();
  const localDates = uploadExisting ? await local.getAllDates() : [];
  const { spaceId, code } = await cloud.createSpace();
  if (localDates.length) await cloud.migrateLocalData(localDates);
  await local.setSetting("spaceId", spaceId);
  backend = cloud;
  mode = "cloud";
  return code;
}

export async function joinSpace(code) {
  await loadCloud();
  const spaceId = await cloud.joinSpace(code);
  await local.setSetting("spaceId", spaceId);
  backend = cloud;
  mode = "cloud";
  return spaceId;
}

export async function signOut() {
  if (cloud) await cloud.signOut();
  await local.setSetting("spaceId", null);
  backend = local;
  mode = "local";
  notify();
}

// ---- Data interface (same 12 functions as db.js), routed to the active backend ----

export async function getAllDates() { return backend.getAllDates(); }
export async function putDate(entry) { return backend.putDate(entry); }
export async function getDate(id) { return backend.getDate(id); }
export async function deleteDate(id) { return backend.deleteDate(id); }
export async function putPhoto(blob) { return backend.putPhoto(blob); }
export async function getPhoto(id) { return backend.getPhoto(id); }
export async function deletePhoto(id) { return backend.deletePhoto(id); }
export async function exportAll() { return backend.exportAll(); }
export async function importAll(payload, opts) { return backend.importAll(payload, opts); }
export async function wipeAll() { return backend.wipeAll(); }

// Settings always stay local — see file header.
export async function getSetting(key, fallback = null) { return local.getSetting(key, fallback); }
export async function setSetting(key, value) { return local.setSetting(key, value); }
