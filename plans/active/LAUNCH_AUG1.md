# Launch plan — Play Store, target Aug 1 2026

Companion to [PRODUCTION_PLAN.md](PRODUCTION_PLAN.md) (which tracks the hardening detail).
This file is the day-by-day schedule. Coding tasks are Sonnet-friendly (mechanical, spec'd).
iOS is **out of scope** for this release.

## ⚠️ Schedule-defining constraint

**No Play developer account exists yet.** New personal Play accounts (post-Nov-2023 policy)
must run a **closed test with 12+ testers for 14 continuous days** before production access.
That makes an Aug 1 *production* listing impossible — the realistic path:

- Aug 1: app live on a **closed testing track** (testers = you two + friends/family, need 12).
- ~Aug 15+: apply for production access, then promote.

Creating the account **today** starts every clock (identity verification alone can take days).

## Decisions made

- **Wrapped card money line**: drop the summed ₪ number; replace with a tier stat
  ("mostly $ dates" / tier distribution). Same treatment across Insights.
- **Currency**: Israel-based; currency conversion already exists in `js/model.js`
  (Frankfurter, ILS base) — verify a $ display setting works, don't build new.
- **Photos Picker fallback**: if OAuth verification hasn't cleared by ~Jul 29, ship
  without the Photos scope (app fully functional) and re-enable after approval.
- **Ideas catalog**: ship the ~49 hardcoded ideas as-is. Upgrade path: fetch
  `catalog.json` from the Pages site outside the SW shell (no app release needed).

## Schedule

### Wed–Thu Jul 22–23 — human/console day (tzoor)

- [x] **Create Google Play developer account** ($25). Start identity verification
      immediately. Note the 12-tester/14-day closed-test requirement; start recruiting
      testers now. DONE 2026-07-29.
- [x] Create `tzoororg.github.io` User Pages repo; serve
      `/.well-known/assetlinks.json` (placeholder SHA-256 for now). This unblocks the
      TWA Digital Asset Links check — #1 technical launch risk. See `.well-known/README.md`.
      DONE 2026-07-22: repo `tzoororg/tzoororg.github.io` (Option A), needed a `.nojekyll`
      file or Jekyll skips the dot-dir; resolves 200 at the host root. Real SHA still TODO (Jul 28).
- [x] **Google OAuth console** (PRODUCTION_PLAN §2 has exact URLs + form values).
      DONE 2026-07-22 (Chrome MCP): **Branding filled + saved** — app name "Us Date Tracker",
      support + developer contact `tzoorp@gmail.com`, home/privacy/terms URLs, authorized
      domains `tzoororg.github.io` + firebaseapp. **State findings that revise the plan:**
      (a) publishing status is already **"In production"** (not Testing) — Publish step is done;
      (b) Data access shows **no sensitive/restricted scopes declared** — the photospicker
      scope is NOT registered, so Verification centre says "verification not required." The app
      is therefore on the **fast brand-verification-only path** (no demo video needed) *as long
      as the Photos scope stays unregistered* — this is exactly the launch fallback (§decisions).
      VERIFICATION COMPLETED 2026-07-29: Brand verification submitted (fast path, no Photos scope).
- [~] **§1.7 deploy checklist** (PRODUCTION_PLAN). Progress 2026-07-29:
      **DONE** — assets repo `tzoororg/DateAnalyze-feedback-assets` created (public, see
      §1.7 for why); `ASSET_REPO` + `FIREBASE_PROJECT_ID` set as plaintext vars in
      `worker/wrangler.toml`; rate limiting (5 req/min/IP) implemented on both workers.
      **Plan correction:** the rate limit is a Workers **Rate Limiting binding**, not a
      Cloudflare WAF rule — WAF rules are zone-scoped and these workers are on
      `*.workers.dev`, which has no zone. Config-driven, no dashboard step.
      **BLOCKED ON HUMAN** — fine-grained PAT → `wrangler secret put ASSET_TOKEN`;
      re-scope `GITHUB_TOKEN` to Issues-only; `firebase login` (CLI has no authorized
      account, which blocks both the rules deploy and backups).
      **QUEUED** — `wrangler deploy` (both workers) once `ASSET_TOKEN` exists, so prod
      is touched once; `firebase deploy --only firestore:rules`; App Check, web API key
      referrer allowlist, disable anonymous auth (console-only, to be driven in Chrome).
- [ ] Enable Firestore backups (scheduled export or PITR) — Blaze is on, ~10 min.

### Fri–Sat Jul 24–25 — code sprint 1

- [x] **Stale-cost purge**: wrapped card total-spent → tier stat; Insights "Total spent"
      tile → tier distribution; drop the "Enjoyment vs cost" $-axis scatter; fix
      best-value display (`fmtMoney` on representative tier values); audit remaining
      `fmtMoney` call sites; verify the existing currency setting ($ display) works.
      Mock only for the replaced Insights blocks.
      DONE 2026-07-22 (mock `design/sprint1-cost-card.html`, 3 taste-critic rounds, user-approved).
      New `analytics.tierDistribution()`; `fmtMoney` now UI-dead (model.js only). Currency-setting
      finding: there IS no shipped currency display setting — `CURRENCIES`/`toILS`/`refreshRates`
      in model.js are dead code from before the tier redesign; nothing to verify.
- [x] **Unified date-card mock**: one HTML file in `design/`, 3 size/detail variants
      keyed off the home sticker card (hearts + costBadge + category chip), covering
      home / history list / wishlist / suggest / memory card → user approval.
      DONE 2026-07-22: `design/sprint1-cost-card.html` frame 3 (L/M/S), approved. Sprint-2 notes:
      hearts never ★, effort renders as ⚡ not dots, chevron on all tappable rows, wishlist
      Remove → corner ✕ + compact "Log →" row pill, memory header one line.

### Sun–Mon Jul 26–27 — code sprint 2

- [x] Implement the unified date card everywhere; kill remaining legacy
      `★.repeat(e.enjoyment)` render paths (memory card ui.js:518, history ui.js:1113);
      decide legacy-data rendering (old enjoyment → hearts). Update smoke tests +
      `design/current.html` catalog.
      DONE 2026-07-24: hearts/tier-pill/⚡/chevron everywhere; legacy enjoyment renders as
      hearts. Rating INPUT widgets (Rate ★ pill, log form) intentionally keep stars.
- [x] Empty-state pass on all four tabs (a Play reviewer opens with zero data).
      Includes **cold-start Suggest framing**: catalog-forward copy/UI for zero-history
      users (competitor scan rec #3).
      DONE 2026-07-24 (mock `design/sprint2-empty-states.html`, 3 critic rounds, approved):
      `.empty2` pattern on Home/Album/Stats/Wishlist; dismissible cold-start banner on Ideas
      with catalog descs as reasons.
- [x] Run the full test suite **including `test/sync.mjs` against the emulators** —
      several steps (account deletion, Storage round-trip) are still marked unrun.
      DONE 2026-07-24: ALL SYNC TESTS PASSED incl. account deletion + Storage round-trip +
      rules checks. (First run after emulator boot flaked 2 rules checks with "client is
      offline" — warm-up, not a rules bug; clean on rerun.)

### Tue–Wed Jul 28–29 — packaging (tzoor, guides ready)

- [ ] Bubblewrap init/build per [ANDROID_PACKAGING.md](ANDROID_PACKAGING.md);
      create + **back up** the signing keystore; paste real SHA-256 into
      `assetlinks.json`; install AAB on a device.
- [ ] On-device wrapper checklist: Google sign-in (redirect path), FCM push
      (Android 13+ runtime permission), camera/gallery, Photos Picker (if scope kept).
- [x] Store listing **assets prepared** 2026-07-29 in `store/` (upload still pending the
      Play Console app existing): 6 phone screenshots at 1080×1919 (real seeded data, not
      empty states), `feature-graphic.png` at exactly 1024×500 built from the app's own
      Plum-theme tokens, and `store/listing.md` with app name (17/30), short description
      (73/80), full description (2868/4000, leading with "free, no ads, no subscription,
      works offline, end-to-end encrypted" per competitor scan rec #2), content-rating
      answers with reasoning, and category/contact. Capture scripts
      (`store/capture-store-shots.mjs`, `store/capture-feature-graphic.mjs`) reuse
      `test/cdp.mjs` — no new dependencies. Data safety still transcribed by hand from
      [STORE_DATA_SAFETY.md](STORE_DATA_SAFETY.md) §2.

### Thu Jul 30 — release

- [ ] `/release` skill: version bump, close `next-release` issues, merge dev→master.
- [ ] Upload AAB, submit to the **closed testing** track; invite the 12 testers.

### Jul 31–Aug 1 — buffer

Review feedback, wrapper bugs, tester onboarding.

### Post-launch (~Aug 15+)

- [ ] After 14 days of closed testing with 12+ opted-in testers: apply for production
      access, then promote to production.
- [ ] Re-enable Photos Picker scope if it was dropped for launch.
- [ ] Ideas catalog upgrade path (remote `catalog.json`) — only if users ask.
- [ ] Competitor scan follow-ups: see [COMPETITOR_SCAN_2026.md](COMPETITOR_SCAN_2026.md).
      Product decision: **no daily hooks, streaks, or nudges** — the app stays a
      genuinely useful tool, not an engagement treadmill. Widget = the one gap worth
      closing (post-launch; needs a native path beyond plain Bubblewrap).
