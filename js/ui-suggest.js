// SUGGEST tab: the explore/exploit slider, the filters, and the idea cards.
// Split out of ui.js. It owns its own filter state (`sug`); everything it needs
// from ui.js arrives through ctx, so nothing here imports ui.js back.
//
// ctx: {
//   done()   -> entries excluding wishlist ideas (what the engine learns from)
//   all()    -> every entry, ideas included (to mark cards already wishlisted)
//   reload() -> re-read the date list into ui.js after a wishlist write
//   logSeed(seed) -> open the log sheet pre-filled from an idea card
// }

import * as db from "./store.js";
import { CATEGORIES, MOOD_OPTIONS, COST_TIERS, catLabel, catEmoji, blankEntry, normTitle } from "./model.js";
import { suggest, humanGap } from "./suggest.js";
import { CATALOG } from "./catalog.js";
import {
  viewEl, bind, setOn, escHtml, escAttr, emptyState, tierPill, photoURL, toast,
} from "./ui-shared.js";

const sug = { explore: 0.5, budget: null, budgetTier: null, maxEffort: null, category: null, moods: [] };
// Upper $ bound per cost tier (mirrors tierForCost's own boundaries) — "$$$" has no cap.
const BUDGET_TIER_MAX = { free: 0, low: 100, mid: 300, high: null };
let coldBannerDismissed = false; // ponytail: module-level, resets on reload — fine while user has zero dates
let ctx = null;

export function renderSuggest(newCtx) {
  if (newCtx) ctx = newCtx;
  const v = viewEl();
  const results = suggest(ctx.done(), { ...sug, jitter: false });
  const coldStart = ctx.done().length === 0;

  v.innerHTML = `
    <section class="card">
      <h2 style="margin:0 0 10px">Date night ideas</h2>
      <div class="slider-row" style="${coldStart ? "opacity:.45" : ""}">
        <span title="repeat favorites">🛋️</span>
        <input id="s-explore" type="range" min="0" max="100" value="${Math.round(sug.explore * 100)}" ${coldStart ? "disabled" : ""}/>
        <span title="try new things">🧭</span>
      </div>
      ${coldStart
        ? `<div class="slider-ends"><span class="muted-hint">unlocks after your first logged date</span></div>`
        : `<div class="slider-ends"><span>Comfort (favorites)</span><span>Adventure (new)</span></div>`}

      <div class="sug-filters">
        <div class="seg4" id="s-budget">
          ${COST_TIERS.map(t => `<button class="${sug.budgetTier === t.key ? "on" : ""}" data-btier="${t.key}">${t.label}</button>`).join("")}
        </div>
        <details class="filter-group effort" id="s-effort-group">
          <summary>
            <span class="fg-right"><span class="fg-badge${sug.maxEffort ? "" : " muted"}">${sug.maxEffort ? "⚡".repeat(sug.maxEffort) : "Any"}</span></span>
            <span class="fg-arrow">▼</span>
          </summary>
          <div class="chips-row" id="s-effort">
            <button class="chip-sm ${sug.maxEffort == null ? "on" : ""}" data-seffort="">Any</button>
            <button class="chip-sm ${sug.maxEffort === 1 ? "on" : ""}" data-seffort="1">⚡</button>
            <button class="chip-sm ${sug.maxEffort === 2 ? "on" : ""}" data-seffort="2">⚡⚡</button>
            <button class="chip-sm ${sug.maxEffort === 3 ? "on" : ""}" data-seffort="3">⚡⚡⚡</button>
          </div>
        </details>

        <details class="filter-group" id="s-cat-group">
          <summary>
            <span class="fg-label">Category</span>
            <span class="fg-right">
              ${sug.category ? `<span class="fg-badge">${CATEGORIES.find(c => c.key === sug.category)?.emoji} ${CATEGORIES.find(c => c.key === sug.category)?.label}</span>` : ""}
              <span class="fg-arrow">▼</span>
            </span>
          </summary>
          <div class="chips" id="s-cat">
            <button class="chip ${!sug.category ? "on" : ""}" data-scat="">Any</button>
            ${CATEGORIES.map(c => `<button class="chip ${sug.category === c.key ? "on" : ""}" data-scat="${c.key}">${c.emoji} ${c.label}</button>`).join("")}
          </div>
        </details>

        <details class="filter-group" id="s-mood-group">
          <summary>
            <span class="fg-label">Vibe</span>
            <span class="fg-right">
              ${sug.moods.length ? `<span class="fg-badge">${sug.moods.length === 1 ? (MOOD_OPTIONS.find(m => m.key === sug.moods[0])?.emoji + " " + MOOD_OPTIONS.find(m => m.key === sug.moods[0])?.label) : sug.moods.length + " selected"}</span>` : ""}
              <span class="fg-arrow">▼</span>
            </span>
          </summary>
          <div class="chips" id="s-mood">
            ${MOOD_OPTIONS.map(m => `<button class="chip ${sug.moods.includes(m.key) ? "on" : ""}" data-smood="${m.key}">${m.emoji} ${m.label}</button>`).join("")}
          </div>
        </details>
      </div>

      <div class="btn-row">
        <button class="btn secondary" id="s-shuffle">🎲 Surprise us</button>
        <button class="btn secondary" id="s-nearby">📍 Find nearby</button>
      </div>
    </section>

    <div id="sug-results">${renderSugCards(results)}</div>
  `;
  wireSuggest();
  loadSugPhotos();
}

