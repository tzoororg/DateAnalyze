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

- [x] Enforce `expiresAt > request.time` in the member-create rule (server-side expiry).
- [x] Cap membership at 2: implemented via one-time invite consumption instead of a
      `memberCount` counter — the invite-update rule only allows `usedBy` to go from absent
      to the joiner's uid once, and the member-create rule requires that same-batch
      consumption (`getAfter`), so a second joiner's batch always fails (invite already has
      `usedBy`). No counter field needed.
- [x] Invalidate the invite on join: `joinSpace` best-effort deletes the invite doc after the
      batch commits (wrapped in try/catch — deletion is now also allowed by rules for the
      creator/expired/used cases regardless).
- [x] Lengthened invite codes to 8 chars (32^8 ≈ 1.1e12); `invites/{code}` now only allows
      `get`, not `list`, closing enumeration. App Check is still open (see 1.6).
- [x] Added `allow delete` for creator / expired / already-used invites.

### 1.2 Feedback worker: public key + repo-write PAT — HIGH
`FEEDBACK_KEY` ships in the client (by design, documented as not-a-secret), but the worker's
PAT has **Contents RW on the app repo, which is also the GitHub Pages deployment**. Anyone
who extracts the key can commit arbitrary files into `feedback-assets/` on the default
branch — i.e. host arbitrary content on the app's own domain — and spam issues.

- [x] Move feedback photos out of the app repo: `ASSET_REPO` + `ASSET_TOKEN` (separate PAT)
      — the deployed site can no longer be written through this path.
- [x] Drop Contents scope from the app-repo PAT (`GITHUB_TOKEN`); Issues-only now.
- [x] Optional Firebase Auth ID token path (JWKS verify via `worker/verify-token.js`, no SDK)
      — bypasses `FEEDBACK_KEY` for signed-in users and tags the issue with their uid.
- [ ] Add a Cloudflare rate-limiting rule on the worker route (e.g. 5 req/min/IP) — console-only,
      see deploy checklist below.
- [x] Validate `photoBase64` is a JPEG (magic-byte check) and cap decoded size at 1.5 MB.

### 1.3 Push worker is an open FCM relay — MEDIUM
`PUSH_KEY` also ships in the client, so anyone can send arbitrary-text notifications to any
FCM token they obtain (tokens leak in logs, backups, etc.). The `ponytail:` comment in the
worker already names the upgrade path.

- [x] Verify a Firebase ID token in the worker; require the sender to be a member of the
      space (worker holds the service account — one Firestore REST list on the members
      subcollection, matched against the verified caller uid).
- [x] Look up partner tokens server-side from the members subcollection instead of trusting
      client-supplied tokens; notification text is now fixed server-side (title/body/link).
      `PUSH_KEY` removed entirely (client and worker).
- [ ] Rate-limit the route — console-only, see deploy checklist below.

### 1.4 Firestore write validation — MEDIUM
`dates` and `photos` writes have no schema/size validation: a compromised or buggy member
client can write arbitrary junk, oversized docs, or clobber fields.

- [x] Rules: validate date docs (required keys via `hasOnly`, `id == dateId`, string length
      caps on title/notes/location, enjoyment/effort in 1–5 when present, photos a list,
      legacy numeric `mood` still allowed).
