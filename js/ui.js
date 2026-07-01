// UI layer: renders the three tabs, handles the form, photos, charts and suggestions.

import * as db from "./db.js";
import {
  CATEGORIES, REPEAT_OPTIONS, MOOD_OPTIONS, CURRENCIES, catLabel, catEmoji,
  blankEntry, fmtMoney, fmtDate, entryTimeMs, toILS, refreshRates,
} from "./model.js";
import * as A from "./analytics.js";
import * as C from "./charts.js";
import { suggest } from "./suggest.js";

const viewEl = () => document.getElementById("view");
let dates = [];
let draft = blankEntry();        // the entry currently being composed/edited
let editingId = null;
let currentTab = "log";
const sug = { explore: 0.5, budget: null, maxEffort: null, category: null, moods: [] };
const hist = { sort: "date-desc", category: null, mood: null, query: "", view: "list", expanded: null };
let memoryDismissed = false;
let costCurrency = "ILS";
const urlCache = new Map();      // photoId -> objectURL

export async function init() {
  dates = await db.getAllDates();
  wireChrome();
  show("log");
  refreshRates(db.getSetting, db.setSetting);
}

async function reload() { dates = await db.getAllDates(); }

// ---------- tab + chrome wiring ----------
function wireChrome() {
  document.querySelectorAll(".tab").forEach(btn =>
    btn.addEventListener("click", () => show(btn.dataset.tab)));

  const sheet = document.getElementById("sheet");
  document.getElementById("menuBtn").addEventListener("click", () => sheet.classList.remove("hidden"));
  sheet.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => sheet.classList.add("hidden")));

  document.getElementById("exportBtn").addEventListener("click", onExport);
  document.getElementById("importInput").addEventListener("change", onImport);
  document.getElementById("seedBtn").addEventListener("click", onSeed);
  document.getElementById("wipeBtn").addEventListener("click", onWipe);
}

