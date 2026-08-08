// INSIGHTS tab: Wrapped card + the charts below it. Split out of ui.js — it reads
// the date list and owns nothing else, so the only thing it needs from ui.js is a
// way to ask for the dates and a way to jump to the Suggest tab.
//
// ctx: { done() -> entries excluding wishlist ideas, goSuggest() }

import { MOOD_OPTIONS, catEmoji, entryTimeMs, tierLabel, tierForCost } from "./model.js";
import * as A from "./analytics.js";
import * as C from "./charts.js";
import {
  viewEl, bind, escHtml, emptyState2, wireEmpty2Cta, toast, attachSwipe,
} from "./ui-shared.js";

let wrapPeriod = "year";
let ctx = null;

// Most-used vibe words for the "our vibe" line: prefers the free-text `vibe`
// field, falling back to the legacy `mood` array for pre-v2 entries.
function topVibeWords(list, n) {
  const freq = new Map();
  for (const d of list) {
    const w = (d.vibe || "").trim().toLowerCase();
    if (w) freq.set(w, (freq.get(w) || 0) + 1);
  }
  if (!freq.size) {
    for (const d of list) for (const m of (Array.isArray(d.mood) ? d.mood : [])) {
      const label = (MOOD_OPTIONS.find(o => o.key === m)?.label || m).toLowerCase();
      freq.set(label, (freq.get(label) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

// Full month name only ("June"), not a specific date — Release triage backlog, v2.1.0.
function fullMonthName(ym) {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "long" });
}

function wrappedStats(period) {
  const done = ctx.done;
  const year = new Date().getFullYear();
  let effPeriod = period;
  let list = period === "year" ? done().filter(d => new Date(entryTimeMs(d)).getFullYear() === year) : done();
  let fallbackNote = null;
  if (period === "year" && !list.length && done().length) {
    list = done();
    effPeriod = "all";
    fallbackNote = `No dates in ${year} yet — showing all time`;
  }
  const periodLabel = effPeriod === "year" ? `${year} SO FAR` : "ALL TIME";
  const s = A.summary(list);
  if (!s.count) return { periodLabel, count: 0 };
  const cats = A.byCategory(list);
  // most-dated category wins "favorite" (tie-break by avg enjoyment) — sorting
  // purely by avg enjoyment let a single 5-heart outlier beat a real favorite.
  const favCat = cats.length
    ? [...cats].sort((a, b) => b.count - a.count || b.avgEnjoyment - a.avgEnjoyment)[0]
    : null;
  const bestMonth = A.monthlyTrend(list).reduce((a, b) => (b.count > a.count ? b : a));
  const repeats = A.repeatWorthy(list, list.length);
  const mostRepeated = repeats.length ? repeats.reduce((a, b) => (b.count > a.count ? b : a)) : null;
  const td = A.tierDistribution(list);
  return {
    periodLabel,
    fallbackNote,
    count: s.count,
    avgEnjoyment: s.avgEnjoyment,
    usualTier: td ? { label: tierLabel(td.usual), pct: td.pct } : null,
    distinctCategories: s.distinctCategories,
    totalCategories: s.totalCategories,
    favCategory: favCat ? { emoji: favCat.emoji, label: favCat.label, count: favCat.count } : null,
    mostRepeated: mostRepeated && mostRepeated.count > 1
      ? { emoji: catEmoji(mostRepeated.category), title: mostRepeated.title, avgEnjoyment: mostRepeated.avgEnjoyment }
      : null,
    bestMonth: { label: fullMonthName(bestMonth.month), count: bestMonth.count },
    vibes: topVibeWords(list, 3),
  };
}

async function onShareWrapped() {
  const svgStr = C.wrappedCard(wrappedStats(wrapPeriod), document.documentElement.dataset.theme || "plum");
  const url = URL.createObjectURL(new Blob([svgStr], { type: "image/svg+xml" }));
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  URL.revokeObjectURL(url);

  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = C.WRAPPED_W * scale;
  canvas.height = C.WRAPPED_H * scale;
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(async blob => {
    if (!blob) return;
    const file = new File([blob], "us-wrapped.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return; // user cancelled — stay silent
        // any other rejection (e.g. share sheet failed) falls through to download below
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "us-wrapped.png";
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Wrapped card downloaded");
  }, "image/png");
}

function setWrapPeriod(period) {
  wrapPeriod = period;
  render();
}

function wireInsights() {
  viewEl().querySelectorAll("[data-wrap-period]").forEach(b =>
    b.addEventListener("click", () => setWrapPeriod(b.dataset.wrapPeriod)));
  bind("wrap-share", "click", onShareWrapped);
  const wrapCard = viewEl().querySelector(".wrap-card");
  if (wrapCard) attachSwipe(wrapCard, () => setWrapPeriod("all"), () => setWrapPeriod("year"));
}

// Dense ranked list: top-3 visible, rest behind a native <details> expander.
// rows: [{ emoji, title, metric(html) }]
function rankRows(rows) {
  const row = (r, i) => `
    <div class="rank-row">
      <span class="rank r${i + 1}">${i + 1}</span>
      <span class="emoji">${r.emoji}</span>
      <span class="title">${escHtml(r.title)}</span>
      <span class="metric">${r.metric}</span>
    </div>`;
  const top = rows.slice(0, 3).map(row).join("");
  const rest = rows.slice(3);
  if (!rest.length) return top;
  return `${top}
    <details class="more">
      <summary><span class="more-pill">${rest.length} more <span class="chev">▾</span></span></summary>
      ${rest.map((r, i) => row(r, i + 3)).join("")}
    </details>`;
}

// Entry point. Re-renders in place; ui.js calls it on tab switch and on theme
// change (the Wrapped card bakes theme colors into literal SVG).
export function renderInsights(newCtx) {
  if (newCtx) ctx = newCtx;
  render();
}

function render() {
  const v = viewEl();
  const d = ctx.done();  // exclude wishlist ideas from every analytic below
  if (!d.length) {
    v.innerHTML = emptyState2("📊", "Charts need a little fuel", {
      sub: "Find something to do, log it, and this fills with what you two love.",
      cta: "Find an idea →",
    });
    wireEmpty2Cta(v, ctx.goSuggest);
    return;
  }
  const wStats = wrappedStats(wrapPeriod);
  // Scope the whole tab to the selected period, same "year" definition wrappedStats uses
  // (fall back to all-time if the year has no entries, matching wrappedStats' own fallback).
  const year = new Date().getFullYear();
  let scoped = wrapPeriod === "year" ? d.filter(e => new Date(entryTimeMs(e)).getFullYear() === year) : d;
  if (wrapPeriod === "year" && !scoped.length) scoped = d;
  const s = A.summary(scoped);
  const cats = A.byCategory(scoped);
  const moods = A.byMood(scoped);
  const trend = A.monthlyTrend(scoped);
  const vfm = A.valueForMoney(scoped, 5);
  const rep = A.repeatWorthy(scoped, 5);
  const exp = A.explorationStats(scoped);

  const moodSection = moods.length ? (() => {
    const maxCount = moods[0].count;
    return `
    <h3 class="section-title">Your vibes</h3>
    <div class="card tight">${moods.map(m => {
      const opt = MOOD_OPTIONS.find(o => o.key === m.key);
      const topCat = m.topCategory ? catEmoji(m.topCategory) : "";
      return `<div class="vibe-row">
        <div class="emo">${opt?.emoji ?? "🎭"}</div>
        <div class="meta2"><h4>${opt?.label ?? m.key}</h4><div class="sub">avg ${m.avgEnjoyment.toFixed(1)}♥${topCat ? ` · ${topCat}` : ""}</div></div>
        <div class="bar"><div class="track"><div class="fill" style="width:${(m.count / maxCount) * 100}%"></div></div></div>
        <div class="n">${m.count}</div>
      </div>`;
    }).join("")}</div>`;
  })() : "";

  v.innerHTML = `
    <h3 class="section-title" style="margin-top:0">Your Wrapped ✨</h3>
    <div class="card wrap-card">
      <div class="seg-row">
        <button class="seg ${wrapPeriod === "year" ? "on" : ""}" data-wrap-period="year">This year</button>
        <button class="seg ${wrapPeriod === "all" ? "on" : ""}" data-wrap-period="all">All time</button>
      </div>
      <div class="chart-wrap">${C.wrappedCard(wStats, document.documentElement.dataset.theme || "plum")}</div>
      ${wStats.fallbackNote ? `<p class="muted small" style="margin:6px 0 0">${escHtml(wStats.fallbackNote)}</p>` : ""}
      <button class="btn" id="wrap-share" style="margin-top:12px" ${wStats.count ? "" : "disabled"}>Share this card ↗</button>
    </div>

    <div class="stat-grid">
      <div class="stat"><div class="num">${wStats.usualTier ? wStats.usualTier.label : "—"}</div><div class="lbl">Typical date</div></div>
      <div class="stat"><div class="num">${wStats.distinctCategories ?? 0}/${wStats.totalCategories ?? 0}</div><div class="lbl">Categories tried</div></div>
    </div>

    <h3 class="section-title">Enjoyment by category</h3>
    <div class="card chart-wrap">${C.barChart(cats.map(c => ({ label: `${c.emoji} ${c.label}`, value: c.avgEnjoyment })))}</div>
    ${moodSection}

    <h3 class="section-title">Trend over time</h3>
    <div class="card chart-wrap">${C.trendChart(trend)}
      <div class="legend"><span style="color:var(--accent)">avg enjoyment</span><span style="color:var(--muted)">how many dates</span></div></div>

    <h3 class="section-title">Best value for money</h3>
    <div class="card tight">
      ${vfm.length ? `<span class="sticker-tag mint">smart spender!</span>` + rankRows(vfm.map(d => {
        const tier = d.costTier || tierForCost(d.cost);
        return { emoji: catEmoji(d.category), title: d.title, metric: `<span class="hot">♥${d.enjoyment.toFixed(1)}</span>${tier ? ` · <span class="val">${tier === "free" ? "free" : tierLabel(tier)}</span>` : ""}` };
      })) : `<p class="muted small">Add cost to your dates to rank value.</p>`}
    </div>

    <h3 class="section-title">Most repeat-worthy</h3>
    <div class="card tight">
      <span class="sticker-tag butter">do it again!</span>
      ${rankRows(rep.map(r => ({ emoji: catEmoji(r.category), title: r.title, metric: `<span class="hot">♥${r.avgEnjoyment.toFixed(1)}</span> · ${r.count}×` })))}
    </div>

    <h3 class="section-title">Adventure balance</h3>
    <div class="card" style="display:flex;align-items:center;gap:16px">
      <div style="width:120px;flex:none">${C.balanceDonut(exp.novelCount, Math.max(0, s.count - exp.novelCount))}</div>
      <div><strong>${exp.recentNew}/${exp.recentTotal}</strong> of your recent dates explored a new category.
      <p class="muted small" style="margin:6px 0 0">You've tried ${exp.novelCount} of ${s.totalCategories} categories. The Suggest tab keeps this balanced.</p></div>
    </div>
  `;
  wireInsights();
}