function shortReason(r) {
  if (r.kind === "exploit") {
    const gap = r.daysSince > 21 ? ` · last done ${humanGap(r.daysSince)} ago` : ` · done ${r.actTimes}×`;
    return `${r.avgEnj.toFixed(1)}♥${gap}`;
  }
  if (r.catTimes > 0 && r.catAvg != null) return `New in ${catLabel(r.category)} · you rate it ${r.catAvg.toFixed(1)}♥`;
  return "A whole new kind of date — pure adventure.";
}

function renderSugCards(results) {
  const coldStart = ctx.done().length === 0;
  const banner = (coldStart && !coldBannerDismissed) ? `
    <div class="card cold-banner">
      <button class="banner-x" data-dismiss-cold>✕</button>
      <h3>${CATALOG.length} hand-picked ideas 🎁</h3>
      <p>Log dates and this tab learns your taste.</p>
    </div>` : "";
  if (!results.length) return banner + emptyState("✨", "No ideas match", "Loosen your filters a little.");
  const saved = new Set(ctx.all().filter(e => e.status === "idea").map(e => normTitle(e.title)));
  return banner + results.map(r => {
    const payload = escAttr(JSON.stringify({ title: r.title, category: r.category, cost: r.estCost ?? null, effort: r.effort }));
    const isSaved = saved.has(normTitle(r.title));
    const reason = coldStart ? (r.desc || r.reason) : shortReason(r);
    return `
    <div class="card sug-card ${r.kind}" data-norm-title="${escAttr(normTitle(r.title))}">
      ${isSaved ? `<span class="sticker-tag butter">saved ♡</span>` : ""}
      <div class="sug-body">
        <div class="sug-head">
          <h3><span class="sug-dot ${r.kind}" aria-hidden="true">${r.kind === "explore" ? "✦" : "♥"}</span> ${catEmoji(r.category)} ${escHtml(r.title)} ${tierPill({ cost: r.estCost })}</h3>
        </div>
        ${r.photos?.length ? `<div class="sug-photos" data-sug-photos="${escAttr(r.photos.join(","))}"></div>` : ""}
        <p class="sug-reason">${r.kind === "explore" ? `<span class="sug-kind">New</span> · ` : ""}${escHtml(reason)}</p>
      </div>
      <div class="sug-actions">
        ${isSaved
          ? `<button class="heart-btn" data-unsave='${payload}' aria-label="Remove from wishlist">✓</button>`
          : `<button class="heart-btn" data-save='${payload}' aria-label="Wishlist">♡</button>`}
        <button class="btn secondary small" data-log='${payload}'>Log →</button>
      </div>
    </div>`;
  }).join("");
}

async function loadSugPhotos() {
  for (const el of viewEl().querySelectorAll("[data-sug-photos]")) {
    const ids = el.dataset.sugPhotos.split(",").filter(Boolean);
    if (!ids.length) continue;
    const imgs = await Promise.all(ids.map(async id => {
      const url = await photoURL(id);
      return url ? `<img src="${url}" alt=""/>` : "";
    }));
    el.innerHTML = imgs.filter(Boolean).join("");
  }
}

// Re-render just the results list, leaving the filter controls (and their open
// <details>) alone.
function refreshCards(jitter = false) {
  const host = viewEl().querySelector("#sug-results");
  if (!host) return;
  host.innerHTML = renderSugCards(suggest(ctx.done(), { ...sug, jitter }));
  wireLogButtons();
  loadSugPhotos();
}

