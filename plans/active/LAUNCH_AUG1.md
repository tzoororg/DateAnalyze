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

- [ ] **Create Google Play developer account** ($25). Start identity verification
      immediately. Note the 12-tester/14-day closed-test requirement; start recruiting
      testers now.
- [x] Create `tzoororg.github.io` User Pages repo; serve
      `/.well-known/assetlinks.json` (placeholder SHA-256 for now). This unblocks the
      TWA Digital Asset Links check — #1 technical launch risk. See `.well-known/README.md`.
      DONE 2026-07-22: repo `tzoororg/tzoororg.github.io` (Option A), needed a `.nojekyll`
      file or Jekyll skips the dot-dir; resolves 200 at the host root. Real SHA still TODO (Jul 28).
- [~] **Google OAuth console** (PRODUCTION_PLAN §2 has exact URLs + form values).
      DONE 2026-07-22 (Chrome MCP): **Branding filled + saved** — app name "Us Date Tracker",
      support + developer contact `tzoorp@gmail.com`, home/privacy/terms URLs, authorized
      domains `tzoororg.github.io` + firebaseapp. **State findings that revise the plan:**
      (a) publishing status is already **"In production"** (not Testing) — Publish step is done;
      (b) Data access shows **no sensitive/restricted scopes declared** — the photospicker
      scope is NOT registered, so Verification centre says "verification not required." The app
      is therefore on the **fast brand-verification-only path** (no demo video needed) *as long
      as the Photos scope stays unregistered* — this is exactly the launch fallback (§decisions).
      REMAINING (human decision, not filled): either (1) click **Verify branding** to submit the
      fast brand verification and ship without the Photos scope, OR (2) go slow — Data access →
      Add scopes → photospicker → submit sensitive-scope verification with justification + demo
      video. Recommend (1) for the Aug 1 timeline.
- [ ] **§1.7 deploy checklist** (PRODUCTION_PLAN): assets-only GitHub repo + scoped PAT,
      worker vars/secrets, `cd worker && npx wrangler deploy` (both workers),
      Cloudflare rate-limit rules (~5 req/min/IP) on both routes,
      `firebase deploy --only firestore:rules`, enable **App Check**,
      restrict the web API key (referrer allowlist), disable anonymous auth in prod.
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
- [ ] Store listing: screenshots (use `design/capture.mjs`), feature graphic 1024×500,
      short/full description — **lead with "free, no ads, no subscription, works
      offline, end-to-end encrypted"** (competitor scan rec #2: answers the field's
      top review complaints), content rating questionnaire, paste
      [STORE_DATA_SAFETY.md](STORE_DATA_SAFETY.md) tables into the Data safety form.

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