function show(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  if (tab === "log") renderLog();
  else if (tab === "history") renderHistory();
  else if (tab === "insights") renderInsights();
  else renderSuggest();
  viewEl().scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

// ---------- LOG tab ----------
function renderLog() {
  const v = viewEl();
  const isEdit = !!editingId;
  const memories = (!memoryDismissed && !isEdit) ? A.onThisDay(dates) : [];
  const memoryCard = memories.length ? `
    <section class="card memory-card">
      <div class="memory-header">
        <span class="memory-title">On this day ✨</span>
        <button class="memory-dismiss" id="memory-dismiss">✕</button>
      </div>
      ${memories.map(e => {
        const yearsAgo = new Date().getFullYear() - new Date(entryTimeMs(e)).getFullYear();
        return `<div class="memory-item">
          <div class="memory-ago">${yearsAgo} year${yearsAgo !== 1 ? "s" : ""} ago</div>
          <div class="entry" style="pointer-events:none">
            <div class="thumb">${catEmoji(e.category)}</div>
            <div class="meta"><h4>${escHtml(e.title)}</h4>
              <div class="sub">${fmtDate(e.date)} · ${"★".repeat(e.enjoyment)}</div>
            </div>
          </div>
        </div>`;
      }).join("")}
    </section>` : "";
  v.innerHTML = memoryCard + `
    <section class="card">
      <h2 style="margin:0 0 4px">${isEdit ? "Edit date" : "How was the date?"}</h2>
      <p class="muted small" style="margin:0">${isEdit ? "Update the details below." : "Fill this in after a date — it feeds your insights & suggestions."}</p>

      <label class="field"><span>What did you do?</span>
        <input id="f-title" type="text" placeholder="e.g. Sunset hike at the cliffs" value="${escAttr(draft.title)}"/></label>

      <label class="field"><span>Photos</span></label>
      <div class="photo-strip" id="f-photos"></div>
      <input id="f-photo-camera" type="file" accept="image/*" capture="environment" hidden/>
      <input id="f-photo-gallery" type="file" accept="image/*" hidden multiple/>

      <label class="field"><span>Category</span></label>
      <div class="chips" id="f-category">
        ${CATEGORIES.map(c => `<button class="chip ${draft.category === c.key ? "on" : ""}" data-cat="${c.key}">${c.emoji} ${c.label}</button>`).join("")}
      </div>

      <label class="field"><span>When</span>
        <input id="f-date" type="date" value="${draft.date}"/></label>

      ${ratingBlock("Enjoyment", "enjoyment", draft.enjoyment, "★")}

      <label class="field"><span>Mood / vibe <span class="muted" style="font-weight:400;font-size:12px">(pick any that fit)</span></span></label>
      <div class="chips" id="f-mood">
        ${MOOD_OPTIONS.map(m => `<button class="chip ${Array.isArray(draft.mood) && draft.mood.includes(m.key) ? "on" : ""}" data-mood="${m.key}">${m.emoji} ${m.label}</button>`).join("")}
      </div>

      ${ratingBlock("Effort it took", "effort", draft.effort, "")}

      <label class="field"><span>Would you do it again?</span></label>
      <div class="chips" id="f-repeat">
        ${REPEAT_OPTIONS.map(o => `<button class="chip ${draft.wouldRepeat === o.key ? "on" : ""}" data-rep="${o.key}">${o.label}</button>`).join("")}
      </div>

      <div class="row">
        <label class="field"><span>Cost</span>
          <div class="cost-row">
            <select id="f-currency" class="cost-cur">${CURRENCIES.map(c => `<option value="${c.key}" ${costCurrency === c.key ? "selected" : ""}>${c.label}</option>`).join("")}</select>
            <input id="f-cost" type="number" inputmode="decimal" min="0" placeholder="0" value="${draft.cost ?? ""}"/>
          </div></label>
        <label class="field"><span>Location</span>
          <input id="f-location" type="text" placeholder="optional" value="${escAttr(draft.location)}"/></label>
      </div>

      <label class="field"><span>Notes / memories</span>
        <textarea id="f-notes" placeholder="What made it good (or not)?">${escHtml(draft.notes)}</textarea></label>

      <div class="btn-row">
        ${isEdit ? `<button class="btn ghost" id="f-cancel">Cancel</button>` : ""}
        <button class="btn" id="f-save">${isEdit ? "Save changes" : "Save date ♥"}</button>
      </div>
    </section>

    <h3 class="section-title">Recent dates</h3>
    <div id="date-list"></div>
  `;
  wireForm();
  renderPhotoStrip();
  renderList();
}

function ratingBlock(label, field, value, unit) {
  const pills = [1, 2, 3, 4, 5].map(n =>
    `<button class="${n === value ? "on" : ""}" data-rating="${field}" data-val="${n}">${n}${unit}</button>`).join("");
  return `<label class="field"><span>${label}</span></label><div class="rating ${unit ? "stars" : ""}" data-rating-group="${field}">${pills}</div>`;
}

function wireForm() {
  const v = viewEl();
  bind("memory-dismiss", "click", () => { memoryDismissed = true; renderLog(); });
  // text-ish inputs update the draft without re-rendering (keeps focus/caret)
  bind("f-title", "input", e => draft.title = e.target.value);
  bind("f-date", "change", e => draft.date = e.target.value);
  bind("f-cost", "input", e => draft.cost = e.target.value === "" ? null : Number(e.target.value));
  bind("f-currency", "change", e => costCurrency = e.target.value);
  bind("f-location", "input", e => draft.location = e.target.value);
  bind("f-notes", "input", e => draft.notes = e.target.value);

  // category chips
  v.querySelector("#f-category").addEventListener("click", e => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    draft.category = b.dataset.cat;
    setOn(v.querySelectorAll("#f-category .chip"), b);
  });
  // repeat chips
  v.querySelector("#f-repeat").addEventListener("click", e => {
    const b = e.target.closest("[data-rep]"); if (!b) return;
    draft.wouldRepeat = b.dataset.rep;
    setOn(v.querySelectorAll("#f-repeat .chip"), b);
  });
  // ratings (enjoyment, effort)
  v.querySelectorAll("[data-rating-group]").forEach(group => {
    group.addEventListener("click", e => {
      const b = e.target.closest("[data-rating]"); if (!b) return;
      draft[b.dataset.rating] = Number(b.dataset.val);
      setOn(group.querySelectorAll("button"), b);
    });
  });
  // mood chips (multi-select toggle)
  v.querySelector("#f-mood").addEventListener("click", e => {
    const b = e.target.closest("[data-mood]"); if (!b) return;
    const key = b.dataset.mood;
    if (!Array.isArray(draft.mood)) draft.mood = [];
    if (draft.mood.includes(key)) {
      draft.mood = draft.mood.filter(k => k !== key);
      b.classList.remove("on");
    } else {
      draft.mood.push(key);
      b.classList.add("on");
    }
  });

  // photos
  v.querySelector("#f-photo-camera").addEventListener("change", onPhotoPick);
  v.querySelector("#f-photo-gallery").addEventListener("change", onPhotoPick);

  bind("f-save", "click", saveDraft);
  const cancel = v.querySelector("#f-cancel");
  if (cancel) cancel.addEventListener("click", () => { resetDraft(); renderLog(); });
}

