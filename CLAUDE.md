# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free Progressive Web App for tracking dates with a partner. Four tabs: **Log** (post-date form), **History** (browse/search past dates, list or photo gallery view), **Insights** (charts/analytics), **Suggest** (date ideas via UCB1 multi-armed bandit). Pure HTML/CSS/vanilla JS with ES modules — no build step, no framework, no bundler. Data is local-only in IndexedDB by default; two-phone sync via Firebase is an opt-in layer (see below) that never loads unless the user turns it on.

## Development

```bash
python -m http.server 8000
```

**Always shut down any server you start** (dev server, Firebase emulators, etc.) once the task that needed it is done — don't leave orphaned processes holding ports. On Windows: `taskkill //F //IM python.exe` for the dev server, or kill the specific PID from `netstat -ano | grep :8000`.

Open http://localhost:8000 in Chrome. Use DevTools device toolbar for mobile preview. `file://` URLs won't work (ES modules and service worker require HTTP).

There is no build or lint command.

### Physical phone testing

A real Android phone (Xiaomi, `adb` device `5TYT6DDI4XLNJBFY`) is USB-connected for testing things the DevTools emulator can't prove — real touch/gesture behavior, the installed-PWA/service-worker lifecycle, camera/photo capture, push notifications, actual Chrome-on-Android rendering.

**Prefer the real deployed beta app over a local copy.** Point the phone at the live beta at `https://tzoororg.github.io/DateAnalyze/beta/` — it's the actual PWA (real service worker, real origin, installable), served from whatever's on `dev`. Only fall back to a locally-hosted copy when you need to test changes that aren't pushed to `dev` yet; if you do, remember to shut the local server down afterward.

Two ways in:

- **`mobile` MCP** (`mcp__mobile__*`, from `@mobilenext/mobile-mcp`) — screenshot, tap, type, launch apps, read the view hierarchy. Configured in `~/.claude.json`; needs `ANDROID_HOME` pointing at a valid SDK (`C:\Users\tzoor\AppData\Local\Android\Sdk`). If `mobile_list_available_devices` returns `[]` while `adb devices` shows the phone, the MCP has a stale/bad env — fix `ANDROID_HOME` and restart Claude Code so the server reloads.
- **Raw `adb`** (always works, no MCP restart needed) — open the beta app on the phone and screenshot it:
  ```bash
  adb shell am start -a android.intent.action.VIEW -d "https://tzoororg.github.io/DateAnalyze/beta/"
  adb exec-out screencap -p > shot.png  # capture what's on the phone
  ```
  For an unpushed local copy instead: `python -m http.server 8000 &`, `adb reverse tcp:8000 tcp:8000`, then open `http://localhost:8000/index.html`. To populate the app with demo data: **⋯ menu → Add sample dates**. Tests exist — see Testing below.

## Design-first workflow (required)

Every new feature or UI/UX modification starts as a static HTML mock **before** touching app code:

1. Create/update a mock in `design/` (a standalone HTML file styled like the app — see `design/roadmap/roadmap.html` for the pattern) showing the proposed change.
2. Share it with the user as screenshots (render the HTML and capture, or use `design/capture.mjs` for app views) and discuss/tune the design iteratively.
3. Only after the user approves the mock, implement it in the real app.
4. After a design/UI change ships, update `design/current.html` (the living catalog of every view): re-run `node design/capture.mjs` (dev server running) to refresh the screenshots, and edit the notes for the components that changed.

Skip the mock only for pure logic/bugfix changes with no visible UI impact.

For designing a **new component or view** (not a tweak to an existing one), use the `design-duel` skill (`.claude/skills/design-duel/SKILL.md`) — it wraps steps 1–3 with an adversarial design-critic loop.

**Screenshot discipline during design iteration:** capture only the views under discussion — `node design/capture.mjs <baseUrl> <shot> [<shot>...]` captures just the named shots instead of all of them. Share at most 2–3 screenshots per iteration round; full catalog re-captures are only for step 4.

**Model routing:** plans and design decisions happen on the session's default model; once a plan/mock is approved, hand the mechanical implementation to a **Sonnet subagent** (Agent tool, `model: "sonnet"`) with the plan as its prompt, then review its diff. This is the main token-cost lever — don't burn the large model on typing out an already-decided change.

