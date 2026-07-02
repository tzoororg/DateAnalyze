# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A dependency-free Progressive Web App for tracking dates with a partner. Four tabs: **Log** (post-date form), **History** (browse/search past dates, list or photo gallery view), **Insights** (charts/analytics), **Suggest** (date ideas via UCB1 multi-armed bandit). Pure HTML/CSS/vanilla JS with ES modules — no build step, no framework, no bundler. All data is local-only in IndexedDB.

## Development

```bash
python -m http.server 8000
```

Open http://localhost:8000 in Chrome. Use DevTools device toolbar for mobile preview. `file://` URLs won't work (ES modules and service worker require HTTP).

There is no build, lint, or test command. To populate the app with demo data: **⋯ menu → Add sample dates**.

**Service worker caching caveat:** During development, the SW caches aggressively. After changing files, either unregister the SW in DevTools → Application → Service Workers, or bump the `CACHE` version string in `sw.js`. When adding a new file, also add it to the `SHELL` array in `sw.js`.

## Architecture

Data flows one direction: `db.js` → domain logic → `ui.js` renders.

- **`js/model.js`** — Single source of truth for the data schema. A date entry has: id, date, title, category (one of 11 enum keys), enjoyment/effort (1–5), mood (array of `MOOD_OPTIONS` keys, multi-select), wouldRepeat (yes/maybe/no), cost, location, notes, photos (array of blob IDs). Categories and moods are defined here; add new ones to the `CATEGORIES`/`MOOD_OPTIONS` arrays. Legacy entries may have a numeric `mood` — display/analytics code checks `Array.isArray(e.mood)` before using it.
- **`js/db.js`** — Thin IndexedDB wrapper. Three object stores: `dates` (keyPath: id), `photos` (blobs stored separately to keep date records lean), `settings`. All CRUD is async. Photos are stored/retrieved by UUID; `deleteDate` cascades to delete associated photos.
- **`js/suggest.js`** — The core algorithm. Scores every candidate (past activities + unseen catalog ideas) with: `predictedEnjoyment + UCB1_exploration_bonus + novelty − fatigue`. The `explore` parameter (0–1, from the Adventure↔Comfort slider) scales the exploration constant. `ensureMix()` guarantees results contain both exploit and explore candidates when available. Past enjoyment uses recency-weighted averaging (120-day half-life).
- **`js/catalog.js`** — Seed catalog of ~49 date ideas used as the "explore pool" for cold-start suggestions. Each idea has title, category, estCost, effort, desc.
- **`js/analytics.js`** — Pure aggregation functions over the dates array (no side effects). Used by the Insights tab and the suggestion engine. Includes `byMood()` (frequency + avg enjoyment + top category per mood) and `onThisDay()` (entries from today's exact month/day in prior years, used for the Log tab's memory card).
- **`js/charts.js`** — Hand-rolled inline SVG chart generators. Each function returns an SVG string using CSS variables for theming.
- **`js/ui.js`** — Monolithic UI module that renders all three tabs. Manages a `draft` object (the form state) and a `dates` array (reloaded from DB after mutations). Photo blobs are converted to object URLs and cached in `urlCache`.
- **`js/feedback.js`** / **`js/feedback-config.js`** — In-app "Send feedback" modal (⋯ menu). POSTs text + optional photo to a Cloudflare Worker (`worker/feedback-worker.js`) that opens a `feedback`-labeled GitHub issue. The issue number is the serial referenced later as "implement feedback #N" — the rewording, plan, and implementation happen here in Claude Code with full repo context (no GitHub Action / API call). Setup/ops: `FEEDBACK_PLAN.md`.
- **`app.js`** — Bootstrap: calls `ui.init()` and registers the service worker.

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
