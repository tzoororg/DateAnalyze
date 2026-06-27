# Us ♥ — Date Tracker

A private, installable app for logging dates with your partner, seeing what you both
love, and getting date-idea suggestions that **balance repeating favorites with trying
new things**.

It's a **Progressive Web App** — pure HTML/CSS/JavaScript, no build step, no accounts,
no server. All your data (including photos) lives **only on your phone** in the browser's
IndexedDB. The only thing that ever leaves the device is a backup file *you* choose to
export.

## What it does

- **Log** — after a date, fill a quick form: what you did, category, enjoyment / mood /
  effort ratings, would-you-repeat, cost, location, notes, and photos (camera or gallery).
- **Insights** — charts: enjoyment by category, trend over time, enjoyment-vs-cost,
  best value for money, most repeat-worthy activities, and your "adventure balance".
- **Suggest** — ranked date ideas with a plain-English reason for each, an
  **Adventure ↔ Comfort** slider, and budget / effort / category filters.

### How suggestions stay balanced (the interesting bit)

The Suggest tab treats date choice as a **multi-armed bandit** and scores every candidate:

```
score = predictedEnjoyment                      # exploit what you love
      + EXPLORE * sqrt( ln(N+2) / (tries+1) )    # explore the untried (UCB1)
      + noveltyBonus(daysSinceLastTime)          # variety even among repeats
      - fatiguePenalty(sameCategoryRecently)     # don't repeat yesterday
```

- Favorites you rate highly and would repeat float up (**exploit**).
- Ideas you've rarely or never tried get an exploration bonus that shrinks the more you
  do them (**explore**) — this is the classic UCB1 rule.
- A built-in **catalog of ~45 date ideas** seeds the explore pool so suggestions are
  useful from day one, before you've logged much.
- The **slider** scales how adventurous the mix is; results always include both a
  "Favorite" and a "New" option when possible.

See `js/suggest.js`.

## Run it locally (for testing on your computer)

You have Python, so no install is needed:

```bash
cd T:/programming/claude/DateAnalyze
python -m http.server 8000
```

Open **http://localhost:8000** in Chrome. Use DevTools (F12) → device toolbar to preview
the phone layout. Open the **⋯ menu → Add sample dates** to populate Insights & Suggest
instantly.

> Note: opening `index.html` directly via `file://` won't work — ES modules and the
> service worker need to be served over http. Use the command above.

## Put it on your Android phone

A PWA needs HTTPS to be installable, so host the folder on any free static host:

**Easiest — Netlify Drop (no account/CLI):**
1. Go to https://app.netlify.com/drop
2. Drag the whole `DateAnalyze` folder onto the page.
3. Open the given `https://…netlify.app` link on your Android phone in Chrome.
4. Chrome menu (⋮) → **Add to Home screen / Install app**.

**Alternative — GitHub Pages (you have git):**
```bash
cd T:/programming/claude/DateAnalyze
git init && git add . && git commit -m "Date tracker PWA"
# create an empty GitHub repo, then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
Then in the repo: **Settings → Pages → Deploy from branch → main / root**. Open the
published `https://<you>.github.io/<repo>/` on your phone and Install.

Once installed it launches full-screen, works offline (airplane mode is fine), and keeps
your data between launches.

## Backup & moving data

⋯ menu → **Export** writes a JSON file (dates + photos). **Import** restores it. Use this
to back up or move data to a new phone. (Data is per-device — there's no automatic sync.)

## Project layout

```
index.html              app shell + tab nav
css/styles.css          mobile-first styling (auto dark/light)
app.js                  bootstrap + service-worker registration
js/model.js             categories, entry schema, helpers
js/db.js                IndexedDB wrapper (dates, photos, settings, export/import)
js/catalog.js           seed date-idea catalog (explore pool)
js/analytics.js         dataset aggregations
js/charts.js            inline-SVG charts (no dependencies)
js/suggest.js           UCB1 suggestion engine
js/ui.js                renders tabs, form, photos, charts, suggestions
js/sample.js            demo dataset
manifest.webmanifest    PWA manifest
sw.js                   service worker (offline cache)
icons/                  app icons (SVG)
```

## Notes & future ideas

- Local-only by design. If you later want shared logging across both phones, that needs a
  small cloud backend — the export/import gives a manual stand-in for now.
- Want a true Play-Store `.apk`? This same UI can be wrapped with Capacitor/WebView, but
  that path requires installing the Android SDK.
