# Date Night mode (Roadmap #7) + v2.1.0 triage fixes

Approved design: `design/past/date-night.html` (duel log in HTML comments at the bottom;
final screenshot `design/shots/mock-datenight.png`). Implement exactly that design.

## Part 1 — Date Night mode

### State
- Setting `activeDate` = `{ startedAt: <ms>, photoIds: [<uuid>...] }` via
  `setSetting`/`getSetting` (settings are device-local by design — fine, photos are
  device-local too; the finished entry syncs like any other date).
- No new files: logic in `js/ui.js`, styles in `css/styles.css` (copy the `.dn-*`
  rules from the mock, minus mock scaffolding). No `sw.js` SHELL change, no CACHE bump.

### Schema (`js/model.js`)
- Add optional `durationMin: null` to `blankEntry()` with a one-line comment
  (minutes, set only by Date Night mode). Syncs for free as part of the date doc.
- Analytics: no consumer change needed (field is additive, display-only).

### Home entry card (mock panel A)
- In `renderHome()` (`js/ui.js:272`): when no `activeDate` is set, render the
  `.dn-invite` card (moon circle + "Date night?" + `.mini-btn` Start) between the
  hero card and the memory card.
- Start → `setSetting("activeDate", { startedAt: Date.now(), photoIds: [] })`,
  re-render.

### Active banner (mock panel B)
- While `activeDate` exists, render the `.dn-banner` (🌙 glow, "Date night",
  sub "Xh Ym · N photos", End pill) pinned above the view content **on every tab**.
  Simplest placement: a container div injected before `#view`'s content by the tab
  render pipeline (one shared function `renderDnBanner()` called from `show()`),
  or a fixed slot in `index.html` under `.app-chrome` toggled hidden — pick
  whichever is fewer lines; it must appear on all four tabs.
- Elapsed time updates once a minute (single `setInterval`, cleared when inactive).
- Tapping the banner body opens the camera (same handler as the FAB); the End pill
  stops propagation and has its own handler (dead zone per mock).
- FAB while active: `#fab` shows 📷 (aria-label "Take a photo") and, instead of
  opening the log sheet, triggers a hidden `<input type="file" accept="image/*"
  capture="environment">` → existing `downscale()` → `putPhoto()` → push id onto
  `activeDate.photoIds` → `setSetting` → refresh banner count.
- 12h auto-expire: when rendering, if `Date.now() - startedAt > 12h`, cap the
  displayed elapsed at "12h" — the banner stays with End available; saved
  `durationMin` is capped at 720. (ponytail: no auto-end machinery; the cap is
  the whole recovery story.)

### End → pre-filled log sheet (mock panel C)
- End pill → clear the `activeDate` setting, open the log sheet (`openLogSheet()`)
  with the draft pre-filled: `date` = ISO date of `startedAt`,
  `photos` = `photoIds` (photos are already in IndexedDB; reuse whatever the photo
  strip does for existing draft photos), `durationMin` = rounded elapsed minutes
  (capped 720).
- When `draft.durationMin` is set, render the `.dn-fromtonight` mint chip at the top
  of the log form: `✨ From tonight — 1h 24m · 3 photos`. Chip is display-only.
- Closing the sheet without saving follows existing draft semantics (no special
  recovery path).

### Display
- History detail: if `e.durationMin`, append `· 1h 24m`-style text to the existing
  sub/meta line. Format helper: `fmtDuration(min)` → "45m", "1h", "1h 24m".

### Dev-shots + tests
- Replace the fake injected previews `after-datenight-home` / `after-datenight-active`
  in `js/dev-shots.js` with real states: `datenight-home` (no active date → invite
  card visible) and `datenight-active` (seed `activeDate` setting → banner + camera
  FAB). Update the names in `design/capture.mjs` SHOTS.
- Smoke test (`test/smoke.mjs`): start date night from Home → assert banner text
  appears and FAB label changed → tap End → assert the log form shows the
  "From tonight" chip.
- Logic test (`test/logic.test.mjs`): `fmtDuration` cases (45m / 1h / 1h 24m) if it
  lives somewhere importable; skip if it stays a private ui.js helper.

## Part 2 — v2.1.0 triage backlog (ROADMAP "Release triage backlog")

Fix all six, exactly as prescribed there:

1. **Album control stack** (medium): collapse the ~300px of sort/view/search/filter
   chrome in `renderHistory()` to two rows with inline chips.
2. **Cost display** (medium): one coarse `Free / $ / $$ / $$$` badge everywhere
   (Home, Album, Ideas) — kill the shekel-glyph "▣0" / "~▣180" renderings; derive
   the tier with the existing `tierForCost()`.
3. **Ideas "Max budget" input** (low): replace the free-text numeric input with a
   `Free / $ / $$ / $$$` segmented pill (reuse the `.seg4` pattern from the log form).
4. **FAB overlap** (medium): bottom scroll clearance so the FAB doesn't cover the
   last home card's hearts sticker (padding-bottom on the view/list).
5. **Ideas card actions** (low): compact one-line actions ("♡ Wishlist" / "Log →").
6. **Wrapped "BEST MONTH"** (low): show a month ("June"), not a specific date.

## Part 3 — housekeeping

- ROADMAP.md: mark #7 shipped (with date), #11 shipped 2026-07-16 (commit 7c49285 —
  status line currently missing), remove the fixed triage items from the backlog list.
- After implementation: run `node --test test/logic.test.mjs` and `node test/smoke.mjs`
  (server on :8000 or :8163) — both must pass.
