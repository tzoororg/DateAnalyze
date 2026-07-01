// Suggestion engine: a multi-armed bandit (UCB1-style) over date ideas.
//
//   score = predictedEnjoyment                         // EXPLOIT what you love
//         + EXPLORE * sqrt( ln(N+2) / (tries+1) )       // EXPLORE the untried
//         + noveltyBonus(daysSinceLastTime)             // variety even among repeats
//         - fatiguePenalty(sameCategoryVeryRecently)    // don't repeat yesterday
//
// The Adventure<->Comfort slider scales EXPLORE (and novelty). Candidates are your
// own past activities (exploit pool) plus unseen ideas from the seed catalog (explore pool).

import { CATALOG } from "./catalog.js";
import { catLabel, normTitle, entryTimeMs } from "./model.js";
import { mean } from "./analytics.js";

const HALFLIFE_DAYS = 120;   // recency weighting for past enjoyment
const NEUTRAL = 3.0;         // prior enjoyment for a totally unknown idea
const FATIGUE_DAYS = 5;      // suppress a category done within this many days
const repeatWeight = { yes: 1.0, maybe: 0.5, no: 0.0 };

export function suggest(dates, opts = {}) {
  const {
    explore = 0.5,        // 0 = comfort, 1 = adventure
    budget = null,        // max $ per date
    maxEffort = null,     // 1..5
    category = null,      // restrict to one category key
    moods = [],           // restrict to activities that produced these vibes
    count = 6,
    jitter = false,       // add small randomness so "shuffle" varies results
  } = opts;

  const now = Date.now();
  const N = dates.length;

  // ---- Aggregate the dataset ----
  const acts = new Map();   // normTitle -> activity stats
  const cats = new Map();   // category   -> category stats
  for (const d of dates) {
    const t = entryTimeMs(d);
    const k = normTitle(d.title);
    const dMoods = Array.isArray(d.mood) ? d.mood : [];
    if (k) {
      if (!acts.has(k)) acts.set(k, { title: d.title, category: d.category, items: [], lastMs: 0, moods: new Set() });
      const a = acts.get(k); a.items.push(d); a.lastMs = Math.max(a.lastMs, t);
      for (const m of dMoods) a.moods.add(m);
    }
    if (!cats.has(d.category)) cats.set(d.category, { items: [], lastMs: 0, moods: new Set() });
    const c = cats.get(d.category); c.items.push(d); c.lastMs = Math.max(c.lastMs, t);
    for (const m of dMoods) c.moods.add(m);
  }
  const globalAvg = N ? mean(dates.map(d => d.enjoyment)) : NEUTRAL;

  const EXPLORE = 0.15 + explore * 1.45;      // bandit exploration constant (0=comfort .. 1=adventure)
  const NOVELTY_W = 0.3 + explore * 0.8;

  // ---- Build candidates ----
  const candidates = [];

  // Exploit pool: things you've actually done.
  for (const a of acts.values()) {
    candidates.push(buildCandidate({
      title: a.title, category: a.category,
      estCost: avgDefined(a.items.map(i => i.cost)),
      effort: Math.round(mean(a.items.map(i => i.effort)) || 3),
      desc: a.items[a.items.length - 1].notes || "",
      isPast: true, acts, cats, globalAvg, N, EXPLORE, NOVELTY_W, now,
    }));
  }

  // Explore pool: catalog ideas you have NOT logged yet.
  for (const idea of CATALOG) {
    if (acts.has(normTitle(idea.title))) continue; // already in exploit pool
    candidates.push(buildCandidate({
      title: idea.title, category: idea.category, estCost: idea.estCost,
      effort: idea.effort, desc: idea.desc,
      isPast: false, acts, cats, globalAvg, N, EXPLORE, NOVELTY_W, now,
    }));
  }

  // ---- Filter ----
  let pool = candidates.filter(c => {
    if (category && c.category !== category) return false;
    if (maxEffort && c.effort > maxEffort) return false;
    if (budget != null && c.estCost != null && c.estCost > budget) return false;
    if (moods.length) {
      const actMoods = acts.get(normTitle(c.title))?.moods;
      const catMoods = cats.get(c.category)?.moods;
      const known = actMoods?.size || catMoods?.size;
      if (known) {
        const match = moods.some(m => actMoods?.has(m) || catMoods?.has(m));
        if (!match) return false;
      }
      // no mood history at all → include (benefit of the doubt for explore ideas)
    }
    return true;
  });
  if (!pool.length) pool = candidates; // never return nothing because of filters

  if (jitter) for (const c of pool) c.score += (Math.random() - 0.5) * 0.5 * (0.4 + explore);

  pool.sort((a, b) => b.score - a.score);

  // Guarantee the result visibly balances both modes when both pools exist.
  const balanced = ensureMix(pool, count);
  return balanced;
}