async function renderPhotoStrip() {
  const strip = viewEl().querySelector("#f-photos");
  if (!strip) return;
  const thumbs = await Promise.all(draft.photos.map(async id => {
    const url = await photoURL(id);
    return `<div class="photo-thumb"><img src="${url}" alt=""/><button data-rm="${id}">✕</button></div>`;
  }));
  strip.innerHTML = thumbs.join("") +
    `<div class="photo-add-wrap">
      <button class="add-photo" id="f-add-photo" type="button">＋</button>
      <div class="photo-menu hidden" id="f-photo-menu">
        <button class="photo-menu-item" data-src="camera">📷 Camera</button>
        <button class="photo-menu-item" data-src="gallery">🖼️ Gallery</button>
        <button class="photo-menu-item" data-src="google">📸 Google Photos</button>
      </div>
    </div>`;
  const addBtn = strip.querySelector("#f-add-photo");
  const menu = strip.querySelector("#f-photo-menu");
  addBtn.addEventListener("click", () => menu.classList.toggle("hidden"));
  menu.addEventListener("click", e => {
    const item = e.target.closest("[data-src]"); if (!item) return;
    menu.classList.add("hidden");
    const v = viewEl();
    if (item.dataset.src === "camera") v.querySelector("#f-photo-camera").click();
    else v.querySelector("#f-photo-gallery").click();
  });
  document.addEventListener("click", e => {
    if (!addBtn.contains(e.target) && !menu.contains(e.target)) menu.classList.add("hidden");
  });
  strip.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
    draft.photos = draft.photos.filter(p => p !== b.dataset.rm);
    renderPhotoStrip();
  }));
}

async function onPhotoPick(e) {
  const files = [...e.target.files];
  e.target.value = "";
  for (const file of files) {
    try {
      const blob = await downscale(file, 1280, 0.82);
      const id = await db.putPhoto(blob);
      draft.photos.push(id);
    } catch (err) { console.error(err); toast("Couldn't add photo"); }
  }
  renderPhotoStrip();
}

async function saveDraft() {
  if (!draft.title.trim()) { toast("Add what you did first"); return; }
  draft.title = draft.title.trim();
  if (draft.cost != null) draft.cost = toILS(draft.cost, costCurrency);
  if (!editingId) draft.createdAt = Date.now();
  await db.putDate(draft);
  await reload();
  const saved = costCurrency !== "ILS" && draft.cost != null ? ` (${fmtMoney(draft.cost)})` : "";
  toast((editingId ? "Updated ♥" : "Date saved ♥") + saved);
  resetDraft();
  costCurrency = "ILS";
  renderLog();
}

function resetDraft() { draft = blankEntry(); editingId = null; }

async function editEntry(id) {
  const e = await db.getDate(id);
  if (!e) return;
  draft = structuredClone(e);
  editingId = id;
  show("log");
}

async function removeEntry(id) {
  if (!confirm("Delete this date?")) return;
  await db.deleteDate(id);
  await reload();
  toast("Deleted");
  renderList();
}

async function renderList() {
  const host = viewEl().querySelector("#date-list");
  if (!host) return;
  if (!dates.length) {
    host.innerHTML = `<div class="empty"><div class="big">📭</div>No dates yet — log your first one above, or add demo data from the ⋯ menu.</div>`;
    return;
  }
  const sorted = [...dates].sort((a, b) => entryTimeMs(b) - entryTimeMs(a));
  host.innerHTML = sorted.map(e => `
    <div class="card tight">
      <div class="entry">
        <div class="thumb" data-thumb="${e.photos?.[0] || ""}">${catEmoji(e.category)}</div>
        <div class="meta">
          <h4>${escHtml(e.title)}</h4>
          <div class="sub">${fmtDate(e.date)} · ${catLabel(e.category)} · ${fmtMoney(e.cost)}</div>
        </div>
        <div class="score">${"★".repeat(e.enjoyment)}</div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button class="btn ghost" data-edit="${e.id}">Edit</button>
        <button class="btn ghost" data-del="${e.id}">Delete</button>
      </div>
    </div>`).join("");
  host.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => editEntry(b.dataset.edit)));
  host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => removeEntry(b.dataset.del)));
  // fill first-photo thumbnails
  host.querySelectorAll("[data-thumb]").forEach(async el => {
    const id = el.dataset.thumb;
    if (!id) return;
    const url = await photoURL(id);
    if (url) el.innerHTML = `<img src="${url}" alt=""/>`;
  });
}

