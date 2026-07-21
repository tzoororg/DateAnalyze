# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free Progressive Web App for tracking dates with a partner. Four tabs: **Log** (post-date form), **History** (browse/search past dates, list or photo gallery view), **Insights** (charts/analytics), **Suggest** (date ideas via UCB1 multi-armed bandit). Pure HTML/CSS/vanilla JS with ES modules — no build step, no framework, no bundler. Data is local-only in IndexedDB by default; two-phone sync via Firebase is an opt-in layer (see below) that never loads unless the user turns it on.

## Development

```bash
python -m http.server 8000
```

Open http://localhost:8000 in Chrome. Use DevTools device toolbar for mobile preview. `file://` URLs won't work (ES modules and service worker require HTTP).

There is no build or lint command. To populate the app with demo data: **⋯ menu → Add sample dates**. Tests exist — see Testing below.

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
node --test test/logic.test.mjs   # pure logic: model/analytics/suggest/charts (~1s)
node test/smoke.mjs               # UI smoke in headless Chrome; needs python -m http.server 8000
node test/sync.mjs                # two-phone sync; needs the server AND the emulators (below)
```

- **After any change:** run logic + smoke. Both must pass before commit.
- **When touching `sync.js`, `store.js`, or `firestore.rules`:** also run the sync test. It simulates two phones as separate headless-Chrome profiles talking to the **Firebase Emulator Suite** — start it first with `firebase emulators:start --only auth,firestore --project us-date-tracker-c988b` (firebase-tools + Java runtime, both installed on this machine). The `?emu=1` URL param is a dev hook in `sync.js` that routes Auth/Firestore to the emulators and swaps the Google popup for anonymous sign-in.
- New feature with a genuinely new UI flow → add a check to `test/smoke.mjs` (plus a `?shot=` state in `js/dev-shots.js` if needed). New pure logic → a test in `test/logic.test.mjs`.
- The shared headless-Chrome CDP client lives in `test/cdp.mjs` (also used by `design/capture.mjs`).

## Finishing a task (required)

When a change is complete and verified, **commit and push without being asked**, in the same turn. Day-to-day work is committed and pushed on the **`dev` branch** — a GitHub Actions workflow (`.github/workflows/deploy.yml`) deploys `dev` to the **beta app** at `/beta/` and `master` to the production app at the site root. Releasing = bump the SW `CACHE` version on `dev` (one semver bump covering everything since the last release — production phones only update when it changes), then merge `dev` into `master` and push, **only when the user asks for a release**. Beta phones update on every dev push automatically (SHA-stamped cache), so dev commits need no version bump. Never end a task with unpushed app changes unless the user said to hold off.

**Issue / roadmap traceability (required).** Every commit that resolves a GitHub feedback issue names it in the subject as `(#N)`; every commit that ships a roadmap feature names the point as `(roadmap #N)` (e.g. `Fix inverted star ratings (#12, #15)`, `Add wishlist (roadmap #3)`). A roadmap point's `**Status.**` line links its issue when one exists. This is the map from *issue → commit* and *feature → roadmap point*. Because these commits land on **dev** (not the default branch), GitHub does not auto-close the issue — instead:
- When a fix/feature lands on **dev**, add the **`next-release`** label to its issue(s) (it's live on beta, closes at the next production release).
- The **release process closes them** when the work reaches master — the release skill's Ship phase scans `git log master..dev` for `#N` references and closes each with a comment + removes `next-release`. See `.claude/skills/release/SKILL.md` Phase 6.

## Architecture

Data flows one direction: `store.js` (→ `db.js` or `sync.js`) → domain logic → `ui.js` renders.

- **`js/store.js`** — Façade in front of the data layer. Exposes the same 12-function CRUD interface as `db.js` (`getAllDates`, `putDate`, `getDate`, `deleteDate`, `putPhoto`, `getPhoto`, `deletePhoto`, `getSetting`, `setSetting`, `exportAll`, `importAll`, `wipeAll`) plus mode control (`getMode`, `getUser`, `signIn`, `createSpace`, `joinSpace`, `signOut`, `autoEnableSync`) and `subscribe(cb)` for remote-change notifications. `ui.js` imports this instead of `db.js` directly and is otherwise unaware of which backend is active. Settings always read/write `db.js` directly (never routed to the cloud), since they include the `spaceId` setting that decides which backend to use.
- **`js/sync.js`** — Cloud backend (Firebase Auth + Firestore), dynamically `import()`-ed only when sync is ever turned on — local-only users never download it. Mirrors `db.js`'s interface so `store.js` can swap backends transparently. Each couple is an isolated `spaces/{spaceId}` doc with `dates` and `members` subcollections and a separate `invites/{CODE}` doc for 6-char pairing codes (see `firestore.rules`). **Photos are device-local even in cloud mode:** the project runs on Firebase's free Spark plan, which has no Cloud Storage, so photo blobs stay in each device's IndexedDB. A date doc's `photos[]` id list still syncs, so a partner sees the entry but not photos they didn't add. `storage.rules` and the Storage upload/download path are kept in git history for a future Blaze-plan upgrade. Config lives in `js/firebase-config.js` (filled in from the Firebase console — see `plans/done/SYNC_PLAN.md`).
- **`js/model.js`** — Single source of truth for the data schema. A date entry has: id, date, title, category (one of 11 enum keys), enjoyment/effort (1–5), mood (array of `MOOD_OPTIONS` keys, multi-select), wouldRepeat (yes/maybe/no), cost, location, notes, photos (array of blob IDs). Categories and moods are defined here; add new ones to the `CATEGORIES`/`MOOD_OPTIONS` arrays. Legacy entries may have a numeric `mood` — display/analytics code checks `Array.isArray(e.mood)` before using it.
- **`js/db.js`** — Thin IndexedDB wrapper; the local backend behind `store.js`. Three object stores: `dates` (keyPath: id), `photos` (blobs stored separately to keep date records lean), `settings`. All CRUD is async. Photos are stored/retrieved by UUID; `deleteDate` cascades to delete associated photos. `cachePhoto(id, blob)` writes under a caller-supplied id, used by `sync.js` to mirror cloud photos locally.
- **`js/suggest.js`** — The core algorithm. Scores every candidate (past activities + unseen catalog ideas) with: `predictedEnjoyment + UCB1_exploration_bonus + novelty − fatigue`. The `explore` parameter (0–1, from the Adventure↔Comfort slider) scales the exploration constant. `ensureMix()` guarantees results contain both exploit and explore candidates when available. Past enjoyment uses recency-weighted averaging (120-day half-life).
- **`js/catalog.js`** — Seed catalog of ~49 date ideas used as the "explore pool" for cold-start suggestions. Each idea has title, category, estCost, effort, desc.
- **`js/analytics.js`** — Pure aggregation functions over the dates array (no side effects). Used by the Insights tab and the suggestion engine. Includes `byMood()` (frequency + avg enjoyment + top category per mood) and `onThisDay()` (entries from today's exact month/day in prior years, used for the Log tab's memory card).
- **`js/charts.js`** — Hand-rolled inline SVG chart generators. Each function returns an SVG string using CSS variables for theming.
- **`js/ui.js`** — Monolithic UI module that renders all three tabs. Manages a `draft` object (the form state) and a `dates` array (reloaded from DB after mutations). Photo blobs are converted to object URLs and cached in `urlCache`.
- **`js/feedback.js`** / **`js/feedback-config.js`** — In-app "Send feedback" modal (⋯ menu). POSTs text + optional photo to a Cloudflare Worker (`worker/feedback-worker.js`) that opens a `feedback`-labeled GitHub issue. The issue number is the serial referenced later as "implement feedback #N" — the rewording, plan, and implementation happen here in Claude Code with full repo context (no GitHub Action / API call). Feature-request feedback must clear the `taste-critic` design gate (max two passes) before implementing; the fix/feature commit references `(#N)`, gets the `next-release` label on dev, and is closed by the release process on the production merge. Setup/ops: `plans/done/FEEDBACK_PLAN.md`.
- **`app.js`** — Bootstrap: calls `store.autoEnableSync()` (restores a returning cloud user's space before first render, no-ops if no `spaceId` setting exists) then `ui.init()`, and registers the service worker.

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
