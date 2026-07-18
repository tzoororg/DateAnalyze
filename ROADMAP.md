# ROADMAP — feature plans

Plans only. Nothing here is implemented yet. Derived from a competitive scan of
date-night / couples apps (Cupla, Cobble, Paired, Lasting, Lovewick, The Couple,
Between, Locket, Kindu, LoveNudge, Happy Couple, …).

## Positioning (why these five)

The market splits into three crowded lanes and one nearly-empty one:

| Lane | Apps | Loop |
|---|---|---|
| Discovery / planning | Cupla, Cobble, SoulPlan, Fever | swipe/AI → find a *new* date → book it |
| Memory / counter | The Couple, Lovewick, Between, Locket | timeline, anniversary counters, widgets |
| Coaching | Paired, Lasting, Relish, Happy Couple | daily quiz/lesson, love languages (subscription) |
| **Quantified relationship** ← us | *(basically nobody)* | log dates you did → analytics → suggest from *your* history |

We already own the fourth lane (Insights + UCB1 bandit in `suggest.js`). These
features sharpen that moat and close the two things competitors do better:
**emotional payoff** and **a reason to reopen the app when not logging**. We are
deliberately *not* chasing booking marketplaces or coaching content — off-brand,
high-lift, wrong lane.

Ranked by (differentiation × emotional ROI ÷ effort). Ship #1 and #2 first.

---

## 1. Milestone / streak strip

**Status.** ✅ Shipped, then removed by choice — the strip didn't earn its
space on the Log tab. Recoverable from git history if wanted.

**What.** A one-line stat strip surfaced on the Log tab: e.g.
`47 dates · 3-month streak · ₪12,400 shared · longest gap 19 days`.

**Why.** The "days together" counter is the stickiest feature in the entire
memory-app category — the emotional anchor competitors lead with. We have the
data and show none of it as a running count. Every save should *bump a number*
so logging stops feeling like data entry and starts feeling like progress.

**Where it plugs in.**
- New pure function in `js/analytics.js`, e.g. `milestones(dates)` returning
  `{ total, currentStreakMonths, longestStreakMonths, totalShared, longestGapDays, firstDate }`.
  Reuses `entryTimeMs()`, `monthlyTrend()` (already computes per-month buckets —
  streak = run of consecutive months with count ≥ 1), and `summary().totalCost`.
- Render in `renderLog()` (`js/ui.js:170`), above or beside the existing memory
  card (`js/ui.js:174`). Same `.card` styling; no new CSS system.
- No schema change. No storage change.

**Effort.** Small (~1 analytics function + one render block). **Risk.** Streak
definition is a product choice — "consecutive months with ≥1 date" is the lazy,
legible default; document it inline. Handle the 0/1-date empty state.

**Skipped for later:** badges/achievements, animated count-ups. Add only if the
strip proves it pulls people back.

---

## 2. Shareable "Wrapped" recap card

**Status.** ✅ Shipped 2026-07-18.

**What.** A generated, shareable image (à la Spotify Wrapped): favorite category,
most-repeated date, best month, mood breakdown, total dates/spend for a period.

**Why.** This is the killer differentiator — **nobody else can build it**, because
it needs a real logged history, which only we have. Doubles as an organic growth
loop (couples share it). Turns cold analytics into something emotional and social.

**Where it plugs in.**
- All inputs already exist: `byCategory()`, `repeatWorthy()`, `byMood()`,
  `monthlyTrend()`, `summary()` in `js/analytics.js`.
- Render an SVG "card" via a new generator in `js/charts.js` (matches the existing
  hand-rolled inline-SVG pattern, CSS-variable theming). Rasterize to PNG by
  drawing the SVG onto a canvas (same canvas path already used by `downscale()` in
  `js/ui.js:1021`) → `canvas.toBlob()`.
- Share via the Web Share API (`navigator.share({ files: [...] })`) with a download
  fallback. Entry point: a button on the Insights tab (`renderInsights()`,
  `js/ui.js:661`) and/or the ⋯ menu.
- Add any new file to the `SHELL` array in `sw.js` and bump `CACHE` (`sw.js:4`).

**Effort.** Medium (SVG layout + rasterize + share). **Risk.** Web Share w/ files
is unsupported on some desktop browsers → download fallback is mandatory, not
optional. Photos in the card would leak faces into a shared image — default to
**no photos**, opt-in only.

**Skipped for later:** multi-slide story format, per-year picker. Start with a
single card for "all time" + "this year".

---

## 3. Wishlist — close the Suggest → Log loop

**Status.** ✅ Shipped 2026-07-18.

**What.** Let a Suggest result be saved as "want to try." Saved ideas live in a
lightweight list; picking one pre-fills the Log form when you actually do the date.

**Why.** `renderSuggest()` (`js/ui.js:740`) is currently a dead end — it
recommends but you can't act on or keep a suggestion. Competitors (Cupla, Flamme,
Cobble, Lovewick) all have wishlists/bucket lists. This is the missing bridge from
*retrospective* (our whole app) to *prospective*, and it gives a concrete reason
to reopen the app between dates.

