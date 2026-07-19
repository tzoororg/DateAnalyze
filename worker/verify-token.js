// Shared Firebase ID-token verification for both workers. Verifies a Firebase
// Auth ID token (RS256 JWT) using Google's public JWKs for the securetoken
// issuer — no Firebase Admin SDK needed (Workers can't run it anyway).

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let jwksCache = null; // { keys: Map<kid, CryptoKey>, fetchedAt }
// ponytail: module-local cache, isolate-local TTL; re-fetches if the isolate
// recycles. Fine at this traffic — upgrade to KV/Cache API if it ever matters.
const JWKS_TTL_MS = 3600_000;

async function getJwks() {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error("jwks fetch failed: " + res.status);
  const { keys } = await res.json();
  const map = new Map();
  for (const jwk of keys) {
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    map.set(jwk.kid, key);
  }
  jwksCache = { keys: map, fetchedAt: Date.now() };
  return map;
}

function b64urlToBytes(s) {
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}

// Verifies a Firebase Auth ID token; returns the decoded payload (with `sub` =
// uid) on success, throws on any validation failure.
export async function verifyIdToken(idToken, projectId) {
  if (!idToken || typeof idToken !== "string") throw new Error("missing token");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));

  if (header.alg !== "RS256") throw new Error("bad alg");
  if (payload.aud !== projectId) throw new Error("bad aud");
  if (payload.iss !== "https://securetoken.google.com/" + projectId) throw new Error("bad iss");
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error("expired");
  if (!payload.sub) throw new Error("missing sub");

  const keys = await getJwks();
  const key = keys.get(header.kid);
  if (!key) throw new Error("unknown kid");

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5", key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  );
  if (!ok) throw new Error("bad signature");

  return payload;
}

// Test-only hook: inject a fake JWKS map so tests can verify tokens signed
// with a locally generated key pair, without a network call.
export function __setJwksForTest(map) { jwksCache = { keys: map, fetchedAt: Date.now() }; }
