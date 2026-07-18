# Time-capsule notes (Roadmap #11)

Approved design: `design/time-capsule.html` (screenshots `design/shots/mock-capsule.png`; duel audit trail in HTML comments at the bottom of the mock). An optional "note to your future selves" written in the log form; it resurfaces exactly one year later inside the existing On-this-day memory card on Home.

## Design summary (implement exactly this)

- **Log form:** a butter sticker-pill toggle `💌 note to next year` sits on the same row as the existing `+ add a note` link (row becomes a flex `.link-row`, note-link left, pill right). Tapping the pill reveals a capsule field: `card-2` background, 1px **dashed** `--butter-fg` border, radius 13px. Header row: `💌 To future us` (13px, 700, `--butter-fg`) with a right-aligned passive muted caption `opens {entry date + 1 year, e.g. "Jul 18, 2027"}`. Below: a borderless transparent textarea (body font, no italic), placeholder `If you're reading this…`. Field is hidden unless toggled or `draft.capsule` is non-empty (same pattern as notes/link).
- **Memory card (Home):** for each on-this-day entry with a `capsule`, append inside its `.memory-item`: a `.capsule-memory` panel — `card-2` bg, radius 13px, 3px solid `--butter-fg` left border, padding 10px 12px. Inside: `💌 FROM YOU` label (11px, 800, uppercase, letter-spacing .08em, `--butter-fg`) then the note text in *italic* body font, `--text`. No quote marks.
- Exact CSS values are in the `<style>` block of `design/time-capsule.html` — copy them into `css/styles.css` (classes: `.link-row`, `.capsule-toggle`, `.capsule-wrap`, `.capsule-field`, `.capsule-head`, `.capsule-head .when`, `.capsule-memory`, `.capsule-memory .from`, `.capsule-memory .msg`).

## Implementation steps

1. **`js/model.js`** — add `capsule: ""` to `blankEntry()`. Additive optional string; absent/empty = no capsule, no migration, no backfill.
2. **`js/ui.js` — log form (`renderLog`)**
   - Wrap the existing `#f-note-toggle` button in `<div class="link-row">` and add the `#f-capsule-toggle` pill as its second child.
   - After the notes field label, add the capsule block (`#f-capsule-wrap`, hidden unless `draft.capsule`): header + `opens <date+1y>` caption + `<textarea id="f-capsule">`. Compute the caption from `draft.date` + 1 year, formatted like the app's `fmtDate`.
   - In `wireForm()`: bind `f-capsule` input → `draft.capsule`; bind `f-capsule-toggle` click → unhide wrap + focus textarea (mirror the notes/link toggles).
   - In `saveDraft()`: `draft.capsule = (draft.capsule || "").trim();`.
3. **`js/ui.js` — memory card (`renderHome`)** — in the `memories.map(...)` template, after the `.entry` div, if `e.capsule` render the `.capsule-memory` panel with `escHtml(e.capsule)`. Label is always `💌 FROM YOU`.
   `// ponytail: label is always "From you" — date docs carry no author uid; add author names when sync stamps one`
4. **`css/styles.css`** — add the capsule classes (values from the mock's `<style>` block).
5. **Sync:** nothing to do — cloud date docs store the whole entry object, so `capsule` rides along automatically. Do not touch `sync.js` or `firestore.rules`.
6. **Tests**
   - `test/logic.test.mjs`: assert `blankEntry().capsule === ""`.
   - `test/smoke.mjs`: add a check — open the log sheet, tap the capsule pill, type into `#f-capsule`, save; then (with an on-this-day-dated entry carrying a capsule) assert the Home memory card contains the `.capsule-memory` text. Follow the file's existing check style.
   - Run `node --test test/logic.test.mjs` and `node test/smoke.mjs` (needs `python -m http.server 8000`). Both must pass.
7. **`js/dev-shots.js`** — the `after-capsule-log` / `after-capsule-home` sketch states become real UI: update them to drive the actual feature (seed a capsule on the demo data / set `draft.capsule`) instead of injecting fake HTML.
8. **After ship (main session, not the subagent):** update `design/current.html` notes + re-run `node design/capture.mjs` for `log` and `home`; move this file to `plans/done/`.

## Out of scope

- No author names on capsules (no author field on date docs today).
- No custom open date — always entry date + 1 year.
- No notification when a capsule opens; it simply appears in the existing memory card (push feature may layer on later).