// ---------- HISTORY tab ----------
function renderHistory() {
  const v = viewEl();
  if (!dates.length) {
    v.innerHTML = emptyState("📅", "No history yet", "Log a date and it will show up here.");
    return;
  }

  v.innerHTML = `
    <section class="card tight">
      <div class="hist-controls">
        <label class="hist-sort-label"><span>Sort by</span>
          <select id="h-sort">
            <option value="date-desc" ${hist.sort === "date-desc" ? "selected" : ""}>Date (newest)</option>
            <option value="date-asc" ${hist.sort === "date-asc" ? "selected" : ""}>Date (oldest)</option>
            <option value="enjoy-desc" ${hist.sort === "enjoy-desc" ? "selected" : ""}>Enjoyment (high)</option>
            <option value="enjoy-asc" ${hist.sort === "enjoy-asc" ? "selected" : ""}>Enjoyment (low)</option>
            <option value="cost-desc" ${hist.sort === "cost-desc" ? "selected" : ""}>Cost (high)</option>
            <option value="cost-asc" ${hist.sort === "cost-asc" ? "selected" : ""}>Cost (low)</option>
            <option value="title-asc" ${hist.sort === "title-asc" ? "selected" : ""}>Title (A–Z)</option>
          </select>
        </label>
        <div class="hist-view-toggle">
          <button class="seg ${hist.view === "list" ? "on" : ""}" data-view="list">☰ List</button>
          <button class="seg ${hist.view === "gallery" ? "on" : ""}" data-view="gallery">⊞ Gallery</button>
        </div>
      </div>
      <input class="h-search" id="h-search" type="text" placeholder="Search title, notes, place…" value="${escAttr(hist.query)}"/>
      <details class="filter-group" id="h-cat-group">
        <summary>
          <span class="fg-label">Category</span>
          <span class="fg-right">
            ${hist.category ? `<span class="fg-badge">${CATEGORIES.find(c => c.key === hist.category)?.emoji} ${CATEGORIES.find(c => c.key === hist.category)?.label}</span>` : ""}
            <span class="fg-arrow">▼</span>
          </span>
        </summary>
        <div class="chips" id="h-cat">
          <button class="chip ${!hist.category ? "on" : ""}" data-hcat="">All</button>
          ${CATEGORIES.map(c => `<button class="chip ${hist.category === c.key ? "on" : ""}" data-hcat="${c.key}">${c.emoji} ${c.label}</button>`).join("")}
        </div>
      </details>
      <details class="filter-group" id="h-mood-group">
        <summary>
          <span class="fg-label">Vibe</span>
          <span class="fg-right">
            ${hist.mood ? `<span class="fg-badge">${MOOD_OPTIONS.find(m => m.key === hist.mood)?.emoji} ${MOOD_OPTIONS.find(m => m.key === hist.mood)?.label}</span>` : ""}
            <span class="fg-arrow">▼</span>
          </span>
        </summary>
        <div class="chips" id="h-mood">
          <button class="chip ${!hist.mood ? "on" : ""}" data-hmood="">Any vibe</button>
          ${MOOD_OPTIONS.map(m => `<button class="chip ${hist.mood === m.key ? "on" : ""}" data-hmood="${m.key}">${m.emoji} ${m.label}</button>`).join("")}
        </div>
      </details>
      <span class="hist-count" id="h-count">${dates.length} date${dates.length !== 1 ? "s" : ""}</span>
    </section>
    <div id="hist-list"></div>
  `;
  wireHistory();
  renderHistoryList();
}