**Where it plugs in.**
- Schema: add `status` to the date entry in `js/model.js` (`blankEntry()`),
  `"idea" | "planned" | "done"`, defaulting to `"done"` so every existing entry
  and normal log stays a real date. A wishlist item is just an entry with
  `status: "idea"` and no `enjoyment`/`mood` yet.
- **Analytics must exclude non-`done` entries** — audit every consumer in
  `js/analytics.js` and `js/suggest.js` to filter `status === "done"` (or treat
  missing as done). This is the main correctness risk; do it once at the data
  boundary, not per-call.
- A "Save idea" button on suggestion cards (`renderSugCards()`, `js/ui.js:803`);
  a small wishlist view (new sub-view or a filter in History, `renderHistory()`
  `js/ui.js:430`); "Log this" on a wishlist item pre-fills the draft from the
  saved title/category/`estCost`/`effort` (the `suggest()` result already carries
  these — `js/suggest.js:153`).
- Syncs for free: it's just a date doc, so `store.js`/`sync.js` route it like any
  other entry. Cloud rules unchanged.

**Effort.** Medium (schema + the analytics-exclusion audit is the real work).
**Risk.** Missing one analytics consumer pollutes charts/suggestions with
un-done ideas. One shared filter, tested.

**Skipped for later:** reminders/calendar for planned dates (see #4), reordering,
"planned" as a distinct middle state — start with just idea/done.

**Priority.** Important × Not urgent — closes a real dead-end in the app
(Suggest results can't be acted on) and directly matches a user ask, but
nobody's blocked on it today. Ship after #1/#2.

**User feedback (issue [#4](https://github.com/tzoororg/DateAnalyze/issues/4)):**
"add option to save an idea for a future date, maybe with url link" — this is
the same wishlist feature already planned above. The one net-new detail is an
optional **URL field** on the saved idea (e.g. a restaurant page or Pinterest
link) — add `url` alongside `status` in the `js/model.js` schema change,
rendered as a link on the wishlist card and in the pre-filled log form. No
other change needed; folded into this item rather than a separate one.

---

## 5. Double-blind date match (speculative — needs sync adoption)

**What.** Over sync, both partners privately mark suggestions yes/no; only mutual
yeses are revealed. Cobble/Kindu's mechanic, but seeded by *our* bandit instead of
a generic catalog.

**Why.** Genuinely novel versus every competitor — a suggestion engine that's
personalized *and* consensual. But it only makes sense once two-phone sync has
real usage.

**Where it plugs in.**
- Requires per-user private votes in a `spaces/{spaceId}` subcollection with
  `firestore.rules` updates so neither partner can read the other's vote until a
  match resolves server-side (or via a reveal doc). Non-trivial rules work.
- Suggestion source is `suggest()` (`js/suggest.js:20`); UI would be a new
  swipe/mark surface, likely folded into `renderSuggest()`.

**Effort.** Large (security-sensitive Firestore rules + new sync surface).
**Risk / gate.** Do **not** build until sync is actually used by real couples —
otherwise pure YAGNI. Parked deliberately.

---

---

# Wave 2 — game-changer candidates

Second brainstorm, same ground rules: plans only, ranked by leverage. These are
bigger swings than wave 1; none should start before #1/#2 above ship.

## 6. History import (kill the cold start)

**Status.** ✅ Photo-EXIF import shipped. `.ics` calendar import was built then
dropped (see below).

**⋯ menu → Import from photos** — pick many images → dependency-free EXIF
reader (`js/exif.js`, parses DateTimeOriginal + GPS from the APP1/TIFF segment)
reads each photo's capture date. **Photos taken on the same day are grouped
into one candidate date entry** (a date night = many photos = one entry, not
one-per-photo). Each group → a triage card (thumbnail + photo count, title,
category, editable date, Skip) → **Import kept** saves each group as one entry
via `blankEntry()` + `putDate()`, all its photos through
`downscale()`/`putPhoto()`. GPS from the first located photo becomes a
`"lat, lon"` string in the location field — no reverse-geocoding, no network
(privacy-first, as planned). Ratings stay at defaults, edited later in History.
Parser self-check: `node js/exif.test.mjs`.

**On "connect to Google Photos":** the native mobile file picker
(`accept="image/*"`) already surfaces Google Photos as a source on Android, so
no integration was needed for the common (phone) case — photos come through
with EXIF and group by day. The full Google Photos **Picker API** path (real
account connection, works on desktop too) was scoped but not built: Google
deprecated library browsing in 2025, the scope is "sensitive" (needs app
verification), and byte download is CORS-blocked so it needs a Worker proxy.
Parked unless desktop/account-based import is wanted.

**`.ics` calendar import** was implemented (`js/ics.js` VEVENT parser) then
removed at the user's request in favor of the photo path. Recoverable from git
history if ever wanted.

**What.** Seed years of past dates from external sources: pick photos from the
device (EXIF date + GPS), and/or import a calendar `.ics` — the app pre-fills
date/location/photo, the user adds title, category, and ratings in a fast
"triage" flow (one card per candidate, swipe to keep/skip).

**Why.** Cold start is our weakest moment — Insights and Suggest are useless at
3 entries. One import session turns a new user into a power user with 40
entries and instantly-meaningful analytics. This changes the *adoption curve*,
not just the feature list. No competitor does retroactive history building.

**Where it plugs in.**
- Photo path: `<input type="file" multiple accept="image/*">` → parse EXIF
  (DateTimeOriginal + GPS) — EXIF parsing is ~100 lines of DataView over the
  JPEG APP1 segment, no dependency needed. Reuse `downscale()` (`js/ui.js`) and
  `putPhoto()` for storage.
- Calendar path: `.ics` file input; parse `VEVENT` blocks (SUMMARY, DTSTART,
  LOCATION) with a small line parser — again no dependency.
- Triage UI: new flow reachable from the ⋯ menu next to the existing
  import/export. Each accepted candidate becomes a normal entry via
  `blankEntry()` + overrides → `putDate()`.
- Reverse-geocoding GPS → place name needs a network call; **skip it** — show
  coordinates-derived map link or leave location blank. Privacy-first.

**Effort.** Large (two parsers + a triage flow). Split: ship photo-EXIF import
first, `.ics` second. **Risk.** EXIF quirks across phone vendors; keep the
parser tolerant and always let the user edit the date.

## 7. Date Night mode (log as a byproduct)

**What.** A live in-date companion: tap "Start date night" → the app timestamps
the start, offers a big camera button that saves photos straight into a pending
pool, and on "End" opens the Log form pre-filled with date, duration, and the
photos taken.

**Why.** The app currently exists *before* (Suggest) and *after* (Log) a date,
never during. Logging friction is the disease every tracking app dies from;
this makes the log a byproduct of the evening instead of homework afterwards.

**Where it plugs in.**
- State: a single `activeDate` setting (`setSetting("activeDate", { startedAt,
  photoIds[] })`) — survives app closes, no schema change to entries.
- UI: a start button on the Log tab; while active, a slim persistent banner
  (elapsed time + camera button) across all tabs, rendered from `ui.js`'s
  existing header area. Camera = `<input type="file" capture="environment">` →
  `downscale()` → `putPhoto()` → append id to `activeDate.photoIds`.
- "End" → `renderLog()` with the draft pre-filled from `activeDate`, then clear
  the setting. If the user forgets to end it, auto-expire after ~12h and still
  offer the pre-filled draft next open.

**Effort.** Medium. **Risk.** Abandoned sessions — the 12h auto-expire +
recovery draft covers it. No geolocation tracking during the date (creepy,
off-brand); location stays a manual field.

## 11. Time-capsule notes

**What.** When logging, an optional "note to your future selves" field; it
resurfaces exactly one year later via the existing memory card.

**Why.** Manufactures the anniversary moment counter-apps fake with day
counters — but with the couple's own words. Near-zero code, disproportionate
emotional payoff.

**Where it plugs in.**
- Schema: optional `capsule` string on the entry (`js/model.js`).
- Log form: one collapsed-by-default text field in `renderLog()`.
- Surfacing: `onThisDay()` (`js/analytics.js`) already finds the entries; the
  memory card in `renderLog()` just renders `capsule` prominently when present.
- Syncs for free as part of the date doc.

**Effort.** Tiny — smallest item on either list; do it whenever.
**Risk.** None worth naming.

## 12. Make the app work on iOS

**What.** Install and run as a home-screen PWA on iPhone. Audit done 2026-07-15;
CSS/safe-area/viewport already iOS-ready. Remaining: a PNG `apple-touch-icon`
(iOS ignores the current SVG), a `signInWithRedirect` fallback for the Firebase
popup (unreliable in installed iOS PWAs), and a real-device verification pass
(push, IndexedDB persistence, sign-in). Full plan: [plans/done/IOS_PLAN.md](plans/done/IOS_PLAN.md)
(icon + auth fallback shipped 2026-07-18; on-device verification still open).

**Effort.** Small (icon + auth fallback) + one on-device test session.
**Risk.** iOS PWA quirks can't be emulated — the device pass is the real gate.

## Wave-2 ranking

1. **#6 import** — changes the adoption curve itself.
2. **#7 Date Night mode** — attacks the core friction of the whole category.
3. **#11 time capsule** — trivial; slot in anywhere.

## Explicitly NOT doing

- **Booking / restaurant marketplace** (Cupla, Fever, OpenTable) — needs
  partnerships/APIs, wrong lane.
- **Coaching content / quizzes** (Paired, Lasting) — huge content lift, wrong lane.
- **Home-screen widgets** — big for counter apps, but impractical for a PWA and
  low ROI. The milestone strip (#1) covers the same emotional need in-app.
