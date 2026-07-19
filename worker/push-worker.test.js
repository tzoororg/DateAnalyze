// Self-check for push-worker.js: the RS256 JWT signing used to authenticate to
// FCM/Firestore, plus the request-handling flow (auth gate, membership check,
// fixed notification text). Run: node worker/push-worker.test.js
// (needs Node 20+ for global crypto.subtle).

import assert from "node:assert";
import worker, { signJwt } from "./push-worker.js";
import { __setJwksForTest } from "./verify-token.js";

// ---- signJwt: still exercised directly ----
const kp = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"]
);
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).toString("base64");
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;

const jwt = await signJwt({ iss: "svc@x", scope: "s", aud: "a", iat: 1, exp: 2 }, pem);
const parts = jwt.split(".");
assert.equal(parts.length, 3, "jwt has 3 segments");

const unb64 = s => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
assert.equal(JSON.parse(unb64(parts[0])).alg, "RS256", "header alg is RS256");

const ok = await crypto.subtle.verify(
  "RSASSA-PKCS1-v1_5", kp.publicKey,
  unb64(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
);
assert.ok(ok, "signature verifies against the public key");
console.log("push-worker signJwt: ok");

// ---- fetch handler: auth gate, membership check, fixed text ----
const PROJECT_ID = "test-project";
const b64url = bytes => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function makeIdToken(uid, { aud = PROJECT_ID, kid = "k1", key = kp } = {}) {
  const header = { alg: "RS256", kid, typ: "JWT" };
  const payload = { sub: uid, aud, iss: `https://securetoken.google.com/${aud}`, exp: Math.floor(Date.now() / 1000) + 3600 };
  const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key.privateKey, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

__setJwksForTest(new Map([["k1", kp.publicKey]]));

const sa = { project_id: PROJECT_ID, client_email: "svc@x", private_key: pem, token_uri: "https://oauth2.googleapis.com/token" };
const env = { FCM_SERVICE_ACCOUNT: JSON.stringify(sa), ALLOWED_ORIGIN: "https://example.com" };

function req(body, headers = {}) {
  return new Request("https://worker.example/", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// 1) missing token -> 401
{
  const res = await worker.fetch(req({ spaceId: "s1" }), env);
  assert.equal(res.status, 401, "missing token rejected");
}

// 2) invalid token -> 401
{
  const res = await worker.fetch(req({ spaceId: "s1" }, { Authorization: "Bearer garbage" }), env);
  assert.equal(res.status, 401, "invalid token rejected");
}

// 3) valid token but not a member -> 403 (mock fetch for oauth + firestore)
{
  const token = await makeIdToken("uid-outsider");
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "fake", expires_in: 3600 }), { status: 200 });
    }
    if (u.includes("firestore.googleapis.com")) {
      return new Response(JSON.stringify({
        documents: [
          { name: "projects/p/databases/(default)/documents/spaces/s1/members/uid-a", fields: { fcmToken: { stringValue: "tok-a" } } },
          { name: "projects/p/databases/(default)/documents/spaces/s1/members/uid-b", fields: { fcmToken: { stringValue: "tok-b" } } },
        ],
      }), { status: 200 });
    }
    return realFetch(url, init);
  };
  try {
    const res = await worker.fetch(req({ spaceId: "s1" }, { Authorization: `Bearer ${token}` }), env);
    assert.equal(res.status, 403, "non-member rejected");
  } finally { globalThis.fetch = realFetch; }
}

// 4) valid member -> sends fixed text to the OTHER members' tokens only
{
  const token = await makeIdToken("uid-a");
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "fake", expires_in: 3600 }), { status: 200 });
    }
    if (u.includes("firestore.googleapis.com")) {
      return new Response(JSON.stringify({
        documents: [
          { name: "projects/p/databases/(default)/documents/spaces/s1/members/uid-a", fields: { fcmToken: { stringValue: "tok-a" } } },
          { name: "projects/p/databases/(default)/documents/spaces/s1/members/uid-b", fields: { fcmToken: { stringValue: "tok-b" } } },
        ],
      }), { status: 200 });
    }
    if (u.includes("fcm.googleapis.com")) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({}), { status: 200 });
    }
    return realFetch(url, init);
  };
  try {
    const res = await worker.fetch(req({ spaceId: "s1" }, { Authorization: `Bearer ${token}` }), env);
    const data = await res.json();
    assert.equal(res.status, 200, "member request succeeds");
    assert.equal(data.sent, 1, "sends to exactly one (the other) member");
    assert.equal(sent.length, 1, "one FCM call made");
    assert.equal(sent[0].message.token, "tok-b", "only the partner's token, not the caller's");
    assert.equal(sent[0].message.webpush.notification.title, "New date ♥", "fixed title");
    assert.equal(sent[0].message.webpush.notification.body, "Your partner added a date", "fixed body");
  } finally { globalThis.fetch = realFetch; }
}

console.log("push-worker fetch handler: ok");