function wireHistory() {
  const v = viewEl();
  bind("h-sort", "change", e => { hist.sort = e.target.value; renderHistoryList(); });
  bind("h-search", "input", e => { hist.query = e.target.value; renderHistoryList(); });
  v.querySelector("#h-cat").addEventListener("click", e => {
    const b = e.target.closest("[data-hcat]"); if (!b) return;
    hist.category = b.dataset.hcat || null;
    setOn(v.querySelectorAll("#h-cat .chip"), b);
    const cat = CATEGORIES.find(c => c.key === hist.category);
    const badge = v.querySelector("#h-cat-group summary .fg-badge");
    if (badge) badge.remove();
    if (cat) {
      const span = document.createElement("span");
      span.className = "fg-badge";
      span.textContent = `${cat.emoji} ${cat.label}`;
      v.querySelector("#h-cat-group summary .fg-right").prepend(span);
    }
    renderHistoryList();
  });
  v.querySelector("#h-mood").addEventListener("click", e => {
    const b = e.target.closest("[data-hmood]"); if (!b) return;
    hist.mood = b.dataset.hmood || null;
    setOn(v.querySelectorAll("#h-mood .chip"), b);
    const mood = MOOD_OPTIONS.find(m => m.key === hist.mood);
    const badge = v.querySelector("#h-mood-group summary .fg-badge");
    if (badge) badge.remove();
    if (mood) {
      const span = document.createElement("span");
      span.className = "fg-badge";
      span.textContent = `${mood.emoji} ${mood.label}`;
      v.querySelector("#h-mood-group summary .fg-right").prepend(span);
    }
    renderHistoryList();
  });
  v.querySelector(".hist-view-toggle").addEventListener("click", e => {
    const b = e.target.closest("[data-view]"); if (!b) return;
    hist.view = b.dataset.view;
    setOn(v.querySelectorAll(".hist-view-toggle .seg"), b);
    renderHistoryList();
  });
}

function sortedHistory() {
  let list = [...dates];
  if (hist.category) list = list.filter(e => e.category === hist.category);
  if (hist.mood) list = list.filter(e => Array.isArray(e.mood) && e.mood.includes(hist.mood));
  if (hist.query) {
    const q = hist.query.toLowerCase();
    list = list.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q) ||
      (e.location || "").toLowerCase().includes(q)
    );
  }
  const cmp = {
    "date-desc": (a, b) => entryTimeMs(b) - entryTimeMs(a),
    "date-asc":  (a, b) => entryTimeMs(a) - entryTimeMs(b),
    "enjoy-desc": (a, b) => b.enjoyment - a.enjoyment || entryTimeMs(b) - entryTimeMs(a),
    "enjoy-asc":  (a, b) => a.enjoyment - b.enjoyment || entryTimeMs(b) - entryTimeMs(a),
    "cost-desc":  (a, b) => (b.cost ?? -1) - (a.cost ?? -1) || entryTimeMs(b) - entryTimeMs(a),
    "cost-asc":   (a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || entryTimeMs(b) - entryTimeMs(a),
    "title-asc":  (a, b) => a.title.localeCompare(b.title),
  };
  list.sort(cmp[hist.sort] || cmp["date-desc"]);
  return list;
}