- [x] Rules: photo docs limited to `{data, mime, createdAt}`, `data`/`mime` are strings
      (Firestore's 1 MiB cap already bounds size).

### 1.5 XSS via partner-synced strings — MEDIUM
`escHtml`/`escAttr` exist and spot checks pass, but with sync the partner's device is a
trust boundary: a malicious/compromised partner client can put HTML in title/notes/location
and it renders on your phone. 49 `innerHTML` sites in ui.js.

- [x] One-time audit of every `innerHTML` site (2026-07-20): text sinks were already escaped
      (charts.js labels, invite code/email via `textContent`). Real gap found and fixed:
      wishlist `url` allowed `javascript:` hrefs — new `safeUrl()` scheme allowlist in ui.js.
      Also wrapped all cloud-sourced id/category `data-*` attributes in `escAttr` (defense
      in depth vs a hostile partner client).
- [x] Smoke test 9g: seeds `<img src=x onerror=...>` in title/notes/location + a
      `javascript:` wishlist URL; asserts no execution, literal-text rendering, href → `#`.
- [x] CSP `<meta>` added to index.html, tuned to the real network map (gstatic +
      accounts.google.com script-src; googleapis/firebaseapp/workers.dev/frankfurter +
      emulator ports connect-src; frame-src for the Auth popup iframe; blob:/data: images;
      base-uri 'self'; object-src 'none'). Inline theme script extracted to
      `js/theme-boot.js` (added to SW SHELL). Smoke suite clean, no CSP violations.
      **Runtime sign-in check done 2026-07-20 (real beta Google sign-in w/ DevTools):
      found a blocker — Firebase Auth loads `https://apis.google.com/js/api.js` during
      Google sign-in, which the CSP `script-src` blocked → `auth/internal-error`, sign-in
      fully broken for any fresh session. Fixed: added `https://apis.google.com` to
      `script-src` and `frame-src`. No `unsafe-eval` refusals observed. (The `.map`
      connect-src violations to www.gstatic.com are harmless source-map fetches, left as-is.)
      Existing users didn't hit this because their session persisted from before the CSP
      shipped; it blocks all new-user onboarding — hence a launch blocker, not cosmetic.**

### 1.7 Deploy checklist (manual/console steps remaining after §1.1–1.4 code changes)

The rules and worker code for 1.1–1.4 are implemented and test-covered (`test/sync.mjs`,
`worker/push-worker.test.js`, `worker/verify-token.test.js`). Still needed by hand before
this is live in production:

- [ ] Create the assets-only GitHub repo (e.g. `tzoororg/DateAnalyze-feedback-assets`) and a
      fine-grained PAT scoped to it with Contents RW only.
- [ ] Set worker vars/secrets on `dateanalyze-feedback`: `ASSET_REPO` (plaintext),
      `ASSET_TOKEN` (secret, the new PAT above), `FIREBASE_PROJECT_ID` (plaintext, enables
      the ID-token path). Re-scope `GITHUB_TOKEN` to Issues-only (drop Contents).
- [ ] Both workers now import `worker/verify-token.js`, so they must be deployed with
      `cd worker && npx wrangler deploy` instead of the dashboard paste-in-editor flow.
      `PUSH_KEY` secret can be removed from `dateanalyze-push` (no longer read).
- [ ] Add a Cloudflare rate-limiting rule on both worker routes (e.g. 5 req/min/IP) —
      not implemented in code, console/WAF-level control.
- [ ] Enable Firebase **App Check** (still open from 1.6) — biggest remaining lever against
      non-app traffic hitting Firestore/Auth directly.
- [ ] Deploy the updated `firestore.rules` (`firebase deploy --only firestore:rules`) and
      both workers to production.

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

  **Readiness findings (2026-07-22, from a repo audit).** The claude-in-chrome MCP was not
  available in this session, so the live console state (Testing vs Production) was NOT read —
  the human must confirm it on the Audience page below. Everything else is pinned from code:

  - **Scopes the production app actually requests:**
    1. Firebase Google sign-in (`GoogleAuthProvider` default, `sync.js`): `openid`,
       `.../auth/userinfo.email`, `.../auth/userinfo.profile` — **non-sensitive** (basic).
    2. Google Photos Picker (`js/gphotos.js`, wired live in `ui.js:583` "📸 Google Photos"):
       `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` — **SENSITIVE**.
  - **Verification path = sensitive-scope verification, NOT restricted.** The Photos *Picker*
    API scope is classified **sensitive** (Google created the Picker API precisely to keep
    apps off the restricted `photoslibrary.*` path). So verification needs: consent-screen
    branding + a **scope justification + a demo video** of the OAuth grant and how the picked
    photos are used. **No third-party CASA security assessment** (that's restricted-only) and
    **no annual re-audit**. Confirm the label in console: the Data-access page prints
    "Sensitive"/"Restricted" next to each scope — if it unexpectedly says Restricted, the
    timeline changes drastically (CASA, weeks-to-months). Fallback if verification drags: the
    Photos Picker is optional and lazy-loaded — removing its scope leaves only basic sign-in
    scopes, which need brand verification only (fast), and the app is fully functional
    (device/gallery photo picker still works). Worth keeping in the back pocket as a
    launch-unblocker.
  - **Public policy URLs (project Pages site, repo `DateAnalyze` → served at `/DateAnalyze/`):**
    - App home: `https://tzoororg.github.io/DateAnalyze/`
    - Privacy policy: `https://tzoororg.github.io/DateAnalyze/privacy.html`
    - Terms of service: `https://tzoororg.github.io/DateAnalyze/terms.html`
    - (Verify these resolve on production/master — beta lives at `/DateAnalyze/beta/`.)
  - **Authorized domain:** `tzoororg.github.io` (github.io is a public suffix, so this exact
    host is the authorized domain). `us-date-tracker-c988b.firebaseapp.com` is auto-added by
    Firebase Auth. Photos-Picker OAuth client (`769027499995-1g3ae4pshhs55aohcv2uh8dkbiocd311`)
    needs Authorized JS origins `https://tzoororg.github.io` + `http://localhost:8000` (GIS
    token client → origins only, no redirect URIs).
  - **Consent-screen form values to paste:** App name `Us` (or "Us — Date Tracker"); user
    support email `tzoorp@gmail.com`; developer contact `tzoorp@gmail.com`; app domain =
    the three URLs above; user type **External**.

  **Exact console pages (project `us-date-tracker-c988b`):**
  - Branding / consent screen: `https://console.cloud.google.com/auth/branding?project=us-date-tracker-c988b`
  - Audience (Testing↔Production, publishing status, test users): `https://console.cloud.google.com/auth/audience?project=us-date-tracker-c988b`
  - Data access (scopes + Sensitive/Restricted labels): `https://console.cloud.google.com/auth/scopes?project=us-date-tracker-c988b`
  - Verification center (submit + track): `https://console.cloud.google.com/auth/verification?project=us-date-tracker-c988b`
  - Credentials (client IDs, JS origins): `https://console.cloud.google.com/apis/credentials?project=us-date-tracker-c988b`

  **Remaining human steps (only the human can click these):**
  1. Open the **Audience** page; confirm current status is "Testing" and User type "External".
  2. On **Branding**, fill/confirm app name, support email, the privacy + terms + home URLs,
     authorized domain `tzoororg.github.io`, developer contact email.
  3. On **Data access**, confirm the two scope sets above are present and note the
     Sensitive/Restricted label on the photospicker scope.
  4. On **Audience**, click **Publish app** (Testing → In production). For an app with a
     sensitive scope this starts the verification flow rather than going live instantly.
  5. In the **Verification center**, complete the verification submission: scope
     justification + record & upload the **demo video** (screen recording: the Google
     consent screen granting the Photos Picker scope, then the in-app "📸 Google Photos" pick
     landing photos into an entry). Then **Submit for verification**.
  6. Do NOT expect instant approval — sensitive-scope review is typically days to a couple of
     weeks. Until approved, keep the existing test users on the Testing allowlist so the one
     real couple isn't affected.
- `signInWithPopup` breaks in many webviews/wrapped contexts (TWA is OK, iOS wrappers
      often not). Add `signInWithRedirect` fallback; test inside the actual store wrappers.
  - [x] **Code fallback shipped** (2026-07-22). `sync.signIn()` tries `signInWithPopup`, and on
        any popup failure *other than* user cancellation (`auth/popup-closed-by-user` /
        `auth/cancelled-popup-request`, which re-throw so a closed popup isn't a jarring redirect)
        falls back to `signInWithRedirect`. A `pendingRedirectSignIn` localStorage flag is set
        before navigating away; on next load `app.js` → `store.completeRedirectSignIn()` (no-op
        unless the flag is set, so local-only users never load the cloud SDK) calls
        `sync.completeRedirectSignIn()` → `getRedirectResult()` to finish auth. No cross-redirect
        intent plumbing needed: sign-in is a discrete step, and create/join are separate taps the
        user makes *after* landing back signed in. The `?emu=1` anonymous dev path is untouched
        (it returns before the popup branch). Tests: logic + smoke pass; `test/sync.mjs` doesn't
        cover this path (emulator uses anonymous sign-in, bypassing the popup/redirect branch).
  - [ ] **Test inside the actual store wrappers** — depends on the packaging task (§4); can't be
        exercised until the TWA / iOS wrappers are built. The `getRedirectResult` return-URL
        behaviour in particular must be verified in each wrapper.
- [x] Invite-code recovery: ⋯ menu → "🔁 New pairing code" mints a fresh 7-day code
      (`sync.regenerateInviteCode()` — same E2EE key, new server code, old invite
      best-effort retired) and copies it; the sync status line now shows remaining
      validity ("valid Nd" / "expired — tap New pairing code") from a stored
      `spaceInviteCodeExp` setting. (2026-07-20) Sync-tested (`test/sync.mjs` step 2b:
      new code differs, key preserved, new invite doc exists) — passing.
- [x] First-run explainer: one-time bottom sheet (`#introSheet`) shown on the very first
      open (0 dates, `seenIntro` unset; existing users are marked seen and never nagged).
      States "your data stays on this phone unless you turn on sync" + two points
      (private by default / sync optional & E2EE), "Get started" CTA (sets `seenIntro`),
      and a link to privacy.html — doubles as the store-reviewer privacy statement.
      Suppressed under `?shot=` except `?shot=intro` (capture/smoke). Design ran through
      design-duel (3 rounds → SHIP); mock design/past/first-run.html, catalog design/current.html.
      Smoke-tested (shows + dismisses), verified in the real app. (2026-07-20)
- [x] `navigator.storage.persist()` on first run — done in §3.1 (`maybeRequestPersist()` in ui.js, once per install at first write).

## 3. Storage, hosting, and the admin question

### 3.1 Local-only users can silently lose everything — HIGH
IndexedDB is evictable under storage pressure ("best-effort" bucket). For a general user
whose only copy of years of memories is local, browser eviction = total loss.

- [x] Call `navigator.storage.persist()` at first write; surface the result (⋯ menu line).
- [x] Show storage usage (`navigator.storage.estimate()`) in the ⋯ menu.
- [x] Nudge toward the existing JSON export (60-day toast, 7-day snooze; `lastExportAt`
      recorded on export) or toward enabling sync.

### 3.2 Spark plan cannot serve general users — HIGH (blocker for launch)
Base64 photos in Firestore: ~900 KB/photo against a **1 GiB total** Firestore quota ≈ ~1,100
photos across *all* users, and 50k reads/day is easy to blow because `attachSpace` snapshots
the entire `dates` collection on every app open.

- [x] **Blaze plan enabled + budget alert set (2026-07-20).** Cloud Billing account "My Billing
      Account" linked to the project (the initial upgrade left it unlinked — Storage silently kept
      failing until the project↔billing link was completed on the GCP billing page). ₪20/mo budget
      alert created (well above this app's real cents/mo cost). Free-trial credit ₪898 / 90 days active.
- [x] Cloud Storage photo path implemented (2026-07-20). `sync.js` now has an `ensureStorage()`
      lazy import of `firebase-storage.js` (mirrors the other Firebase modules) gated on a new
      `firebaseConfig.useStorage` flag — **default false so Spark/local users never download the
      Storage SDK and behaviour is byte-for-byte unchanged on Spark.** When flipped true (post-Blaze):
      `uploadPhoto` encrypts client-side (E2EE preserved, mime `enc:<orig>` in the object contentType)
      and `uploadBytes` to `spaces/{spaceId}/photos/{id}` — no 1 MiB cap, no Firestore quota use.
      `getPhoto` tries Storage first and **falls back to the base64 Firestore doc on
      `storage/object-not-found`**, so photos written before the migration still load; decrypted blobs
      still cache in IndexedDB forever after first fetch. `deletePhoto` clears both backends best-effort.
      `storage.rules` restored from commit d22f041 and adapted to the current `spaces/{spaceId}` member
      isolation model (+ 5 MB write cap); `firebase.json` gains the storage rules + storage emulator
      (port 9199); CSP already allows `*.googleapis.com`, added the emulator port. `firebaseConfig.storageBucket`
      was already present.
  - **DONE (2026-07-20, driven via console/Cloud Shell):** (1) default bucket created,
    `gs://us-date-tracker-c988b.firebasestorage.app`, no-cost US-EAST1 — matches `storageBucket`.
    (2) `storage.rules` published via the Storage → Rules editor; the cross-service `firestore.exists()`
    membership check triggered the "Provision cross-service rules" prompt → **Attach permissions**
    (grants the Storage service agent the IAM role to read Firestore — required or the rules fail closed).
    (3) Bucket CORS set via Cloud Shell (`gcloud storage buckets update … --cors-file`): GET/HEAD from
    `https://tzoororg.github.io` (covers prod + `/beta/`, same origin) and `http://localhost:8000`;
    verified with `buckets describe`. `cors.json` committed at repo root for reuse.
    (4) `useStorage: true` set in `js/firebase-config.js` — shipped to dev/beta first for end-to-end
    verification; prod picks it up at the next master release. Existing base64 photos keep working via
    the read fallback; no data migration script needed.
  - Tests: pure-logic guard for the enc-marker parse + photo blob encrypt→decrypt round-trip added to
    `test/logic.test.mjs` (**passing**). `test/sync.mjs` step 4b exercises the real Storage round-trip and
    the Storage-miss→base64 fallback against the emulator suite (`--only auth,firestore,storage`, port 9199;
    `?emu=1` routes Storage to it) — **unrun in this sandbox** (no outbound internet for the gstatic Firebase
    SDK, same caveat as the other sync steps); it self-skips if the storage emulator isn't up.
- [x] **Enable Firestore persistent local cache** (`persistentLocalCache` in the SDK init in
      sync.js) — done ahead of the Blaze migration (works on Spark too). `attachSpace` snapshots the whole
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
- [x] Key generation: on `createSpace`, generate a random AES-256-GCM key on-device
      (`js/crypto.js`, WebCrypto only).
- [x] Key exchange rides the pairing flow: combined code `SERVERCODE.keyB64url`; the
      server invite doc keeps only the 8-char code — zero knowledge of the key.
      (Share-link/QR presentation of the longer code: still open, cosmetic.)
- [x] Encrypt before Firestore: date docs are `{id, date, enc}` (everything except id/date
      inside `enc`); photo bytes encrypted with mime `enc:<orig>`. Rules allow both the
      encrypted and legacy plaintext shapes during migration. Metadata visible: id, date,
      timestamps, doc counts — disclose in privacy policy.
- [x] Key storage: IndexedDB settings (`spaceKey`, local-only, never routed to cloud).
- [x] Recovery story: ⋯ menu "Show encryption key" / "Enter encryption key"; JSON export
      stays plaintext as the backup; 3.1 nudge covers the reminder.
- [x] Migration for existing plaintext spaces: ⋯ menu "Encrypt cloud data" — idempotent
      re-write of plaintext dates + photos (no version gate; coordinate the one existing
      couple manually — old clients still read/write the legacy shape meanwhile).
- [x] Privacy policy then states: content is end-to-end encrypted; operators can see only
      entry counts, timestamps, and space membership. Console access still restricted to
      one 2FA-protected account. (privacy.html, 2026-07-20)

## 4. Store submission requirements

- [x] **Privacy policy** page (host on the Pages site) — required by both stores and by
      Google OAuth verification. — privacy.html at site root (2026-07-20)
- [x] **Account deletion** (Play policy, hard requirement): ⋯ menu → "Delete account"
      (shown whenever signed in). `store.deleteAccount()` → `sync.deleteAccount()` deletes
      the member doc, and — if last member — all dates/photos and the space doc (order:
      content + space doc while `isMember` still holds, member doc last), then the Firebase
      auth user (`deleteUser`, with a one-shot popup re-auth on `requires-recent-login`);
      then wipes local data and clears the `spaceId`/`spaceKey`/`spaceInviteCode`/`activeDate`
      settings and drops to local mode. New `firestore.rules` deletes: `spaces/{id}` and
      `members/{uid}`. Web-reachable instructions: privacy.html "Data deletion" section.
      (2026-07-20) Tests: `test/sync.mjs` step 8 added (asserts non-last member keeps the
      space, last member's delete removes space + all member docs) — unrun in this sandbox
      (no outbound internet for the gstatic Firebase SDK); logic + smoke pass.
- [x] **Answer sheet prepared** — Play Data safety + Apple App Privacy answers,
      grounded in the actual code with file citations, in
      [STORE_DATA_SAFETY.md](STORE_DATA_SAFETY.md) (copy-paste tables + the
      judgment calls to double-check). Answers fall out of 3.3.
  - [ ] **Transcribe into each console** — depends on a live app listing, which
        depends on packaging (§4 TWA/iOS below). Human step: paste the tables
        from STORE_DATA_SAFETY.md into the Play Data safety form and Apple App
        Privacy questionnaire; re-read §4 of that doc first (Location declared
        NOT collected; E2EE content still counts as collected; Play "Shared" =
        No).
- Packaging: Android = TWA via Bubblewrap + `assetlinks.json` on the Pages domain;
      iOS = per ../done/IOS_PLAN.md. Verify Google sign-in, FCM push, camera/photo access, and the
      Google Photos picker inside each wrapper — webview behavior differs from Chrome.
  - [x] **Scaffolding + docs done (2026-07-22).** `twa-manifest.json` (Bubblewrap config,
        pre-filled with real values), `icons/icon-512.png` (rendered launcher icon),
        `.well-known/assetlinks.json` (placeholders for package + SHA-256) with
        `.well-known/README.md`, and full step-by-step guides: **Android** in
        `plans/active/ANDROID_PACKAGING.md`, **iOS** in `plans/active/IOS_PACKAGING.md`.
        Each guide carries the wrapper-verification checklist (sign-in redirect / FCM push /
        camera / Photos picker) and the webview-vs-Chrome pitfalls.
  - [ ] **⚠️ Subpath blocker (human):** DAL must be served at
        `https://tzoororg.github.io/.well-known/assetlinks.json` (host root), but this
        project Pages site only owns `/DateAnalyze/`. Fix via a `tzoororg.github.io`
        User Pages repo (recommended) or a custom domain — see `.well-known/README.md`.
  - [ ] **Android (human):** install Bubblewrap, `bubblewrap init`/`build`, create + back up
        the signing keystore, paste its SHA-256 into `assetlinks.json`, test the AAB on a
        device, upload to Play. Steps in `plans/active/ANDROID_PACKAGING.md`.
  - [ ] **iOS (human):** verify the home-screen PWA on a real iPhone (only open gate; no Mac
        needed) — optional App Store wrapper (PWABuilder) needs Mac + Xcode + Apple Developer
        account. Steps in `plans/active/IOS_PACKAGING.md`.
  - [ ] **Wrapper checklist (human, on-device):** Google sign-in via redirect, FCM push
        (Android 13+ runtime permission), camera/gallery, Google Photos Picker — in each
        built wrapper.
- [x] Support contact + terms of service page (short). — terms.html (2026-07-20)
- [ ] Test push permission prompts in wrappers (Android 13+ runtime notification permission).

## 5. Operations

- [x] **Client error reporting**: `js/crash-report.js` catches `window.onerror` /
      `unhandledrejection` and POSTs to the existing feedback worker (`kind:"crash"`),
      labeled `crash`. Rate-limited per fingerprint/day plus 5-per-session client-side;
      worker dedups by commenting on the matching open issue instead of filing a new
      one; opt-out via `localStorage.crashReports = "off"`; payload carries no user
      content (message/stack/filename only). No Sentry needed. Worker deploy still
      pending the §1.7 checklist.
- [ ] **Backups**: Spark has no Firestore backups. On Blaze, enable scheduled Firestore
      exports to a GCS bucket (or point-in-time recovery).
- [ ] **Uptime/abuse visibility**: Cloudflare worker analytics are already there; add a
      Firebase usage-alert (reads/writes) so quota exhaustion doesn't look like an outage.
- [x] **Kill switch / min-version**: `version.json` at repo root (never cached by the SW,
      2.5s fail-open fetch at boot). `minCache` force-refreshes clients stuck on an old SW
      cache (one-shot loop guard via localStorage); `syncDisabled`/`message` gate
      `store.js`'s `loadCloud()` to kill sync in an incident. Editing `version.json` on
      `master` is the production incident switch.

## Suggested order

1. Blockers with security teeth: 1.1 (invite rules), 1.2 (feedback worker PAT), 3.1
   (storage persistence) — small, do now.
2. Launch blockers: 3.2 (Blaze + Cloud Storage), 2 (OAuth verification, sign-in in
   wrappers), 4 (policy pages, account deletion, packaging).
3. Launch blocker (decided): 3.3 E2EE — must ship before general users have plaintext data.
4. Hardening: 1.3–1.6, 5.
