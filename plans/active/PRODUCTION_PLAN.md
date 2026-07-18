# Production Hardening Plan

Goal: from "private app for one couple" to "publishable on app stores for general users".
Findings from a code audit on 2026-07-17 (firestore.rules, sync.js, both workers, ui.js).
Excludes features/UI (planned elsewhere). Ordered by severity within each section.

## 1. Security

### 1.1 Invite codes are joinable by anyone, forever, by anyone who learns/guesses one — HIGH
Current rules: any signed-in user can read any `invites/{code}`; expiry is checked
**client-side only** (`sync.js joinSpace`); the invite is never consumed after use; there is
no member cap. A stranger with (or brute-forcing) a code joins a couple's space and reads
their entire history, including photos.

- [ ] Enforce `expiresAt > request.time` in the member-create rule (server-side expiry).
- [ ] Cap membership at 2: member-create also requires the members collection to have < 2 docs
      (rules can't count; store `memberCount` on the space doc and increment transactionally,
      or write member uids into the space doc itself).
- [ ] Invalidate the invite on join: allow the joiner to delete the invite doc; delete it in
      `joinSpace` after the member doc lands.
- [ ] Restrict invite read to exact-id `get` semantics is not possible in rules — instead
      lengthen codes to 8 chars (32^8 ≈ 1.1e12) to make brute force impractical, and enable
      Firebase App Check to keep non-app clients out entirely.
- [ ] Add `allow delete` for expired invites (or a TTL policy via Firestore TTL field).

### 1.2 Feedback worker: public key + repo-write PAT — HIGH
`FEEDBACK_KEY` ships in the client (by design, documented as not-a-secret), but the worker's
PAT has **Contents RW on the app repo, which is also the GitHub Pages deployment**. Anyone
who extracts the key can commit arbitrary files into `feedback-assets/` on the default
branch — i.e. host arbitrary content on the app's own domain — and spam issues.

- [ ] Move feedback photos out of the app repo: separate assets-only repo (PAT scoped to it),
      so the deployed site can never be written through this path.
- [ ] Drop Contents scope from the app-repo PAT; keep Issues only.
- [ ] Require a Firebase Auth ID token in the request and verify it in the worker
      (JWKS verify, no SDK needed) — replaces the shared key for signed-in users.
- [ ] Add a Cloudflare rate-limiting rule on the worker route (e.g. 5 req/min/IP).
- [ ] Validate `photoBase64` is a JPEG and cap its decoded size explicitly.

### 1.3 Push worker is an open FCM relay — MEDIUM
`PUSH_KEY` also ships in the client, so anyone can send arbitrary-text notifications to any
FCM token they obtain (tokens leak in logs, backups, etc.). The `ponytail:` comment in the
worker already names the upgrade path.

- [ ] Verify a Firebase ID token in the worker; require the sender to be a member of the
      space (worker holds the service account — one Firestore REST `get` on the member doc).
- [ ] Look up partner tokens server-side from the members subcollection instead of trusting
      client-supplied tokens; fix the notification text server-side too.
- [ ] Rate-limit the route.

### 1.4 Firestore write validation — MEDIUM
`dates` and `photos` writes have no schema/size validation: a compromised or buggy member
client can write arbitrary junk, oversized docs, or clobber fields.

- [ ] Rules: validate date docs (required keys, `id == dateId`, string length caps on
      title/notes/location, enjoyment/effort in 1–5, photos is a list of strings).