async function renderHistoryList() {
  const host = viewEl().querySelector("#hist-list");
  if (!host) return;
  const list = sortedHistory();
  const countEl = viewEl().querySelector("#h-count");

  if (hist.view === "gallery") {
    const photoEntries = list.flatMap(e => (e.photos || []).map(pid => ({ pid, e })));
    if (countEl) countEl.textContent = `${photoEntries.length} photo${photoEntries.length !== 1 ? "s" : ""}`;
    if (!photoEntries.length) {
      host.innerHTML = `<div class="empty"><div class="big">📷</div>No photos for this filter.</div>`;
      return;
    }
    host.innerHTML = `<div class="hist-gallery">${photoEntries.map(({ pid, e }) =>
      `<div class="gallery-tile" data-entry="${e.id}" data-pid="${pid}">
        <img src="" data-load="${pid}" alt="${escAttr(e.title)}"/>
        <div class="gallery-label">${escHtml(e.title)}</div>
      </div>`).join("")}</div>`;
    host.querySelectorAll("[data-load]").forEach(async img => {
      const url = await photoURL(img.dataset.load);
      if (url) img.src = url;
    });
    host.querySelectorAll(".gallery-tile").forEach(tile => tile.addEventListener("click", () => {
      hist.view = "list";
      hist.expanded = tile.dataset.entry;
      const v = viewEl();
      setOn(v.querySelectorAll(".hist-view-toggle .seg"),
        v.querySelector(".hist-view-toggle [data-view='list']"));
      renderHistoryList();
      setTimeout(() => {
        const el = host.querySelector(`[data-toggle="${tile.dataset.entry}"]`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }));
    return;
  }

  if (!list.length) {
    host.innerHTML = `<div class="empty"><div class="big">🔍</div>No dates match this filter.</div>`;
    return;
  }
  if (countEl) countEl.textContent = `${list.length} date${list.length !== 1 ? "s" : ""}`;
  host.innerHTML = list.map(e => {
    const isOpen = hist.expanded === e.id;
    return `
    <div class="card tight hist-entry ${isOpen ? "open" : ""}">
      <div class="entry hist-row" data-toggle="${e.id}">
        <div class="thumb" data-thumb="${e.photos?.[0] || ""}">${catEmoji(e.category)}</div>
        <div class="meta">
          <h4>${escHtml(e.title)}</h4>
          <div class="sub">${fmtDate(e.date)} · ${catLabel(e.category)}${e.cost != null ? " · " + fmtMoney(e.cost) : ""}</div>
        </div>
        <div class="score">${"★".repeat(e.enjoyment)}</div>
      </div>
      ${isOpen ? `
      <div class="hist-detail">
        <div class="hist-detail-grid">
          ${Array.isArray(e.mood) && e.mood.length ? `<div style="grid-column:1/-1"><span class="muted small">Mood</span><br/>${e.mood.map(k => { const m = MOOD_OPTIONS.find(o => o.key === k); return m ? `<span class="mood-tag">${m.emoji} ${m.label}</span>` : ""; }).filter(Boolean).join("")}</div>` : ""}
          <div><span class="muted small">Effort</span><br/>${"●".repeat(e.effort)}${"○".repeat(5 - e.effort)}</div>
          <div><span class="muted small">Repeat?</span><br/>${e.wouldRepeat === "yes" ? "Yes!" : e.wouldRepeat === "maybe" ? "Maybe" : "No"}</div>
          ${e.location ? `<div><span class="muted small">Location</span><br/>${escHtml(e.location)}</div>` : ""}
        </div>
        ${e.notes ? `<p class="hist-notes">${escHtml(e.notes)}</p>` : ""}
        <div class="hist-photos" data-hist-photos="${(e.photos || []).join(",")}"></div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn ghost" data-edit="${e.id}">Edit</button>
          <button class="btn ghost" data-del="${e.id}">Delete</button>
        </div>
      </div>` : ""}
    </div>`;
  }).join("");

  // wire expand/collapse
  host.querySelectorAll("[data-toggle]").forEach(row => row.addEventListener("click", () => {
    hist.expanded = hist.expanded === row.dataset.toggle ? null : row.dataset.toggle;
    renderHistoryList();
  }));
  // wire edit/delete
  host.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); editEntry(b.dataset.edit); }));
  host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    await removeEntry(b.dataset.del);
    hist.expanded = null;
    renderHistoryList();
  }));
  // load thumbnails
  host.querySelectorAll("[data-thumb]").forEach(async el => {
    const id = el.dataset.thumb;
    if (!id) return;
    const url = await photoURL(id);
    if (url) el.innerHTML = `<img src="${url}" alt=""/>`;
  });
  // load detail photos
  host.querySelectorAll("[data-hist-photos]").forEach(async el => {
    const ids = el.dataset.histPhotos.split(",").filter(Boolean);
    if (!ids.length) { el.style.display = "none"; return; }
    const imgs = await Promise.all(ids.map(async id => {
      const url = await photoURL(id);
      return url ? `<img src="${url}" alt=""/>` : "";
    }));
    el.innerHTML = imgs.filter(Boolean).join("");
  });
}

