// Self-check for the one piece of non-trivial logic in push-worker.js: the RS256
// JWT signing that authenticates to FCM. Run: node worker/push-worker.test.js
// (needs Node 20+ for global crypto.subtle). Asserts the JWT has 3 segments, an
// RS256 header, and a signature that actually verifies against the public key.

import assert from "node:assert";
import { signJwt } from "./push-worker.js";

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