**Service worker caching caveat:** During development, the SW caches aggressively. After changing files, either unregister the SW in DevTools → Application → Service Workers, or bump the `CACHE` version string in `sw.js`. When adding a new file, also add it to the `SHELL` array in `sw.js`.

**Versioning (semver):** the `CACHE` string in `sw.js` is `us-date-tracker-vMAJOR.MINOR.PATCH`. **Do NOT bump it on day-to-day dev commits** — the deploy workflow stamps the dev commit SHA into the beta app's SW cache name, so every beta deploy busts the cache automatically. The version is bumped by hand exactly once per release, as part of preparing the merge to master, covering everything since the last release: **major** = big redesign or a data-model change, **minor** = new feature, **patch** = bugfix/tweak. The pre-commit hook in `hooks/pre-commit` (enable once per clone with `git config core.hooksPath hooks`) is a safety net on master only — it bumps PATCH if app shell files are committed there without a hand bump (note: a fast-forward merge creates no commit, so the hook won't fire — bump on dev before merging).

## Testing (required after every feature/redesign)

Three layers, all dependency-free, all text output. **Assert in text — never verify with screenshots** (screenshots are only for visual design review; they cost thousands of tokens each, text runs cost ~100–300).

```bash
node test/run.mjs                 # one-shot: starts the server if needed, runs logic + smoke, tears down
node --test test/logic.test.mjs   # pure logic: model/analytics/suggest/charts (~1s)
node test/smoke.mjs               # UI smoke in headless Chrome; needs python -m http.server 8000
node test/sync.mjs                # two-phone sync; needs the server AND the emulators (below)
node test/sync.mjs --prod         # same flow against the REAL Firebase backend (release gate; needs only the server)
```

- **After any change:** run logic + smoke. Both must pass before commit.
- **Phone-only features:** if a feature can only really be tested on a physical phone (touch gestures, installed-PWA/service-worker behavior, camera capture, push notifications), do not deliver it until you've validated it on the connected phone (see Physical phone testing above). Emulator/DevTools verification is not enough for these.
- **When touching `sync.js`, `store.js`, or `firestore.rules`:** also run the sync test. It simulates two phones as separate headless-Chrome profiles talking to the **Firebase Emulator Suite** — start it first with `firebase emulators:start --only auth,firestore,storage --project us-date-tracker-c988b` (firebase-tools + Java runtime, both installed on this machine; `storage` is required now that `useStorage:true` — the sync test exercises the Cloud Storage photo path). The `?emu=1` URL param is a dev hook in `sync.js` that routes Auth/Firestore/Storage to the emulators and swaps the Google popup for anonymous sign-in.
- **Wire-format changes** (the E2EE envelope, invite codes, photo data URLs) go in `js/sync-codec.js` and are covered by `test/logic.test.mjs` — no emulator needed. `test/logic.test.mjs` also asserts that `db.js`, `sync.js` and `store.js` still agree on the backend interface, so a function added to one and forgotten in another fails there rather than at runtime in cloud mode.
- New feature with a genuinely new UI flow → add a check to `test/smoke.mjs` (plus a `?shot=` state in `js/dev-shots.js` if needed). New pure logic → a test in `test/logic.test.mjs`.
- The shared headless-Chrome CDP client lives in `test/cdp.mjs` (also used by `design/capture.mjs`).
- **Ad-hoc validation of a UI change** (not a permanent test): use `test/driver.mjs` — `openApp("home")` boots the real app headless and gives `tap`/`fill`/`viewText`/`count`/`visible`/`goTab`/`dates` helpers, instead of hand-writing raw CDP `evaluate()` strings. Needs the dev server (or just use `node test/run.mjs` for the standard suite).

## Finishing a task (required)

When a change is complete and verified, **commit and push without being asked**, in the same turn. Day-to-day work is committed and pushed on the **`dev` branch** — a GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys `dev` to the **beta app** at `/beta/` and `master` to the production app at the site root. Releasing = bump the SW `CACHE` version on `dev` (one semver bump covering everything since the last release — production phones only update when it changes), then merge `dev` into `master` and push, **only when the user asks for a release**. Beta phones update on every dev push automatically (SHA-stamped cache), so dev commits need no version bump. Never end a task with unpushed app changes unless the user said to hold off.

