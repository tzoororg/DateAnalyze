// Tiny IndexedDB wrapper. Three object stores: dates, photos (blobs), settings.
// Everything stays on-device; nothing is sent anywhere.

const DB_NAME = "us-date-tracker";
const DB_VERSION = 1;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("dates")) db.createObjectStore("dates", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function reqP(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- Dates ----
export async function getAllDates() {
  return tx("dates", "readonly", s => reqP(s.getAll()));
}
export async function putDate(entry) {
  return tx("dates", "readwrite", s => reqP(s.put(entry)));
}
export async function getDate(id) {
  return tx("dates", "readonly", s => reqP(s.get(id)));
}
export async function deleteDate(id) {
  const entry = await getDate(id);
  if (entry?.photos?.length) await Promise.all(entry.photos.map(deletePhoto));
  return tx("dates", "readwrite", s => reqP(s.delete(id)));
}

// ---- Photos (blobs) ----
export async function putPhoto(blob) {
  const id = crypto.randomUUID();
  await tx("photos", "readwrite", s => reqP(s.put({ id, blob })));
  return id;
}
export async function getPhoto(id) {
  const rec = await tx("photos", "readonly", s => reqP(s.get(id)));
  return rec?.blob || null;
}
export async function deletePhoto(id) {
  return tx("photos", "readwrite", s => reqP(s.delete(id)));
}
// Cache a blob under a caller-supplied id (used by sync.js to mirror cloud photos locally).
export async function cachePhoto(id, blob) {
  return tx("photos", "readwrite", s => reqP(s.put({ id, blob })));
}

// ---- Settings ----
export async function getSetting(key, fallback = null) {
  const rec = await tx("settings", "readonly", s => reqP(s.get(key)));
  return rec ? rec.value : fallback;
}
export async function setSetting(key, value) {
  return tx("settings", "readwrite", s => reqP(s.put({ key, value })));
}

// ---- Bulk / maintenance (export, import, wipe) ----
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
  // Restore photos first so ids exist.
  const photos = payload.photos || {};
  for (const [pid, dataUrl] of Object.entries(photos)) {
    const blob = await dataURLToBlob(dataUrl);
    await tx("photos", "readwrite", s => reqP(s.put({ id: pid, blob })));
  }
  for (const d of payload.dates) await putDate(d);
  return payload.dates.length;
}

export async function wipeAll() {
  await tx("dates", "readwrite", s => reqP(s.clear()));
  await tx("photos", "readwrite", s => reqP(s.clear()));
}

// ---- helpers ----
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
