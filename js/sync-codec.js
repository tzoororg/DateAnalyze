// Wire format for the cloud backend: how a date entry becomes a Firestore doc,
// how an invite code is parsed, how a photo data URL becomes bytes.
//
// Split out of sync.js because this is the code that decides whether a couple's
// data survives the round trip — the highest-risk logic in the app — and inside
// sync.js it could only be exercised through the Firebase emulator suite (Java +
// two headless browsers). Everything here is pure, so test/logic.test.mjs covers
// it on every commit. Nothing in this file may import Firebase or touch the DOM.

import * as e2ee from "./crypto.js";

export const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const CODE_LEN = 8;
export const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

// Placeholder titles for a doc we hold but can't read. Shown in place of the
// real title so the entry still appears in History instead of vanishing.
export const LOCKED_NO_KEY = "🔒 Encrypted (enter key in ⚙️ menu)";
export const LOCKED_BAD_KEY = "🔒 Encrypted (wrong key?)";

export function genCode(rand = Math.random) {
  let code = "";
  for (let i = 0; i < CODE_LEN; i++) code += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return code;
}

// A shared invite is `${serverCode}.${keyB64}` — the server only ever sees the
// code half. Only the code is case-insensitive; the key is base64url and must
// keep its case.
export function parseInviteCode(raw) {
  const [serverPart = "", keyPart] = String(raw ?? "").trim().split(".");
  return { code: serverPart.trim().toUpperCase(), keyB64: keyPart || null };
}

// expiresAt is a Firestore Timestamp on the wire and a plain Date when we just
// wrote it locally; accept either. A missing expiry is treated as not expired,
// matching the old inline check.
export function inviteExpired(invite, now = Date.now()) {
  const exp = invite?.expiresAt?.toDate?.() ?? invite?.expiresAt;
  return exp ? new Date(exp).getTime() < now : false;
}

// id and date stay in the clear: the id is the doc key, and the date is what the
// security rules and ordering work on without the key. Everything else rides
// inside `enc`. No key (local-only space, or a space created before E2EE) means
// the entry goes up as plaintext, which is what the legacy docs look like.
export async function encodeDateDoc(key, entry) {
  const clean = JSON.parse(JSON.stringify(entry));
  if (!key) return clean;
  const { id, date, ...rest } = clean;
  return { id, date, enc: await e2ee.encryptJSON(key, rest) };
}

export async function decodeDateDoc(key, doc) {
  if (!doc?.enc) return doc;             // plaintext (pre-E2EE) docs pass through
  if (!key) return { id: doc.id, date: doc.date, title: LOCKED_NO_KEY };
  try {
    return { id: doc.id, date: doc.date, ...(await e2ee.decryptJSON(key, doc.enc)) };
  } catch {
    return { id: doc.id, date: doc.date, title: LOCKED_BAD_KEY };
  }
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataUrl) {
  // Decode directly rather than fetch(dataUrl) — the app's CSP connect-src does
  // not allow data:, so fetching a data URL throws "Failed to fetch".
  const [head, b64] = dataUrl.split(",");
  const mime = head.slice(5, head.indexOf(";")); // "data:<mime>;base64"
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
