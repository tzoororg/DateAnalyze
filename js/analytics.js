// Aggregations over the date dataset. Pure functions -> easy to test.

import { CATEGORIES, catLabel, catEmoji, normTitle, entryTimeMs, REPEAT_OPTIONS } from "./model.js";

const repeatWeight = k => (REPEAT_OPTIONS.find(o => o.key === k)?.weight ?? 0.5);

export function summary(dates) {
  const n = dates.length;
  const withCost = dates.filter(d => d.cost != null && !isNaN(d.cost));
  const totalCost = withCost.reduce((s, d) => s + Number(d.cost), 0);
  const avgEnjoyment = n ? mean(dates.map(d => d.enjoyment)) : 0;
  const cats = new Set(dates.map(d => d.category));
  return {
    count: n,
    avgEnjoyment,
    totalCost,
    avgCost: withCost.length ? totalCost / withCost.length : 0,
    distinctCategories: cats.size,
    totalCategories: CATEGORIES.length,
  };
}

// Per-category stats, sorted by avg enjoyment desc.
export function byCategory(dates) {
  const map = new Map();
  for (const d of dates) {
    if (!map.has(d.category)) map.set(d.category, []);
    map.get(d.category).push(d);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    label: catLabel(key),
    emoji: catEmoji(key),
    count: items.length,
    avgEnjoyment: mean(items.map(i => i.enjoyment)),
    avgCost: meanDefined(items.map(i => i.cost)),
  })).sort((a, b) => b.avgEnjoyment - a.avgEnjoyment || b.count - a.count);
}

// Monthly trend: count + avg enjoyment per YYYY-MM, chronological.
export function monthlyTrend(dates) {
  const map = new Map();
  for (const d of dates) {
    const key = new Date(entryTimeMs(d)).toISOString().slice(0, 7);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, items]) => ({
      month,
      label: monthLabel(month),
      count: items.length,
      avgEnjoyment: mean(items.map(i => i.enjoyment)),
      totalCost: items.reduce((s, i) => s + (Number(i.cost) || 0), 0),
    }));
}

// Best bang-for-buck: enjoyment per dollar (free counted as low cost).
export function valueForMoney(dates, topN = 5) {
  return dates
    .filter(d => d.cost != null && !isNaN(d.cost))
    .map(d => {
      const cost = Math.max(Number(d.cost), 1); // avoid div by zero; free ~= great value
      return { ...d, value: d.enjoyment / Math.log10(cost + 9) }; // damped so $0 doesn't dominate absurdly
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, topN);
}

// Scatter points for enjoyment vs cost.
export function enjoymentVsCost(dates) {
  return dates
    .filter(d => d.cost != null && !isNaN(d.cost))
    .map(d => ({ x: Number(d.cost), y: d.enjoyment, label: d.title, category: d.category }));
}

// Repeat-worthy activities: combine enjoyment + wouldRepeat, grouped by activity title.
export function repeatWorthy(dates, topN = 5) {
  const map = new Map();
  for (const d of dates) {
    const k = normTitle(d.title);
    if (!k) continue;
    if (!map.has(k)) map.set(k, { title: d.title, category: d.category, items: [] });
    map.get(k).items.push(d);
  }
  return [...map.values()].map(g => {
    const avgEnj = mean(g.items.map(i => i.enjoyment));
    const avgRep = mean(g.items.map(i => repeatWeight(i.wouldRepeat)));
    return {
      title: g.title,
      category: g.category,
      count: g.items.length,
      avgEnjoyment: avgEnj,
      score: avgEnj * (0.6 + 0.4 * avgRep), // enjoyment, nudged by repeat appetite
    };
  }).sort((a, b) => b.score - a.score).slice(0, topN);
}

// Exploration ratio over the last `windowDays`: share of dates whose category
// had not appeared before that date (i.e. how much you've been branching out).
export function explorationStats(dates) {
  const sorted = [...dates].sort((a, b) => entryTimeMs(a) - entryTimeMs(b));
  const seen = new Set();
  let novel = 0;
  for (const d of sorted) {
    if (!seen.has(d.category)) { novel++; seen.add(d.category); }
  }
  const ratio = sorted.length ? novel / sorted.length : 0;
  // Recent leaning: of last 6 dates, how many were a category-repeat vs new?
  const recent = sorted.slice(-6);
  const seen2 = new Set(sorted.slice(0, -6).map(d => d.category));
  let recentNew = 0;
  for (const d of recent) { if (!seen2.has(d.category)) recentNew++; seen2.add(d.category); }
  return { novelCount: novel, ratio, recentNew, recentTotal: recent.length };
}

// Mood frequency + per-mood stats, sorted by count desc.
export function byMood(dates) {
  const map = new Map();
  for (const d of dates) {
    for (const m of (Array.isArray(d.mood) ? d.mood : [])) {
      if (!map.has(m)) map.set(m, []);
      map.get(m).push(d);
    }
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    count: items.length,
    avgEnjoyment: mean(items.map(i => i.enjoyment)),
    topCategory: modeBy(items, i => i.category),
  })).sort((a, b) => b.count - a.count);
}

// Entries from exactly today's month/day in prior years, newest first.
export function onThisDay(dates, now = new Date()) {
  const mm = now.getMonth(), dd = now.getDate(), yy = now.getFullYear();
  return dates
    .filter(d => {
      const t = new Date(entryTimeMs(d));
      return t.getMonth() === mm && t.getDate() === dd && t.getFullYear() < yy;
    })
    .sort((a, b) => entryTimeMs(b) - entryTimeMs(a));
}

// Ordered reel of highlight photos for the in-app slideshow and, later, an OS
// lockscreen carousel. Pure: no DOM, no DB. A native port reuses THIS function
// (the "which photos, in what order" logic); the web slideshow UI is throwaway.
// ponytail: photo *bytes* live device-local in IndexedDB. OS integration later
// must export them to the OS photo store — that's the real port work, not this.
// Returns [{ entryId, photoId, title, dateMs, score }], best first.
export function highlightReel(dates, now = new Date()) {
  const anniversary = new Set(onThisDay(dates, now).map(d => d.id));
  const reel = [];
  for (const d of dates) {
    if (!Array.isArray(d.photos) || !d.photos.length) continue;
    let score = (Number(d.enjoyment) || 0)
      + repeatWeight(d.wouldRepeat) * 1.5   // yes → +1.5, maybe → +0.75, no → 0
      + (anniversary.has(d.id) ? 2 : 0);    // resurface on-this-day memories
    const jitter = Math.random();           // reshuffle equal-score entries each launch
    for (const photoId of d.photos)
      reel.push({ entryId: d.id, photoId, title: d.title, dateMs: entryTimeMs(d), score, jitter });
  }
  return reel.sort((a, b) => (b.score - a.score) || (a.jitter - b.jitter));
}

// ---- helpers ----
export function mean(arr) {
  const v = arr.filter(x => x != null && !isNaN(x)).map(Number);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
}
function modeBy(arr, fn) {
  const counts = new Map();
  for (const x of arr) { const k = fn(x); counts.set(k, (counts.get(k) || 0) + 1); }
  let best = null, max = 0;
  for (const [k, n] of counts) if (n > max) { best = k; max = n; }
  return best;
}
function meanDefined(arr) {
  const v = arr.filter(x => x != null && !isNaN(x)).map(Number);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
function monthLabel(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
