// Cloudflare Worker: relays a "new date" push to a partner's device(s) via FCM.
//
// Why this exists: the Firebase project is on the free Spark plan (no Cloud
// Functions), so nothing server-side can watch Firestore and send a push. Instead
// the sender's own phone POSTs here right after saving a date, and this worker
// forwards it to FCM. Free tier all the way down.
//
// Deploy: `cd worker && npx wrangler deploy` (imports verify-token.js, so the
// dashboard paste-in-editor flow no longer works — wrangler bundles it).
// Bindings (Settings → Variables and Secrets):
//   FCM_SERVICE_ACCOUNT (secret)    the service-account JSON from Firebase console
//                                   (Project settings → Service accounts → Generate key)
//   ALLOWED_ORIGIN       (plaintext) your app URL, e.g. https://tzoororg.github.io
//
// Auth: the caller must send `Authorization: Bearer <Firebase ID token>`. The
// token is verified (see verify-token.js) against the service account's own
// project_id, then the worker looks up the caller's space membership in
// Firestore directly and only pushes to that space's OTHER members' tokens —
// clients can no longer supply arbitrary tokens/text (closes the open relay).

import { verifyIdToken } from "./verify-token.js";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FS_SCOPE = "https://www.googleapis.com/auth/datastore";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);

    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    let uid;
    try {
      const claims = await verifyIdToken(idToken, sa.project_id);
      uid = claims.sub;
    } catch (e) {
      return json({ error: "unauthorized", detail: String(e.message || e) }, 401, cors);
    }

    let payload;
    try { payload = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }
    const spaceId = String(payload.spaceId || "");
    if (!spaceId) return json({ error: "missing spaceId" }, 400, cors);

    let access;
    try { access = await getAccessToken(sa, `${FCM_SCOPE} ${FS_SCOPE}`); }
    catch (e) { return json({ error: "auth failed", detail: String(e).slice(0, 200) }, 502, cors); }

    let members;
    try { members = await listMembers(access, sa.project_id, spaceId); }
    catch (e) { return json({ error: "firestore error", detail: String(e).slice(0, 200) }, 502, cors); }

    if (!members.some(m => m.uid === uid)) return json({ error: "forbidden" }, 403, cors);

    const tokens = members.filter(m => m.uid !== uid && m.fcmToken).map(m => m.fcmToken);
    if (!tokens.length) return json({ sent: 0, results: [] }, 200, cors);

    // Notification text is fixed server-side — clients no longer control it.
    const title = "New date ♥";
    const body = "Your partner added a date";
    const link = "./";

    const results = await Promise.all(
      tokens.map(token => sendOne(access, sa.project_id, token, title, body, link))
    );
    return json({ sent: results.filter(r => r.ok).length, results }, 200, cors);
  },
};

// GET the members subcollection via the Firestore REST API and pull uid (last
// path segment of each doc name) + fcmToken out of the raw field encoding.
async function listMembers(access, projectId, spaceId) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/spaces/${encodeURIComponent(spaceId)}/members`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error("firestore " + res.status + " " + (await res.text()).slice(0, 200));
  const data = await res.json();
  const docs = data.documents || [];
  return docs.map(d => ({
    uid: d.name.split("/").pop(),
    fcmToken: d.fields?.fcmToken?.stringValue || null,
  }));
}

async function sendOne(access, projectId, token, title, body, link) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${access}`, "Content-Type": "application/json" },
    // data.link is read by our own service worker's notificationclick handler.
    // (We don't use fcm_options.link — FCM requires an absolute HTTPS URL there.)
    body: JSON.stringify({
      message: { token, webpush: { notification: { title, body }, data: { link } } },
    }),
  });
  if (res.ok) return { ok: true };
  const detail = (await res.text()).slice(0, 200);
  return { ok: false, status: res.status, detail };
}

// ---- FCM/Firestore OAuth (service-account JWT → access token) ----

let cachedToken = null; // { token, exp, scope } — isolate-local
// ponytail: isolate-local token cache; re-mints if the isolate recycles — fine at this volume.
async function getAccessToken(sa, scope) {
  if (cachedToken && cachedToken.scope === scope && cachedToken.exp > Date.now() + 60000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const jwt = await signJwt(
    { iss: sa.client_email, scope, aud: tokenUri, iat: now, exp: now + 3600 },
    sa.private_key
  );
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error("oauth " + res.status + " " + (await res.text()).slice(0, 200));
  const data = await res.json();
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000, scope };
  return cachedToken.token;
}

// Exported for worker/push-worker.test.js.
export async function signJwt(claim, pem) {
  const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc(claim)}`;
  const key = await importPrivateKey(pem);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

function importPrivateKey(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
