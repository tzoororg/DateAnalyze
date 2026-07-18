// Logic tests for the pure modules (model, analytics, suggest, charts).
// Run: node --test test/    — no dependencies, Node's built-in runner.
import test from "node:test";
import assert from "node:assert/strict";

import {
  CATEGORIES, MOOD_OPTIONS, blankEntry, normTitle, daysBetween,
  entryTimeMs, toILS, fmtMoney,
  COST_TIERS, tierForCost, tierLabel, repeatForEnjoyment, METER,
} from "../js/model.js";
import * as analytics from "../js/analytics.js";
import { suggest } from "../js/suggest.js";
import { barChart, trendChart, scatterChart, balanceDonut, wrappedCard } from "../js/charts.js";
import { SAMPLE_DATES } from "../js/sample.js";

// ---- fixture: sample dataset + edge cases ----
const dates = SAMPLE_DATES.map(f => f());
const legacyMoodEntry = { ...blankEntry(), title: "Old entry", mood: 4, enjoyment: 3, cost: 50 };
const noDateEntry = { ...blankEntry(), date: "", createdAt: 1700000000000, title: "No date field" };

// ================= model =================

test("again-o-meter maps enjoyment to wouldRepeat (top=yes, mid=maybe, low=no)", () => {
  assert.equal(repeatForEnjoyment(5), "yes");
  assert.equal(repeatForEnjoyment(4), "yes");
  assert.equal(repeatForEnjoyment(3), "maybe");
  assert.equal(repeatForEnjoyment(2), "no");
  assert.equal(repeatForEnjoyment(1), "no");
  assert.equal(METER.length, 5);
});

test("cost tiers bucket legacy numeric costs and label correctly", () => {
  assert.equal(tierForCost(null), null);
  assert.equal(tierForCost(0), "free");
  assert.equal(tierForCost(80), "low");
  assert.equal(tierForCost(250), "mid");
  assert.equal(tierForCost(900), "high");
  assert.equal(tierLabel("mid"), "$$");
  for (const t of COST_TIERS) assert.equal(tierForCost(t.ils), t.key); // representative ₪ round-trips
});

test("blankEntry v2 fields: free-text vibe and costTier", () => {
  const e = blankEntry();
  assert.equal(e.vibe, "");
  assert.equal(e.costTier, null);
});

test("normTitle trims, lowercases, collapses whitespace", () => {
  assert.equal(normTitle("  Mini  GOLF \n"), "mini golf");
  assert.equal(normTitle(null), "");
});

test("blankEntry has full schema with array mood and unique id", () => {
  const a = blankEntry(), b = blankEntry();
  for (const k of ["id", "date", "createdAt", "title", "category", "enjoyment",
    "mood", "effort", "wouldRepeat", "cost", "location", "notes", "photos"]) {
    assert.ok(k in a, `missing field ${k}`);
  }
  assert.ok(Array.isArray(a.mood) && Array.isArray(a.photos));
  assert.notEqual(a.id, b.id);
});

test("daysBetween / entryTimeMs / toILS / fmtMoney", () => {
  assert.equal(daysBetween(0, 86400000), 1);
  assert.equal(entryTimeMs(noDateEntry), 1700000000000); // falls back to createdAt
  assert.equal(toILS(10, "ILS"), 10);
  assert.equal(toILS(null, "USD"), null);
  assert.ok(toILS(10, "USD") > 10); // any sane ILS rate > 1
  assert.equal(fmtMoney(null), "—");
  assert.ok(fmtMoney(1234).includes("₪"));
});

// ================= analytics =================

test("summary matches hand-computed values", () => {
  const s = analytics.summary(dates);
  assert.equal(s.count, dates.length);
  const expectAvg = dates.reduce((t, d) => t + d.enjoyment, 0) / dates.length;
  assert.ok(Math.abs(s.avgEnjoyment - expectAvg) < 1e-9);
  const expectCost = dates.reduce((t, d) => t + d.cost, 0);
  assert.equal(s.totalCost, expectCost);
  assert.equal(s.totalCategories, CATEGORIES.length);
});

test("byCategory sorted by enjoyment, counts sum to total", () => {
  const rows = analytics.byCategory(dates);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].avgEnjoyment >= rows[i].avgEnjoyment);
  assert.equal(rows.reduce((t, r) => t + r.count, 0), dates.length);
});

test("monthlyTrend is chronological and complete", () => {
  const rows = analytics.monthlyTrend(dates);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].month < rows[i].month);
  assert.equal(rows.reduce((t, r) => t + r.count, 0), dates.length);
});

test("byMood ignores legacy numeric mood and counts correctly", () => {
  const rows = analytics.byMood([...dates, legacyMoodEntry]);
  const total = dates.reduce((t, d) => t + d.mood.length, 0);
  assert.equal(rows.reduce((t, r) => t + r.count, 0), total); // legacy entry contributed 0
  assert.ok(rows.every(r => MOOD_OPTIONS.some(m => m.key === r.key)));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].count >= rows[i].count);
});

