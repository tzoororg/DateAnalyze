// Cloudflare Worker: receives in-app feedback and opens a labeled GitHub issue.
//
// Deploy: `cd worker && npx wrangler deploy` (imports verify-token.js, so the
// dashboard paste-in-editor flow no longer works — wrangler bundles it).
// Bindings (Settings → Variables and Secrets):
//   GITHUB_TOKEN       (secret)     fine-grained PAT, repo DateAnalyze, Issues-only RW
//                                   (no Contents scope anymore — photos go to ASSET_REPO)
//   ASSET_REPO         (plaintext)  separate repo for feedback photos, e.g.
//                                   "tzoororg/DateAnalyze-feedback-assets". If unset
//                                   (or ASSET_TOKEN unset), photos are skipped.
//   ASSET_TOKEN        (secret)     fine-grained PAT scoped to ASSET_REPO, Contents RW only
//   ALLOWED_ORIGIN     (plaintext)  your app URL, e.g. https://tzoororg.github.io
//   FEEDBACK_KEY       (secret)     OPTIONAL shared key; if set, requests without a
//                                   valid Authorization token must send it in the
//                                   x-feedback-key header (must match the client).
//   FIREBASE_PROJECT_ID(plaintext) OPTIONAL; enables the Authorization: Bearer <idToken>
//                                   path, which bypasses FEEDBACK_KEY for signed-in
//                                   (cloud-sync) users and tags the issue with their uid.
//
// The issue number returned is the "serial" the user references in Claude Code.

import { verifyIdToken } from "./verify-token.js";

const REPO = "tzoororg/DateAnalyze";
const LABEL = "feedback";
const ASSET_DIR = "feedback-assets";       // photos committed here on the asset repo's default branch
const MAX_BODY_BYTES = 8 * 1024 * 1024;    // ~8MB guard (photos are downscaled client-side)
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // decoded size ceiling for committed photos

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/gphoto") return gphotoProxy(request, url);

    const origin = env.ALLOWED_ORIGIN || "*";
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-feedback-key, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, cors);

    // Optional auth upgrade: a valid Firebase ID token bypasses FEEDBACK_KEY and
    // tags the issue with the caller's uid. Invalid token (present but bad) is a
    // hard 403; no token at all falls back to the FEEDBACK_KEY gate below.
    let uid = null;
    const authHeader = request.headers.get("Authorization") || "";
    if (authHeader.startsWith("Bearer ") && env.FIREBASE_PROJECT_ID) {
      try {
        const claims = await verifyIdToken(authHeader.slice(7), env.FIREBASE_PROJECT_ID);
        uid = claims.sub;
      } catch (e) {
        return json({ error: "unauthorized", detail: String(e.message || e) }, 403, cors);
      }
    } else if (env.FEEDBACK_KEY && request.headers.get("x-feedback-key") !== env.FEEDBACK_KEY) {
      return json({ error: "forbidden" }, 403, cors);
    }

    let payload;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413, cors);
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "bad json" }, 400, cors);
    }

    const text = (payload.text || "").toString().trim();
    if (!text) return json({ error: "empty" }, 400, cors);

    const gh = ghFetch(env.GITHUB_TOKEN); // Issues-only token now — never used for Contents.

    // 1) Optionally commit the photo to the separate asset repo, so it can be
    // embedded in the issue. GITHUB_TOKEN never touches Contents; a validated
    // JPEG under the size ceiling goes to ASSET_REPO via ASSET_TOKEN instead.
    let photoMd = "";
    if (payload.photoBase64 && env.ASSET_REPO && env.ASSET_TOKEN) {
      try {
        const base64 = String(payload.photoBase64).replace(/^data:[^;]+;base64,/, "");
        const decodedBytes = Math.floor(base64.length * 3 / 4);
        if (base64.startsWith("/9j/") && decodedBytes <= MAX_PHOTO_BYTES) {
          const assetGh = ghFetch(env.ASSET_TOKEN);
          const path = `${ASSET_DIR}/${crypto.randomUUID()}.jpg`;
          const put = await assetGh(`/repos/${env.ASSET_REPO}/contents/${path}`, {
            method: "PUT",
            body: JSON.stringify({
              message: `feedback photo ${path}`,
              content: base64,
            }),
          });
          if (put.ok) {
            const data = await put.json();
            const rawUrl = data.content?.download_url;
            if (rawUrl) photoMd = `\n\n![feedback photo](${rawUrl})`;
          }
        }
        // Invalid magic bytes, oversized, or a failed commit: skip the photo silently.
      } catch (_) { /* ignore photo errors */ }
    }

    // 2) Create the issue.
    const title = firstLine(text).slice(0, 60) || "App feedback";
    const meta = payload.meta || {};
    const uidFooter = uid ? ` · uid ${esc(uid)}` : "";
    const body =
      `**From in-app feedback**\n\n${text}${photoMd}\n\n` +
      `---\n` +
      `<sub>app ${esc(meta.appVersion)} · ${esc(meta.at)} · ${esc(meta.ua)}${uidFooter}</sub>`;

    const res = await gh(`/repos/${REPO}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body, labels: [LABEL] }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: "github error", status: res.status, detail }, 502, cors);
    }
    const issue = await res.json();
    return json({ number: issue.number, url: issue.html_url }, 201, cors);
  },
};

// Image relay for the Google Photos Picker API: googleusercontent requires an
// Authorization header and serves no CORS headers, so the app can't fetch picked
// photo bytes directly — it fetches them through here instead.
// ponytail: no extra auth gate — the caller must already hold a valid Google
// bearer token for their own photos, so the proxy adds no access it didn't have.
async function gphotoProxy(request, url) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "GET") return json({ error: "method not allowed" }, 405, cors);

  let target;
  try { target = new URL(url.searchParams.get("u")); } catch { return json({ error: "bad url" }, 400, cors); }
  if (target.protocol !== "https:" || !target.hostname.endsWith(".googleusercontent.com")) {
    return json({ error: "bad host" }, 400, cors);
  }
  const auth = request.headers.get("Authorization");
  if (!auth) return json({ error: "missing token" }, 401, cors);

  const res = await fetch(target, { headers: { Authorization: auth } });
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("Content-Type") || "image/jpeg", ...cors },
  });
}

function ghFetch(token) {
  return (path, init = {}) =>
    fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "User-Agent": "dateanalyze-feedback-worker",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
function firstLine(s) { return s.split("\n")[0].trim(); }
function esc(s) { return (s == null ? "" : String(s)).replace(/[<>]/g, ""); }