**Tracking board (required).** `tracking/BOARD.md` is the single source of truth for open work — epics (backed by `plans/` docs), goals, and issue conventions. **Any commit that starts, advances, ships, or parks an epic, goal, or issue updates the board in the same commit**: change the status/next-step, add a new row, or move the finished item to `tracking/ARCHIVE.md`. New feature ideas and release-triage findings go on the board (not ROADMAP.md — that file is strategy only). A new epic gets a plan doc in `plans/active/` and a board row pointing at it; when a plan ships, move it to `plans/done/` and its board row to the archive.

**Issue / roadmap traceability (required).** Every commit that resolves a GitHub feedback issue names it in the subject as `(#N)`; every commit that ships a board epic/goal names it as `(board EN/GN)` (e.g. `Fix inverted star ratings (#12, #15)`, `Add wishlist (board E6)`). Because these commits land on **dev** (not the default branch), GitHub does not auto-close the issue — instead:
- When the *actual implementation* of a fix/feature lands on **dev**, add the **`next-release`** label to its issue(s) — it's live on beta, closes at the next production release. A mock-only or roadmap-only commit that merely mentions `(#N)` does **not** get the label and does **not** close the issue.
- The **release process closes only the `next-release`-labeled issues** when the work reaches master — the release skill's Ship phase lists them, closes each with a comment (sha from `git log master..dev`), and removes the label. See `.claude/skills/release/SKILL.md` Phase 6.

## Architecture

Data flows one direction: `store.js` (→ `db.js` or `sync.js`) → domain logic → `ui.js` / `ui-insights.js` / `ui-suggest.js` render.