// ---------- INSIGHTS tab ----------
function renderInsights() {
  const v = viewEl();
  if (!dates.length) {
    v.innerHTML = emptyState("📊", "No insights yet", "Log a few dates and this fills with charts about what you two love.");
    return;
  }
  const s = A.summary(dates);
  const cats = A.byCategory(dates);
  const moods = A.byMood(dates);
  const trend = A.monthlyTrend(dates);
  const vfm = A.valueForMoney(dates, 5);
  const rep = A.repeatWorthy(dates, 5);
  const exp = A.explorationStats(dates);

  const moodSection = moods.length ? (() => {
    const maxCount = moods[0].count;
    return `
    <h3 class="section-title">Your vibes</h3>
    <div class="card chart-wrap">${C.barChart(moods.map(m => {
      const opt = MOOD_OPTIONS.find(o => o.key === m.key);
      return { label: `${opt?.emoji ?? ""} ${opt?.label ?? m.key}`, value: m.count };
    }), { max: maxCount, unit: "" })}</div>
    <div class="card tight">${moods.map(m => {
      const opt = MOOD_OPTIONS.find(o => o.key === m.key);
      const topCat = m.topCategory ? `${catEmoji(m.topCategory)} ${catLabel(m.topCategory)}` : "";
      return `<div class="entry" style="padding:6px 0">
        <div style="font-size:22px;width:52px;text-align:center;flex:none">${opt?.emoji ?? "🎭"}</div>
        <div class="meta">
          <h4>${opt?.label ?? m.key}</h4>
          <div class="sub">felt ${m.count}× · avg ${m.avgEnjoyment.toFixed(1)}★${topCat ? ` · mostly ${topCat}` : ""}</div>
        </div>
      </div>`;
    }).join("")}</div>`;
  })() : "";

  v.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="num">${s.count}</div><div class="lbl">Dates logged</div></div>
      <div class="stat"><div class="num">${s.avgEnjoyment.toFixed(1)}★</div><div class="lbl">Avg enjoyment</div></div>
      <div class="stat"><div class="num">${fmtMoney(s.totalCost)}</div><div class="lbl">Total spent</div></div>
      <div class="stat"><div class="num">${s.distinctCategories}/${s.totalCategories}</div><div class="lbl">Categories tried</div></div>
    </div>

    <h3 class="section-title">Enjoyment by category</h3>
    <div class="card chart-wrap">${C.barChart(cats.map(c => ({ label: `${c.emoji} ${c.label}`, value: c.avgEnjoyment })))}</div>
    ${moodSection}

    <h3 class="section-title">Trend over time</h3>
    <div class="card chart-wrap">${C.trendChart(trend)}
      <div class="legend"><span style="color:var(--accent)">avg enjoyment</span><span style="color:var(--card-2)">how many dates</span></div></div>

    <h3 class="section-title">Enjoyment vs cost</h3>
    <div class="card chart-wrap">${C.scatterChart(A.enjoymentVsCost(dates))}
      <p class="muted small" style="margin:8px 2px 0">Top-left = cheap & wonderful.</p></div>

    <h3 class="section-title">Best value for money</h3>
    <div class="card tight">${vfm.length ? vfm.map(d => `
      <div class="entry" style="padding:6px 0">
        <div class="thumb">${catEmoji(d.category)}</div>
        <div class="meta"><h4>${escHtml(d.title)}</h4><div class="sub">${fmtMoney(d.cost)} · ${"★".repeat(d.enjoyment)}</div></div>
      </div>`).join("") : `<p class="muted small">Add cost to your dates to rank value.</p>`}</div>

    <h3 class="section-title">Most repeat-worthy</h3>
    <div class="card tight">${rep.map(r => `
      <div class="entry" style="padding:6px 0">
        <div class="thumb">${catEmoji(r.category)}</div>
        <div class="meta"><h4>${escHtml(r.title)}</h4><div class="sub">${r.avgEnjoyment.toFixed(1)}★ · done ${r.count}×</div></div>
      </div>`).join("")}</div>

    <h3 class="section-title">Adventure balance</h3>
    <div class="card" style="display:flex;align-items:center;gap:16px">
      <div style="width:120px;flex:none">${C.balanceDonut(exp.novelCount, Math.max(0, s.count - exp.novelCount))}</div>
      <div><strong>${exp.recentNew}/${exp.recentTotal}</strong> of your recent dates explored a new category.
      <p class="muted small" style="margin:6px 0 0">You've tried ${exp.novelCount} of ${s.totalCategories} categories. The Suggest tab keeps this balanced.</p></div>
    </div>
  `;
}

// ---------- SUGGEST tab ----------
function renderSuggest() {
  const v = viewEl();
  const results = suggest(dates, { ...sug, jitter: false });

  v.innerHTML = `
    <section class="card">
      <h2 style="margin:0 0 10px">Tonight's pick</h2>
      <div class="slider-row">
        <span title="repeat favorites">🛋️</span>
        <input id="s-explore" type="range" min="0" max="100" value="${Math.round(sug.explore * 100)}"/>
        <span title="try new things">🧭</span>
      </div>
      <div class="slider-ends"><span>Comfort (favorites)</span><span>Adventure (new)</span></div>

      <div class="row" style="margin-top:14px">
        <label class="field" style="margin:0"><span>Max budget</span>
          <input id="s-budget" type="number" inputmode="numeric" min="0" placeholder="any" value="${sug.budget ?? ""}"/></label>
        <label class="field" style="margin:0"><span>Max effort</span>
          <select id="s-effort">
            ${[["", "Any"], [1, "1 (easy)"], [2, "2"], [3, "3"], [4, "4"], [5, "5 (big)"]]
              .map(([val, lbl]) => `<option value="${val}" ${String(sug.maxEffort ?? "") === String(val) ? "selected" : ""}>${lbl}</option>`).join("")}
          </select></label>
      </div>

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

function renderSugCards(results) {
  if (!results.length) return emptyState("✨", "No ideas match", "Loosen your filters a little.");
  return results.map(r => `
    <div class="card sug-card ${r.kind}">
      <div class="sug-head">
        <h3>${catEmoji(r.category)} ${escHtml(r.title)}</h3>
        <span class="tag ${r.kind}">${r.kind === "explore" ? "New" : "Favorite"}</span>
      </div>
      ${r.photos?.length ? `<div class="sug-photos" data-sug-photos="${r.photos.join(",")}"></div>` : ""}
      <p class="sug-reason">${escHtml(r.reason)}</p>
      <div class="sug-meta">
        <span>${catLabel(r.category)}</span>
        <span>~${fmtMoney(r.estCost)}</span>
        <span>Effort ${"●".repeat(r.effort)}${"○".repeat(5 - r.effort)}</span>
      </div>
      <button class="btn secondary" data-log='${escAttr(JSON.stringify({ title: r.title, category: r.category, cost: r.estCost ?? null, effort: r.effort }))}'>Log this when we do it →</button>
    </div>`).join("");
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

function wireSuggest() {
  const v = viewEl();
  const rerun = (jitter = false) => {
    v.querySelector("#sug-results").innerHTML = renderSugCards(suggest(dates, { ...sug, jitter }));
    wireLogButtons();
    loadSugPhotos();
  };
  v.querySelector("#s-explore").addEventListener("input", e => { sug.explore = e.target.value / 100; rerun(); });
  bind("s-budget", "input", e => { sug.budget = e.target.value === "" ? null : Number(e.target.value); rerun(); });
  bind("s-effort", "change", e => { sug.maxEffort = e.target.value === "" ? null : Number(e.target.value); rerun(); });
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
    rerun();
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
    rerun();
  });
  bind("s-shuffle", "click", () => rerun(true));
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
  viewEl().querySelectorAll("[data-log]").forEach(b => b.addEventListener("click", () => {
    const seed = JSON.parse(b.dataset.log);
    draft = blankEntry();
    Object.assign(draft, { title: seed.title, category: seed.category, cost: seed.cost, effort: seed.effort || 3 });
    editingId = null;
    show("log");
    toast("Pre-filled — save it after your date");
  }));
}