test("onThisDay matches exact month/day from prior years only", () => {
  const now = new Date();
  const mk = (yearsAgo, sameDay) => {
    const d = new Date(now); d.setFullYear(d.getFullYear() - yearsAgo);
    if (!sameDay) d.setDate(d.getDate() + 3);
    const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return { ...blankEntry(), date: iso, title: `y${yearsAgo}` };
  };
  const hits = analytics.onThisDay([mk(1, true), mk(2, true), mk(1, false), mk(0, true)], now);
  assert.deepEqual(hits.map(h => h.title), ["y1", "y2"]); // newest first, no same-year, no offset-day
});

test("valueForMoney and repeatWorthy respect topN, no div-by-zero on free dates", () => {
  const v = analytics.valueForMoney(dates, 3);
  assert.equal(v.length, 3);
  assert.ok(v.every(d => isFinite(d.value)));
  for (let i = 1; i < v.length; i++) assert.ok(v[i - 1].value >= v[i].value);
  const r = analytics.repeatWorthy(dates, 4);
  assert.equal(r.length, 4);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
});

test("every analytics function handles an empty array", () => {
  assert.equal(analytics.summary([]).count, 0);
  assert.deepEqual(analytics.byCategory([]), []);
  assert.deepEqual(analytics.monthlyTrend([]), []);
  assert.deepEqual(analytics.valueForMoney([]), []);
  assert.deepEqual(analytics.enjoymentVsCost([]), []);
  assert.deepEqual(analytics.repeatWorthy([]), []);
  assert.deepEqual(analytics.byMood([]), []);
  assert.deepEqual(analytics.onThisDay([]), []);
  assert.deepEqual(analytics.highlightReel([]), []);
  assert.equal(analytics.explorationStats([]).ratio, 0);
});

// ================= suggest =================

test("suggest returns `count` complete candidates", () => {
  const out = suggest(dates, { count: 6 });
  assert.equal(out.length, 6);
  for (const c of out) {
    assert.ok(c.title && c.category && c.reason);
    assert.ok(["exploit", "explore"].includes(c.kind));
    assert.ok(isFinite(c.score));
  }
});

test("suggest respects budget / maxEffort / category filters", () => {
  const cheap = suggest(dates, { budget: 50 });
  assert.ok(cheap.every(c => c.estCost == null || c.estCost <= 50));
  const easy = suggest(dates, { maxEffort: 2 });
  assert.ok(easy.every(c => c.effort <= 2));
  const dining = suggest(dates, { category: "dining" });
  assert.ok(dining.every(c => c.category === "dining"));
});

test("balance gradient: comfort→favorites, adventure→new, mid→mix", () => {
  const kinds = explore =>
    suggest(dates, { explore, count: 6 }).filter(c => c.kind === "exploit").length;
  assert.ok(kinds(0) >= 4, `comfort should be favorite-heavy, got ${kinds(0)} exploit`);
  assert.ok(kinds(1) <= 2, `adventure should be new-heavy, got ${kinds(1)} exploit`);
  const mid = suggest(dates, { explore: 0.5, count: 6 });
  assert.ok(mid.some(c => c.kind === "exploit") && mid.some(c => c.kind === "explore"),
    "midpoint must mix both kinds");
});

test("suggest cold start (no history) returns catalog ideas", () => {
  const out = suggest([], { count: 6 });
  assert.equal(out.length, 6);
  assert.ok(out.every(c => c.kind === "explore"));
});

test("suggest tolerates legacy numeric mood entries", () => {
  assert.doesNotThrow(() => suggest([...dates, legacyMoodEntry], { moods: ["romantic"] }));
});

// ================= charts =================

test("chart functions return SVG strings for data and empty input", () => {
  const cat = analytics.byCategory(dates).map(r => ({ label: r.label, value: r.avgEnjoyment }));
  for (const svg of [
    barChart(cat), barChart([]),
    trendChart(analytics.monthlyTrend(dates)), trendChart([]),
    scatterChart(analytics.enjoymentVsCost(dates)), scatterChart([]),
    balanceDonut(3, 3),
  ]) {
    assert.ok(typeof svg === "string" && svg.trimStart().startsWith("<svg"), svg.slice(0, 60));
  }
});

test("wrappedCard renders stat strings for a fixture, and a graceful empty state", () => {
  const stats = {
    periodLabel: "ALL TIME", count: 12, avgEnjoyment: 4.3, totalCostFmt: "₪2,046",
    favCategory: { emoji: "🌳", label: "Outdoors", count: 7 },
    mostRepeated: { emoji: "🍜", title: "Ramen night", avgEnjoyment: 4.8 },
    bestMonth: { label: "May '26", count: 5 },
    vibes: ["silly", "romantic", "chill"],
  };
  const svg = wrappedCard(stats);
  assert.ok(svg.startsWith("<svg"));
  for (const needle of ["12", "4.3", "₪2,046", "Outdoors", "Ramen night", "May '26", "silly", "romantic", "chill"])
    assert.ok(svg.includes(needle), `missing "${needle}"`);

  const empty = wrappedCard({ periodLabel: "2026 SO FAR", count: 0 });
  assert.ok(empty.startsWith("<svg"));
  assert.ok(!empty.includes("undefined"));
});