- [ ] Rules: photo docs limited to `{data, mime, createdAt}`, `data` is a string
      (Firestore's 1 MiB cap already bounds size).

### 1.5 XSS via partner-synced strings — MEDIUM
`escHtml`/`escAttr` exist and spot checks pass, but with sync the partner's device is a
trust boundary: a malicious/compromised partner client can put HTML in title/notes/location
and it renders on your phone. 49 `innerHTML` sites in ui.js.

- [ ] One-time audit of every `innerHTML` site: every interpolated user/partner/cloud string
      goes through `escHtml`/`escAttr` (include charts.js labels and the invite-code display).
- [ ] Add a smoke-test entry whose title/notes/location are `<img src=x onerror=...>` strings
      and assert no script execution / correct escaping in rendered DOM.
- [ ] Add a CSP `<meta>` tag: `default-src 'self'; script-src 'self' https://www.gstatic.com;
      connect-src 'self' https://*.googleapis.com https://*.firebaseio.com
      https://*.workers.dev; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'`
      (tune against the real network map; verify sign-in popup + FCM still work).

### 1.6 Firebase project hardening — MEDIUM
- [ ] Enable **App Check** (reCAPTCHA v3 / Play Integrity / App Attest per platform) on
      Firestore + Auth — the single biggest lever against non-app abuse of the public config.
- [ ] Restrict the web API key (HTTP referrer allowlist) in Google Cloud console.
- [ ] Lock Auth to the Google provider only; disable anonymous sign-in in production
      (it's only needed under `?emu=1`, which the emulator handles).
- [ ] Review that `?emu=1` is harmless in prod (it points at localhost — it is, but confirm
      it can't be combined with anything).

## 2. First-run setup

Current flow (solo): open URL → optionally install PWA → start logging. Zero-config — good.
Current flow (couple sync): ⋯ menu → sync → Google popup → create space → read 6-char code
aloud → partner: sign in → enter code. ~4 taps per person plus code exchange — acceptable,
but has production gaps:

- [ ] **Google OAuth consent screen verification.** The project is almost certainly in
      "Testing" mode: 100-user cap and 7-day refresh-token expiry (users get silently signed
      out weekly). Must submit for verification before general users.
- [ ] `signInWithPopup` breaks in many webviews/wrapped contexts (TWA is OK, iOS wrappers
      often not). Add `signInWithRedirect` fallback; test inside the actual store wrappers.
- [ ] Invite-code recovery: code expires in 7 days and there's no "regenerate code" flow if
      pairing didn't happen in time. Add regenerate (and show remaining validity).
- [ ] First-run explainer: one screen stating "data stays on this phone unless you turn on
      sync" — doubles as the store-reviewer-friendly privacy statement.
- [ ] `navigator.storage.persist()` on first run (see 3.1).

## 3. Storage, hosting, and the admin question

### 3.1 Local-only users can silently lose everything — HIGH
IndexedDB is evictable under storage pressure ("best-effort" bucket). For a general user
whose only copy of years of memories is local, browser eviction = total loss.

- [ ] Call `navigator.storage.persist()` at first write; surface the result.
- [ ] Show storage usage (`navigator.storage.estimate()`) in settings.
- [ ] Nudge toward the existing JSON export (periodic "you haven't backed up in N months"
      reminder) or toward enabling sync.

### 3.2 Spark plan cannot serve general users — HIGH (blocker for launch)
Base64 photos in Firestore: ~900 KB/photo against a **1 GiB total** Firestore quota ≈ ~1,100
photos across *all* users, and 50k reads/day is easy to blow because `attachSpace` snapshots
the entire `dates` collection on every app open.

- [ ] Move to the Blaze plan before public launch; set a billing budget + alert.
- [ ] Migrate photos to Cloud Storage (upload/download path + `storage.rules` are preserved
      in git history per CLAUDE.md); keep base64 docs as a read-fallback during migration.
- [ ] **Enable Firestore persistent local cache** (`persistentLocalCache` in the SDK init in
      sync.js) at the same time as the Blaze migration. `attachSpace` snapshots the whole
      `dates` collection on every app open; without the cache every doc bills as a read every
      time (~$25–45/mo at 1,000 couples with multi-year histories). With it, only changed
      docs bill — the dominant variable cost drops ~99%. This makes an `updatedAt`-cursor
      delta sync unnecessary; revisit only if cache misses show up in billing.
- [ ] Cost model sanity check: photos are the only real storage cost, ~1–3 cents per couple
      per year (downscaled ~300 KB, egress once per photo per partner — IndexedDB caches
      forever after). Costs scale linearly with couples; no cliff. Fixed costs are the store
      fees (Play $25 once, Apple $99/yr), not infrastructure.

### 3.3 Admin access to user data → end-to-end encryption (decided: yes, before launch)
Today the Firebase project owner can read every couple's dates, notes, and photos in
plaintext from the console. Decision: ship client-side E2EE so the operator sees only
ciphertext — this is also the best possible answer on the store data-safety forms
("we cannot read your data"). Must land **before** launch: retrofitting E2EE after general
users have plaintext data is far harder than the migration below.

Design (all WebCrypto, no dependencies, fits the no-build-step constraint):
- [ ] Key generation: on `createSpace`, generate a random AES-256-GCM key on-device.
- [ ] Key exchange rides the pairing flow, never touching the server: append the key
      (base64) to the invite code itself, so the combined code transfers phone-to-phone
      (spoken/pasted/QR). The server-stored invite doc keeps only the spaceId — zero
      knowledge of the key. Hide the longer code behind a share-link/QR flow.
- [ ] Encrypt before Firestore: title, notes, location, mood, and photo bytes. Keep
      plaintext: id, date, category, enjoyment/effort, wouldRepeat (needed nowhere
      server-side today, but cheap to encrypt too — default to encrypting everything except
      id/date; timestamps and doc counts remain visible metadata, disclose that).
- [ ] Key storage: IndexedDB settings (local-only, never routed to cloud — the existing
      settings path already guarantees this).
- [ ] Recovery story: lost key = lost cloud data. The existing JSON export (plaintext,
      on-device) is the backup; add an "export reminder" nudge (see 3.1) and show the key
      as a recovery phrase the couple can store.
- [ ] Migration for existing plaintext spaces: client re-writes every doc encrypted, then
      deletes plaintext versions (both partners must update first — gate on an app-version
      field in the space doc).
- [ ] Privacy policy then states: content is end-to-end encrypted; operators can see only
      entry counts, timestamps, and space membership. Console access still restricted to
      one 2FA-protected account.

## 4. Store submission requirements

- [ ] **Privacy policy** page (host on the Pages site) — required by both stores and by
      Google OAuth verification.
- [ ] **Account deletion** (Play policy, hard requirement): in-app flow that deletes the
      auth user, their member doc, their space content (if last member), and local data.
      Current `wipeAll` deletes dates but leaves member docs/space/auth user. Also requires
      a web-reachable deletion path/instructions URL for the Play form.
- [ ] Play data-safety form / Apple privacy nutrition labels (answers fall out of 3.3).
- [ ] Packaging: Android = TWA via Bubblewrap + `assetlinks.json` on the Pages domain;
      iOS = per ../done/IOS_PLAN.md. Verify Google sign-in, FCM push, camera/photo access, and the
      Google Photos picker inside each wrapper — webview behavior differs from Chrome.
- [ ] Support contact + terms of service page (short).
- [ ] Test push permission prompts in wrappers (Android 13+ runtime notification permission).

## 5. Operations

- [ ] **Client error reporting**: none exists. Minimal version: `window.onerror` /
      `unhandledrejection` → POST to the existing feedback worker with a distinct label,
      rate-limited client-side. No Sentry needed yet.
- [ ] **Backups**: Spark has no Firestore backups. On Blaze, enable scheduled Firestore
      exports to a GCS bucket (or point-in-time recovery).
- [ ] **Uptime/abuse visibility**: Cloudflare worker analytics are already there; add a
      Firebase usage-alert (reads/writes) so quota exhaustion doesn't look like an outage.
- [ ] **Kill switch / min-version**: a tiny `version.json` fetched at boot lets you force-
      refresh clients past a bad SW cache or disable sync in an incident. (Cheap; decide.)

## Suggested order

1. Blockers with security teeth: 1.1 (invite rules), 1.2 (feedback worker PAT), 3.1
   (storage persistence) — small, do now.
2. Launch blockers: 3.2 (Blaze + Cloud Storage), 2 (OAuth verification, sign-in in
   wrappers), 4 (policy pages, account deletion, packaging).
3. Launch blocker (decided): 3.3 E2EE — must ship before general users have plaintext data.
4. Hardening: 1.3–1.6, 5.