- **`js/store.js`** — Façade in front of the data layer. Exposes the same 12-function CRUD interface as `db.js` (`getAllDates`, `putDate`, `getDate`, `deleteDate`, `putPhoto`, `getPhoto`, `deletePhoto`, `getSetting`, `setSetting`, `exportAll`, `importAll`, `wipeAll`) plus mode control (`getMode`, `getUser`, `signIn`, `createSpace`, `joinSpace`, `signOut`, `autoEnableSync`) and `subscribe(cb)` for remote-change notifications. `ui.js` imports this instead of `db.js` directly and is otherwise unaware of which backend is active. Settings always read/write `db.js` directly (never routed to the cloud), since they include the `spaceId` setting that decides which backend to use.
- **`js/sync.js`** — Cloud backend (Firebase Auth + Firestore), dynamically `import()`-ed only when sync is ever turned on — local-only users never download it. Mirrors `db.js`'s interface so `store.js` can swap backends transparently. Each couple is an isolated `spaces/{spaceId}` doc with `dates` and `members` subcollections and a separate `invites/{CODE}` doc for 6-char pairing codes (see `firestore.rules`). **Photos are device-local even in cloud mode:** the project runs on Firebase's free Spark plan, which has no Cloud Storage, so photo blobs stay in each device's IndexedDB. A date doc's `photos[]` id list still syncs, so a partner sees the entry but not photos they didn't add. `storage.rules` and the Storage upload/download path are kept in git history for a future Blaze-plan upgrade. Config lives in `js/firebase-config.js` (filled in from the Firebase console — see `plans/done/SYNC_PLAN.md`).
- **`js/model.js`** — Single source of truth for the data schema (`blankEntry()` is the canonical field list). A date entry has: id, date, createdAt, status (`"idea"` = wishlist, else done), title, url, category (one of 11 enum keys), enjoyment (1–5), wouldRepeat (yes/maybe/no), vibe (free-text word), mood (legacy array), effort (1–5), cost + costTier, location, notes, capsule, photos (array of blob IDs), durationMin. Add new categories to `CATEGORIES`. Fields the **v2 log form no longer asks for directly**:
  - **`wouldRepeat`** is derived, not entered: the again-o-meter (`METER`, `js/ui.js:893`) is one 1–5 drag that sets `enjoyment` and runs `repeatForEnjoyment()` for `wouldRepeat`. Both still live on the entry and in analytics; only the second input is gone.
  - **`vibe` replaced the `mood` multi-select.** The form has one free-text vibe word (`#f-vibe`, `js/ui.js:798`) with chips from `pastVibes()`. `MOOD_OPTIONS` is **still live for reads**: History and Suggest filter chips, the detail view's mood tags, `analytics.byMood()` (Insights "Your vibes"), and `topVibeWords()` which prefers `vibe` and falls back to `mood` labels. Don't delete it — legacy entries carry the array. New entries get `mood: []`. Legacy entries may even have a *numeric* `mood`, so display/analytics code checks `Array.isArray(e.mood)` first.
  - **`effort`** has no input either; it arrives from catalog seeds/legacy entries and is only read (Suggest's max-effort filter, the ⚡ display).
  - **`cost`** is entered as a `COST_TIERS` tier; the tier's representative ₪ amount lands in `cost` so spend analytics keep working (approximate by design). **`location`** has no field in the v2 form.
- **`js/db.js`** — Thin IndexedDB wrapper; the local backend behind `store.js`. Three object stores: `dates` (keyPath: id), `photos` (blobs stored separately to keep date records lean), `settings`. All CRUD is async. Photos are stored/retrieved by UUID; `deleteDate` cascades to delete associated photos. `cachePhoto(id, blob)` writes under a caller-supplied id, used by `sync.js` to mirror cloud photos locally.
- **`js/suggest.js`** — The core algorithm. Scores every candidate (past activities + unseen catalog ideas) with: `predictedEnjoyment + UCB1_exploration_bonus + novelty − fatigue`. The `explore` parameter (0–1, from the Adventure↔Comfort slider) scales the exploration constant. `ensureMix()` guarantees results contain both exploit and explore candidates when available. Past enjoyment uses recency-weighted averaging (120-day half-life).
- **`js/catalog.js`** — Seed catalog of ~49 date ideas used as the "explore pool" for cold-start suggestions. Each idea has title, category, estCost, effort, desc.
- **`js/analytics.js`** — Pure aggregation functions over the dates array (no side effects). Used by the Insights tab and the suggestion engine. Includes `byMood()` (frequency + avg enjoyment + top category per mood) and `onThisDay()` (entries from today's exact month/day in prior years, used for the Log tab's memory card).
- **`js/charts.js`** — Hand-rolled inline SVG chart generators. Each function returns an SVG string using CSS variables for theming.
- **`js/ui.js`** — App shell: chrome/tab switching, the Home and History tabs, the log form, photos, the ⋯ menu and Date Night mode. Manages a `draft` object (the form state) and a `dates` array (reloaded from DB after mutations).
- **`js/ui-insights.js`** / **`js/ui-suggest.js`** — The Insights and Suggest tabs, split out of `ui.js`. Each owns its own view state (`wrapPeriod`; the `sug` filter object) and receives everything else through a small `ctx` object built in `ui.js` (`insightsCtx` / `suggestCtx`: `done()`, `all()`, `reload()`, `goSuggest()`, `logSeed()`). **They must never import `ui.js`** — the ctx is what keeps the split acyclic. When a new tab-local piece of state appears, put it in the tab module, not back in `ui.js`.
- **`js/ui-shared.js`** — Leaf helpers used by all three UI modules: `escHtml`/`escAttr`/`safeUrl`, `emptyState`/`emptyState2`, `toast`, `bind`/`setOn`, `tierPill`/`costBadge`/`heartsHtml`, `attachSwipe`/`attachSwipeDown`, `downscale`, and the photo object-URL cache (`photoURL`/`clearPhotoCache`). Stateless apart from that cache, and it never reaches back into a tab's state.
- **`js/sync-codec.js`** — The cloud **wire format**, pure and Firebase-free: `encodeDateDoc`/`decodeDateDoc` (E2EE envelope — `id` and `date` stay in the clear, everything else rides in `enc`), `parseInviteCode`, `inviteExpired`, `genCode`, `dataURLToBlob`. Split out of `sync.js` so the code that decides whether a couple's data survives the round trip is covered by `test/logic.test.mjs` on every commit instead of only by the emulator suite. New wire-format logic belongs here, with a test, not inline in `sync.js`.
- **`js/feedback.js`** / **`js/feedback-config.js`** — In-app "Send feedback" modal (⋯ menu). POSTs text + optional photo to a Cloudflare Worker (`worker/feedback-worker.js`) that opens a `feedback`-labeled GitHub issue. The issue number is the serial referenced later as "implement feedback #N" — the rewording, plan, and implementation happen here in Claude Code with full repo context (no GitHub Action / API call). Feature-request feedback must clear the `taste-critic` design gate (max two passes) before implementing; the fix/feature commit references `(#N)`, gets the `next-release` label on dev, and is closed by the release process on the production merge. Setup/ops: `plans/done/FEEDBACK_PLAN.md`.
- **`app.js`** — Bootstrap: calls `store.autoEnableSync()` (restores a returning cloud user's space before first render, no-ops if no `spaceId` setting exists) then `ui.init()`, and registers the service worker.

## Legacy-field debt — normalize as you go (required)

Three fields have two shapes in the wild, and the code carries a runtime guard at every
read site instead of normalizing once. This is tracked tech debt (tech-debt audit,
2026-08-08, item #2). It can't be paid off in one commit: entries live on partner devices
we don't control, so old shapes keep arriving from sync and from imported backups.

| Field | Legacy shape | Current shape | Guard in the wild |
|---|---|---|---|
| `mood` | array of `MOOD_OPTIONS` keys — **or a bare number** on the oldest entries | `[]`; the free-text `vibe` replaced it | `Array.isArray(e.mood)` before every read |
| `cost` / `costTier` | numeric `cost` only, no tier | tier picked in the form, representative ₪ written to `cost` | `e.costTier \|\| tierForCost(e.cost)` |
| `enjoyment` | one unattributed 1–5 score | per-person ratings (see the ratings section of `ui.js`) | fall back to `enjoyment`, not attributed to "me" |

**The rule: when you touch a feature that reads one of these, normalize that field at the
boundary as part of the same change** — don't add another read-site guard.

- Normalize on **read into the app**, in the load path, not per render: an entry that comes
  back with a legacy shape gets converted once, and (if it changed) written back via
  `store.putDate` so it propagates to the partner and the debt shrinks.
- Keep the conversion in `model.js` next to `blankEntry()`, one exported function per field,
  each with a test in `test/logic.test.mjs` covering both shapes.
- Only after a field has no remaining read-site guards may its guard be deleted. Deleting a
  guard while any read site still relies on it breaks legacy entries silently — they render
  blank rather than throwing.
- Do **not** delete `MOOD_OPTIONS`. It is still live for reads (History/Suggest filter chips,
  `analytics.byMood()`, `topVibeWords()` fallback) regardless of the migration.

## Interaction-surface rule (tap/click/dismiss zones)

Learned the hard way (album-card collapse, 2026-08-08: 3 sessions, 6 commits for one tap zone). When adding or fixing *where* a tap/click lands — collapse-on-background, hit areas, event delegation:

1. **Write the rule as a one-sentence invariant first, phrased as a whitelist**: "everything triggers X except these interactive elements". Never fix by excluding the reported spot — exclusion lists of "content" zones create new dead zones, and each one becomes the next bug report.
2. **Test the property, not the example**: the smoke check sweeps the surface (`elementFromPoint` over each region / direct child of the container) and asserts every point either is a whitelisted interactive element or triggers the behavior. A single hand-picked coordinate proves nothing.
3. **Before declaring done, sweep the whole surface once yourself** — the second and third reports of a hit-area bug are always neighbors of the first.

## Key conventions

- All modules use ES module `import`/`export`. No CommonJS, no globals.
- Styling uses CSS custom properties (`--accent`, `--bg`, `--card`, etc.) defined in `css/styles.css` with automatic dark/light mode via `prefers-color-scheme`.
- Charts and UI are rendered as template-literal HTML strings inserted via `innerHTML`. There is no virtual DOM or diffing.
- Photos are downscaled to max 1280px on a canvas before storing as JPEG blobs in IndexedDB.
- The suggestion engine groups past activities by `normTitle()` (lowercased, whitespace-collapsed) — two entries with the same normalized title are treated as repeats of the same activity.
- Export/import serializes photos as data URLs in a single JSON file.

## Tuning the suggestion engine

The explore/exploit balance was calibrated so the slider midpoint (0.5) produces ~3 new / 3 favorite results out of 6. The key constants in `suggest.js`:
- `EXPLORE = 0.15 + explore * 1.45` — UCB exploration weight
- `NOVELTY_W = 0.3 + explore * 0.8` — recency variety bonus
- `HALFLIFE_DAYS = 120` — how quickly old enjoyment ratings decay
- `FATIGUE_DAYS = 5` — suppress recently-used categories

If changing these, verify the balance gradient: comfort(0) should yield ~5 fav/1 new, mid(0.5) ~3/3, adventure(1) ~1 fav/5 new.