function wireSuggest() {
  const v = viewEl();
  v.querySelector("#s-explore").addEventListener("input", e => { sug.explore = e.target.value / 100; refreshCards(); });
  v.querySelector("#s-budget").addEventListener("click", e => {
    const b = e.target.closest("[data-btier]"); if (!b) return;
    const key = b.dataset.btier;
    if (sug.budgetTier === key) { sug.budgetTier = null; sug.budget = null; }
    else { sug.budgetTier = key; sug.budget = BUDGET_TIER_MAX[key]; }
    setOn(v.querySelectorAll("#s-budget button"), sug.budgetTier ? b : null);
    refreshCards();
  });
  v.querySelector("#s-effort").addEventListener("click", e => {
    const b = e.target.closest("[data-seffort]"); if (!b) return;
    sug.maxEffort = b.dataset.seffort === "" ? null : Number(b.dataset.seffort);
    setOn(v.querySelectorAll("#s-effort .chip-sm"), b);
    const badge = v.querySelector("#s-effort-group summary .fg-badge");
    if (badge) { badge.textContent = sug.maxEffort ? "⚡".repeat(sug.maxEffort) : "Any"; badge.classList.toggle("muted", !sug.maxEffort); }
    v.querySelector("#s-effort-group").open = false;
    refreshCards();
  });
  v.querySelector("#s-cat").addEventListener("click", e => {
    const b = e.target.closest("[data-scat]"); if (!b) return;
    sug.category = b.dataset.scat || null;
    setOn(v.querySelectorAll("#s-cat .chip"), b);
    const cat = CATEGORIES.find(c => c.key === sug.category);
    const badge = v.querySelector("#s-cat-group summary .fg-badge");
    if (badge) badge.remove();
    if (cat) {
      const span = document.createElement("span");
      span.className = "fg-badge";
      span.textContent = `${cat.emoji} ${cat.label}`;
      v.querySelector("#s-cat-group summary .fg-right").prepend(span);
    }
    refreshCards();
  });
  v.querySelector("#s-mood").addEventListener("click", e => {
    const b = e.target.closest("[data-smood]"); if (!b) return;
    const key = b.dataset.smood;
    if (sug.moods.includes(key)) sug.moods = sug.moods.filter(m => m !== key);
    else sug.moods = [...sug.moods, key];
    v.querySelectorAll("#s-mood .chip").forEach(chip => {
      chip.classList.toggle("on", sug.moods.includes(chip.dataset.smood));
    });
    const badge = v.querySelector("#s-mood-group summary .fg-badge");
    if (badge) badge.remove();
    if (sug.moods.length) {
      const span = document.createElement("span");
      span.className = "fg-badge";
      const m0 = MOOD_OPTIONS.find(m => m.key === sug.moods[0]);
      span.textContent = sug.moods.length === 1 ? `${m0.emoji} ${m0.label}` : `${sug.moods.length} selected`;
      v.querySelector("#s-mood-group summary .fg-right").prepend(span);
    }
    refreshCards();
  });
  bind("s-shuffle", "click", () => refreshCards(true));
  bind("s-nearby", "click", () => {
    if (!navigator.geolocation) { toast("Location not supported on this device"); return; }
    toast("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        const categoryQueries = {
          dining: "restaurants", outdoors: "parks outdoor activities",
          movie: "cinema", nightlife: "bars nightlife", culture: "museums",
          active: "activities", creative: "art classes workshops",
          travel: "attractions", wellness: "spa massage", special: "unique experiences",
          athome: "activities",
        };
        const q = (sug.category && categoryQueries[sug.category]) || "date ideas";
        window.open(`https://www.google.com/maps/search/${encodeURIComponent(q)}/@${lat},${lng},14z`, "_blank");
      },
      () => toast("Couldn't get location — check browser permissions")
    );
  });
  wireLogButtons();
}

function wireLogButtons() {
  const v = viewEl();
  v.querySelector("[data-dismiss-cold]")?.addEventListener("click", e => {
    coldBannerDismissed = true;
    e.target.closest(".cold-banner").remove();
  });
  v.querySelectorAll("[data-log]").forEach(b => b.addEventListener("click", () => {
    ctx.logSeed(JSON.parse(b.dataset.log));
  }));
  v.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", async () => {
    const seed = JSON.parse(b.dataset.save);
    const idea = blankEntry();
    Object.assign(idea, { title: seed.title, category: seed.category, cost: seed.cost, effort: seed.effort || 3, status: "idea" });
    await db.putDate(idea);
    await ctx.reload();
    toast("Saved to wishlist ♡");
    refreshCards();
  }));
  v.querySelectorAll("[data-unsave]").forEach(b => b.addEventListener("click", async () => {
    const seed = JSON.parse(b.dataset.unsave);
    const k = normTitle(seed.title);
    const idea = ctx.all().find(e => e.status === "idea" && normTitle(e.title) === k);
    if (idea) await db.deleteDate(idea.id);
    await ctx.reload();
    toast("Removed from wishlist");
    refreshCards();
  }));
}
