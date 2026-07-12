# Weekly two-partner QA run

You are running an exploratory QA session on the DateAnalyze PWA, playing **two partners
(Alex and Sam) whose phones are synced**. Goal: find unintended behavior, user-unfriendly
logic, or user-unfriendly UI — and report findings through the app's own feedback button.

## Setup

1. From the repo root, start (both in background):
   - `python -m http.server 8000`
   - `firebase emulators:start --only auth,firestore --project us-date-tracker-c988b`
     (needs Java; if `java` isn't on PATH in your shell, prepend
     `C:\Program Files\Eclipse Adoptium\jre-21.0.11.10-hotspot\bin` — don't go hunting for it)
2. Launch two headless-Chrome "phones" the way `test/sync.mjs` does (import
   `test/cdp.mjs`, two profiles, two ports). Open each at
   `http://127.0.0.1:8000/index.html?emu=1` (NOT `?shot=` — you want the real app flow).
   `?emu=1` routes Auth/Firestore to the emulators and makes sign-in anonymous (no popup).
3. Pair them like a real couple would — through the UI, not store.js calls: Alex creates
   a space from the sync settings, read the invite code off the screen, Sam joins with it.
   If the UI flow itself is confusing or breaks, that is your first finding.

Drive the app as a user: read state with accessibility/DOM snapshots and text evals,
click/fill through the rendered UI. Use direct `store.js` evals only to *verify* state
(e.g. confirm a record really persisted), never to perform the user action itself.
Screenshots are allowed but expensive — take one only when judging visual layout, and at
most ~6 per run.

## Test plan — randomized

Seed randomness from today's date. Shuffle the feature list below and split steps
between Alex and Sam so both devices act and both observe sync results. Interleave
(Alex logs → Sam edits → Alex deletes), don't run one phone then the other.

Features to cover (shuffled order each week):
- Log a date: all fields incl. multi-select moods, photo attach, save; empty/edge inputs
  (blank title, cost 0, very long notes, date in the future)
- Edit and delete an existing date (incl. one the *other* partner created)
- Sync: does each mutation appear on the other phone? How fast? Any stale UI?
- History: list vs photo-gallery view, search, filters
- Insights: every chart with little data, lots of data, and quirky data (all same category)
- Suggest: slider at 0 / 0.5 / 1, repeat suggestions, cold start vs after logging
- Per-partner ratings and comments on a date
- On-this-day memory card (log tab)
- Export then import on the other phone; theme switch; ⋯ menu items generally
- Skip: push notifications, Google Photos picker (real external services)

While testing, judge like a picky user: confusing labels, dead ends, missing feedback
after an action, layout glitches, surprising data loss or duplication, anything that
would annoy a non-technical partner.

## Reporting

1. Before filing anything, dedupe: `gh issue list --label feedback --state open` (and
   skim recently closed ones). Don't re-file known issues.
2. File each new finding through the app UI on either phone: ⋯ menu → Send feedback,
   type the report, Send. Prefix by type:
   - `bug: ...` — broken/unintended behavior (include steps to reproduce)
   - `ux: ...` — works but user-unfriendly
   - `feature: ...` — a gap a real couple would want filled
   Add `[weekly-qa]` at the end of each report so automated findings are identifiable.
   If the in-app send fails (sandboxed runs can't reach the `workers.dev` feedback
   worker), fall back to filing directly:
   `gh issue create --label feedback --title "<prefix: short title>" --body "<report> [weekly-qa]"`
   — and note in the summary that the in-app path was blocked.
3. Cap at 6 reports per run — file the most impactful ones only.
4. Findings you noticed but didn't file (dupes, borderline) go in the run summary.

## Teardown

Kill the Chrome instances, http server, and emulators. Emulator data is throwaway; do
NOT touch real Firebase, do not commit anything. End with a short summary: features
covered, issues filed (with issue numbers), issues skipped as dupes, anything flaky.
