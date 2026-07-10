// Cloudflare Worker: relays a "new date" push to a partner's device(s) via FCM.
//
// Why this exists: the Firebase project is on the free Spark plan (no Cloud
// Functions), so nothing server-side can watch Firestore and send a push. Instead
// the sender's own phone POSTs here right after saving a date, and this worker
// forwards it to FCM. Free tier all the way down.
//
// Deploy: dash.cloudflare.com → Workers & Pages → Create Worker → paste this file.
// Bindings (Settings → Variables and Secrets):
//   FCM_SERVICE_ACCOUNT (secret)    the service-account JSON from Firebase console
//                                   (Project settings → Service accounts → Generate key)
//   PUSH_KEY            (secret)    shared anti-abuse key; if set, requests must send
//                                   it in the x-push-key header (matches push-config.js)
//   ALLOWED_ORIGIN      (plaintext) your app URL, e.g. https://tzoororg.github.io
//
// ponytail: relays to client-supplied tokens gated by a shared key — fine for a
// private 2-person app. Upgrade path: verify a Firebase ID token if abuse matters.

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-push-key",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);
    if (env.PUSH_KEY && request.headers.get("x-push-key") !== env.PUSH_KEY) {
      return json({ error: "forbidden" }, 403, cors);
    }

    let payload;
    try { payload = await request.json(); } catch { return json({ error: "bad json" }, 400, cors); }

    const tokens = Array.isArray(payload.tokens) ? payload.tokens.filter(t => typeof t === "string" && t) : [];
    if (!tokens.length) return json({ error: "no tokens" }, 400, cors);
    const title = String(payload.title || "New date ♥").slice(0, 100);
    const body = String(payload.body || "Your partner added a date").slice(0, 200);
    const link = String(payload.link || "./").slice(0, 300);

    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
    let access;
    try { access = await getAccessToken(sa); }
    catch (e) { return json({ error: "auth failed", detail: String(e).slice(0, 200) }, 502, cors); }

    // Best-effort per token; a dead/unregistered token doesn't fail the others.
    const results = await Promise.all(
      tokens.map(token => sendOne(access, sa.project_id, token, title, body, link))
    );
    return json({ sent: results.filter(r => r.ok).length, results }, 200, cors);
  },
};

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

// ---- FCM OAuth (service-account JWT → access token) ----

let cachedToken = null; // { token, exp } — isolate-local
// ponytail: isolate-local token cache; re-mints if the isolate recycles — fine at this volume.
async function getAccessToken(sa) {
  if (cachedToken && cachedToken.exp > Date.now() + 60000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const jwt = await signJwt(
    { iss: sa.client_email, scope: SCOPE, aud: tokenUri, iat: now, exp: now + 3600 },
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
  cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in - 60) * 1000 };
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
