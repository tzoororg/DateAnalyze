// E2EE helpers: WebCrypto only, no deps. AES-GCM 256 with a random 12-byte IV
// prefixed to every ciphertext. Used by sync.js to keep date/photo content
// unreadable to the server (Firestore only ever sees ciphertext).

function b64uEncode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64uDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function genKey() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function exportKeyB64(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return b64uEncode(raw);
}

export async function importKeyB64(b64) {
  const raw = b64uDecode(b64);
  return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return b64uEncode(out.buffer);
}

export async function decryptJSON(key, b64) {
  const buf = new Uint8Array(b64uDecode(b64));
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

export async function encryptBlob(key, blob) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await blob.arrayBuffer());
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return new Blob([out]);
}

export async function decryptBlob(key, blob, mime) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const iv = buf.slice(0, 12);
  const ct = buf.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Blob([pt], { type: mime });
}
