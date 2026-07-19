// Self-check for verify-token.js: rejects bad alg, bad aud, expired tokens, and
// accepts a well-formed one, using a locally generated RSA key + injected JWKS
// (no network). Run: node worker/verify-token.test.js

import assert from "node:assert";
import { verifyIdToken, __setJwksForTest } from "./verify-token.js";

const PROJECT_ID = "test-project";
const kp = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"]
);
__setJwksForTest(new Map([["k1", kp.publicKey]]));

const b64url = bytes => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function makeToken({ alg = "RS256", kid = "k1", aud = PROJECT_ID, iss = `https://securetoken.google.com/${PROJECT_ID}`, exp = Math.floor(Date.now() / 1000) + 3600, sub = "uid-1", key = kp.privateKey } = {}) {
  const header = { alg, kid, typ: "JWT" };
  const payload = { sub, aud, iss, exp };
  const enc = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64url(new Uint8Array(sig))}`;
}

// valid token
{
  const token = await makeToken();
  const payload = await verifyIdToken(token, PROJECT_ID);
  assert.equal(payload.sub, "uid-1", "valid token accepted, sub returned");
}

// bad alg
{
  const token = await makeToken({ alg: "HS256" });
  await assert.rejects(() => verifyIdToken(token, PROJECT_ID), /alg/, "bad alg rejected");
}

// bad aud
{
  const token = await makeToken({ aud: "someone-else" });
  await assert.rejects(() => verifyIdToken(token, PROJECT_ID), /aud/, "bad aud rejected");
}

// expired
{
  const token = await makeToken({ exp: Math.floor(Date.now() / 1000) - 10 });
  await assert.rejects(() => verifyIdToken(token, PROJECT_ID), /expired/, "expired token rejected");
}

// bad signature (signed with a different key)
{
  const otherKp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"]
  );
  const token = await makeToken({ key: otherKp.privateKey });
  await assert.rejects(() => verifyIdToken(token, PROJECT_ID), "bad signature rejected");
}

console.log("verify-token: ok");