function buildCandidate({ title, category, estCost, effort, desc, isPast, acts, cats, globalAvg, N, EXPLORE, NOVELTY_W, now }) {
  const k = normTitle(title);
  const a = acts.get(k);
  const c = cats.get(category);
  const actTimes = a ? a.items.length : 0;
  const catTimes = c ? c.items.length : 0;

  // EXPLOIT term: predicted enjoyment.
  let base, avgEnj = null, avgRepeat = null, catAvg = null;
  if (actTimes > 0) {
    avgEnj = recencyWeightedEnjoyment(a.items, now);
    avgRepeat = mean(a.items.map(i => repeatWeight[i.wouldRepeat] ?? 0.5));
    base = avgEnj * (0.7 + 0.3 * avgRepeat);        // loved + want-to-repeat scores highest
  } else if (catTimes > 0) {
    catAvg = mean(c.items.map(i => i.enjoyment));
    base = catAvg * 0.9;                             // inherit category taste, small unknown discount
  } else {
    base = globalAvg ? globalAvg * 0.85 : NEUTRAL;   // brand-new territory
  }

  // EXPLORE term: UCB bonus, biggest for untried activities.
  const exploreBonus = EXPLORE * Math.sqrt(Math.log(N + 2) / (actTimes + 1));

  // NOVELTY term: reward time since you last did this (or this category).
  const lastMs = a?.lastMs || c?.lastMs || 0;
  const daysSince = lastMs ? (now - lastMs) / 86400000 : 999;
  const novelty = NOVELTY_W * clamp(daysSince / 30, 0, 1.5);

  // FATIGUE: penalize a category you did in the last few days.
  const catDays = c?.lastMs ? (now - c.lastMs) / 86400000 : 999;
  const fatigue = catDays < FATIGUE_DAYS ? 0.8 * (1 - catDays / FATIGUE_DAYS) : 0;

  const score = base + exploreBonus + novelty - fatigue;
  const kind = actTimes > 0 ? "exploit" : "explore";

  // Collect photos from the best-enjoyed past entries (up to 4 photos).
  let photos = [];
  if (a && a.items.length) {
    const byEnj = [...a.items].sort((x, y) => y.enjoyment - x.enjoyment);
    for (const item of byEnj) {
      for (const pid of (item.photos || [])) {
        if (photos.length < 4) photos.push(pid);
      }
    }
  }

  return {
    title, category, estCost, effort, desc, score, kind,
    actTimes, catTimes, avgEnj, catAvg, daysSince, photos,
    reason: reasonFor({ kind, title, avgEnj, catAvg, category, catTimes, daysSince, actTimes }),
  };
}

function reasonFor({ kind, avgEnj, catAvg, category, catTimes, daysSince, actTimes }) {
  if (kind === "exploit") {
    if (daysSince > 21) return `You rated this ${avgEnj.toFixed(1)}★ and haven't done it in ${humanGap(daysSince)} — worth a comeback.`;
    return `A reliable favorite you've enjoyed ${actTimes} time${actTimes > 1 ? "s" : ""} (${avgEnj.toFixed(1)}★).`;
  }
  // explore
  if (catTimes > 0 && catAvg != null)
    return `Something new in ${catLabel(category)} — a category you rate ${catAvg.toFixed(1)}★ on average.`;
  return `A whole new kind of date for the two of you — pure adventure.`;
}

// ---- balance helper ----
function ensureMix(sorted, count) {
  const out = sorted.slice(0, count);
  const haveExplore = out.some(c => c.kind === "explore");
  const haveExploit = out.some(c => c.kind === "exploit");
  const tryAdd = kind => {
    const cand = sorted.find(c => c.kind === kind && !out.includes(c));
    if (cand) { out[out.length - 1] = cand; return true; }
    return false;
  };
  if (!haveExplore && sorted.some(c => c.kind === "explore") && out.length) tryAdd("explore");
  if (!haveExploit && sorted.some(c => c.kind === "exploit") && out.length) tryAdd("exploit");
  return out;
}

// ---- math helpers ----
function recencyWeightedEnjoyment(items, now) {
  let wsum = 0, vsum = 0;
  for (const i of items) {
    const days = Math.max(0, (now - entryTimeMs(i)) / 86400000);
    const w = Math.pow(0.5, days / HALFLIFE_DAYS);
    wsum += w; vsum += w * i.enjoyment;
  }
  return wsum ? vsum / wsum : mean(items.map(i => i.enjoyment));
}
function avgDefined(arr) {
  const v = arr.filter(x => x != null && !isNaN(x)).map(Number);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function humanGap(days) {
  if (days < 14) return `${Math.round(days)} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${(days / 365).toFixed(1)} years`;
}