// ---------- menu actions ----------
async function onExport() {
  const data = await db.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `date-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  document.getElementById("sheet").classList.add("hidden");
  toast("Backup downloaded");
}

async function onImport(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const n = await db.importAll(payload, { merge: true });
    await reload();
    document.getElementById("sheet").classList.add("hidden");
    toast(`Imported ${n} dates`);
    show(currentTab);
  } catch (err) { console.error(err); toast("Couldn't read that backup"); }
}

async function onSeed() {
  const { SAMPLE_DATES } = await import("./sample.js");
  for (const e of SAMPLE_DATES) await db.putDate(e());
  await reload();
  document.getElementById("sheet").classList.add("hidden");
  toast("Added sample dates");
  show("insights");
}

async function onWipe() {
  if (!confirm("Erase ALL dates and photos? This cannot be undone.")) return;
  await db.wipeAll();
  await reload();
  urlCache.clear();
  document.getElementById("sheet").classList.add("hidden");
  toast("Everything erased");
  show("log");
}

// ---------- small helpers ----------
function bind(id, ev, fn) { const el = viewEl().querySelector("#" + id); if (el) el.addEventListener(ev, fn); }
function setOn(nodes, active) { nodes.forEach(n => n.classList.toggle("on", n === active)); }

async function photoURL(id) {
  if (!id) return "";
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await db.getPhoto(id);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

function downscale(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("encode failed")), "image/jpeg", quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 2200);
}

function emptyState(big, title, sub) {
  return `<div class="empty"><div class="big">${big}</div><h3 style="margin:8px 0 4px">${title}</h3><p class="muted">${sub}</p></div>`;
}
function escHtml(s) { return String(s ?? "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }
function escAttr(s) { return String(s ?? "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
