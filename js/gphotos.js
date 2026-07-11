// Google Photos Picker API integration — lets the user pick cloud-only photos
// that the plain <input type="file"> picker can't see.
// Loaded on demand from ui.js (same lazy pattern as sync.js). Flow:
//   OAuth token (Google Identity Services) → POST /sessions → user picks in the
//   Google Photos UI (pickerUri tab) → poll session until mediaItemsSet →
//   list picked items → download bytes via the worker proxy (googleusercontent
//   requires an Authorization header and serves no CORS headers).
import { GP_CLIENT_ID, GP_PROXY } from "./gphotos-config.js";

const API = "https://photospicker.googleapis.com/v1";
const SCOPE = "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

// window.__gpClientId is a test hook (like ?emu=1 in sync.js) so the smoke test
// can run the full pipeline against stubbed Google endpoints.
const clientId = () => window.__gpClientId || GP_CLIENT_ID;
export const isConfigured = () => !!clientId();

let token = null, tokenExp = 0;
let cancelled = false;
export function cancelPick() { cancelled = true; }

async function loadGIS() {
  if (window.google?.accounts?.oauth2) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = res;
    s.onerror = () => rej(new Error("Couldn't load Google sign-in"));
    document.head.appendChild(s);
  });
}

async function getToken() {
  if (token && Date.now() < tokenExp) return token;
  await loadGIS();
  return new Promise((res, rej) => {
    window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: r => {
        if (r.error) return rej(new Error(r.error));
        token = r.access_token;
        tokenExp = Date.now() + (r.expires_in - 60) * 1000;
        res(token);
      },
      error_callback: e => rej(new Error(e?.message || "Google sign-in cancelled")),
    }).requestAccessToken();
  });
}

async function api(path, tok, init = {}) {
  const r = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`Google Photos error ${r.status}`);
  return r.json();
}

// pollingConfig durations arrive as seconds strings like "5s" / "3.5s".
function parseMs(s) { const m = /^([\d.]+)s$/.exec(s || ""); return m ? +m[1] * 1000 : 0; }

// Opens the Google Photos picker. Calls await onBlob(blob) for each picked
// image and onStatus(text) with progress. Resolves to the number delivered.
// ponytail: no in-app cancel button — cancelPick() fires when the log sheet
// closes, and an abandoned pick just times out with the session's timeoutIn.
export async function pickFromGooglePhotos(onBlob, onStatus = () => {}) {
  cancelled = false;
  onStatus("Signing in to Google…");
  const tok = await getToken();
  const session = await api("/sessions", tok, { method: "POST" });
  window.open(session.pickerUri, "_blank");

  onStatus("Finish picking in Google Photos, then come back…");
  const every = Math.max(1000, parseMs(session.pollingConfig?.pollInterval) || 3000);
  const deadline = Date.now() + (parseMs(session.pollingConfig?.timeoutIn) || 20 * 60 * 1000);
  let done = false;
  while (!done) {
    if (cancelled) { cleanup(session.id, tok); return 0; }
    if (Date.now() > deadline) { cleanup(session.id, tok); throw new Error("Google Photos pick timed out"); }
    await new Promise(r => setTimeout(r, every));
    done = (await api(`/sessions/${session.id}`, tok)).mediaItemsSet;
  }

  let n = 0, pageToken = "";
  do {
    const page = await api(
      `/mediaItems?sessionId=${session.id}&pageSize=25${pageToken ? `&pageToken=${pageToken}` : ""}`, tok);
    for (const item of page.mediaItems || []) {
      if (item.type !== "PHOTO" || !item.mediaFile?.baseUrl) continue; // videos unsupported
      onStatus(`Downloading photo ${n + 1}…`);
      const r = await fetch(`${GP_PROXY}?u=${encodeURIComponent(item.mediaFile.baseUrl + "=w2048")}`,
        { headers: { Authorization: `Bearer ${tok}` } });
      if (!r.ok) throw new Error("Photo download failed");
      await onBlob(await r.blob());
      n++;
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken && !cancelled);

  cleanup(session.id, tok);
  return n;
}

function cleanup(id, tok) {
  fetch(`${API}/sessions/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } }).catch(() => {});
}
