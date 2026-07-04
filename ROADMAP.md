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

---

## 4. Gentle reminders (opt-in push)

**What.** Two nudges: (a) anniversary-of-a-great-date — "A year ago you loved
*Rooftop dinner* (5★). Do it again?"; (b) inactivity — "It's been 3 weeks since
your last date."

**Why.** Competitors' retention runs on notifications; we send none. On-brand *if*
strictly opt-in — fits the privacy-first, local-first stance.

**Where it plugs in.**
- Content already computable: `onThisDay()` (`js/analytics.js:136`) for the
  anniversary nudge; "days since last date" from `entryTimeMs()` for inactivity.
- Delivery is the lift. PWA push needs a service worker `push`/notification handler
  in `sw.js` and permission UX. **Cheapest first step:** no server — use the
  Notification API + a `periodicSync`/on-open check that fires a local notification
  when the app is opened after a gap, before committing to Web Push + a Worker
  (we already run a Cloudflare Worker for feedback — see `FEEDBACK_PLAN.md` — so a
  push endpoint is a plausible later home).
- Settings: reminder on/off + time, stored via `getSetting`/`setSetting`
  (`js/store.js:95`, kept local).

**Effort.** Medium→Large (true background push is the large part). **Risk.** iOS
PWA notification support is historically flaky; verify on target devices before
investing. Start with local, open-triggered notifications.

**Skipped until validated:** server-driven Web Push, scheduled quiet hours.

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

## Explicitly NOT doing

- **Booking / restaurant marketplace** (Cupla, Fever, OpenTable) — needs
  partnerships/APIs, wrong lane.
- **Coaching content / quizzes** (Paired, Lasting) — huge content lift, wrong lane.
- **Home-screen widgets** — big for counter apps, but impractical for a PWA and
  low ROI. The milestone strip (#1) covers the same emotional need in-app.
