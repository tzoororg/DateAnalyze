// UI layer: renders the three tabs, handles the form, photos, charts and suggestions.

import * as db from "./store.js";
import {
  CATEGORIES, REPEAT_OPTIONS, MOOD_OPTIONS, CURRENCIES, catLabel, catEmoji,
  blankEntry, fmtMoney, fmtDate, entryTimeMs, toILS, refreshRates,
} from "./model.js";
import * as A from "./analytics.js";
import * as C from "./charts.js";
import { suggest } from "./suggest.js";
import * as push from "./push.js";

const viewEl = () => document.getElementById("view");
const formEl = () => document.getElementById("logSheetBody");
let dates = [];
let draft = blankEntry();        // the entry currently being composed/edited
let editingId = null;
let currentTab = "home";
const sug = { explore: 0.5, budget: null, maxEffort: null, category: null, moods: [] };
const hist = { sort: "date-desc", category: null, moods: [], query: "", view: "list", expanded: null };
let memoryDismissed = false;
let costCurrency = "ILS";
const urlCache = new Map();      // photoId -> objectURL

export async function init() {
  dates = await db.getAllDates();
  wireChrome();
  wireIdle();
  // A notification tap opens the app at #history (see sw.js notificationclick).
  show(location.hash === "#history" ? "history" : (localStorage.getItem("activeTab") || "home"));
  refreshRates(db.getSetting, db.setSetting);
  db.subscribe(onRemoteChange);
  push.refreshToken();
}

async function onRemoteChange() {
  await reload();
  show(currentTab);
}

async function reload() { dates = await db.getAllDates(); }

// ---------- tab + chrome wiring ----------
const THEME_COLORS = { pink: "#e8577e", plum: "#2a1b26", navy: "#0d1220" };

// pick = explicit user choice ("pink"|"plum"|"navy"); no arg = just sync UI + meta color.
function applyTheme(pick) {
  if (pick) {
    localStorage.setItem("theme", pick);
    document.documentElement.dataset.theme = pick;
  }
  const eff = document.documentElement.dataset.theme || "plum"; // Plum is the default theme
  document.querySelector('meta[name="theme-color"]').setAttribute("content", THEME_COLORS[eff]);
  document.querySelectorAll("[data-theme-pick]").forEach(b =>
    b.classList.toggle("on", b.dataset.themePick === eff));
}

function wireChrome() {
  document.querySelectorAll(".tab").forEach(btn =>
    btn.addEventListener("click", () => show(btn.dataset.tab)));

  document.getElementById("fab").addEventListener("click", openLogSheet);
  document.getElementById("logCloseBtn").addEventListener("click", closeLogSheet);
  document.querySelectorAll("[data-theme-pick]").forEach(b =>
    b.addEventListener("click", () => applyTheme(b.dataset.themePick)));
  applyTheme();

  const sheet = document.getElementById("sheet");
  document.getElementById("menuBtn").addEventListener("click", () => {
    sheet.classList.remove("hidden");
    renderSyncStatus();
    renderSwVersion();
  });
  sheet.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", () => sheet.classList.add("hidden")));

  document.getElementById("exportBtn").addEventListener("click", onExport);
  document.getElementById("importInput").addEventListener("change", onImport);
  document.getElementById("importPhotosInput").addEventListener("change", onImportPhotos);
  document.getElementById("seedBtn").addEventListener("click", onSeed);
  document.getElementById("wipeBtn").addEventListener("click", onWipe);
  document.getElementById("feedbackBtn").addEventListener("click", async () => {
    sheet.classList.add("hidden");
    const { openFeedback } = await import("./feedback.js");
    openFeedback();
  });

  document.getElementById("syncSignInBtn").addEventListener("click", onSyncSignIn);
  document.getElementById("syncCreateBtn").addEventListener("click", onSyncCreate);
  document.getElementById("syncJoinBtn").addEventListener("click", onSyncJoin);
  document.getElementById("syncCopyCodeBtn").addEventListener("click", onSyncCopyCode);
  document.getElementById("syncNotifyBtn").addEventListener("click", onSyncNotify);
  document.getElementById("syncBackfillBtn").addEventListener("click", onSyncBackfill);
  document.getElementById("syncSignOutBtn").addEventListener("click", onSyncSignOut);
  renderSyncStatus();
}

function renderSwVersion() {
  const el = document.getElementById("swVersion");
  if (!el || !navigator.serviceWorker?.controller) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = e => { el.textContent = `App build: ${e.data}`; };
  navigator.serviceWorker.controller.postMessage("GET_VERSION", [channel.port2]);
}

// ---------- sync menu ----------
let lastInviteCode = null;

async function renderSyncStatus() {
  const status = document.getElementById("syncStatus");
  const signIn = document.getElementById("syncSignInBtn");
  const create = document.getElementById("syncCreateBtn");
  const join = document.getElementById("syncJoinBtn");
  const copyCode = document.getElementById("syncCopyCodeBtn");
  const notify = document.getElementById("syncNotifyBtn");
  const backfill = document.getElementById("syncBackfillBtn");
  const signOut = document.getElementById("syncSignOutBtn");
  const mode = db.getMode();
  const user = db.getUser();

  if (mode === "cloud" && user) {
    lastInviteCode = await db.getInviteCode();
    status.textContent = lastInviteCode
      ? `🔄 Syncing as ${user.email} — space code ${lastInviteCode}`
      : `🔄 Syncing as ${user.email}`;
    status.classList.remove("hidden");
    signIn.classList.add("hidden"); create.classList.add("hidden"); join.classList.add("hidden");
    copyCode.classList.toggle("hidden", !lastInviteCode);
    notify.classList.remove("hidden");
    backfill.classList.remove("hidden");
    signOut.classList.remove("hidden");
  } else if (user) {
    status.textContent = `Signed in as ${user.email} — set up a shared space:`;
    status.classList.remove("hidden");
    signIn.classList.add("hidden"); create.classList.remove("hidden"); join.classList.remove("hidden");
    copyCode.classList.add("hidden");
    notify.classList.add("hidden");
    backfill.classList.add("hidden");
    signOut.classList.remove("hidden");
  } else {
    status.classList.add("hidden");
    signIn.classList.remove("hidden"); create.classList.add("hidden"); join.classList.add("hidden");
    copyCode.classList.add("hidden");
    notify.classList.add("hidden");
    backfill.classList.add("hidden");
    signOut.classList.add("hidden");
  }
}

async function onSyncNotify() {
  try {
    const { msg } = await push.enablePush();
    toast(msg);
  } catch (err) { console.error(err); toast("Couldn't turn on notifications"); }
}

async function onSyncBackfill() {
  const btn = document.getElementById("syncBackfillBtn");
  btn.disabled = true;
  toast("Uploading photos…");
  try {
    const n = await db.backfillPhotos((done, total) => { btn.textContent = `🖼️ Uploading ${done}/${total}…`; });
    toast(n ? `Uploaded ${n} photo${n > 1 ? "s" : ""} to your partner` : "No local photos to upload");
  } catch (err) { console.error(err); toast(err.message || "Couldn't upload photos"); }
  finally { btn.disabled = false; btn.textContent = "🖼️ Sync my photos to partner"; }
}

async function onSyncCopyCode() {
  if (!lastInviteCode) return;
  try {
    await navigator.clipboard.writeText(lastInviteCode);
    toast(`Copied ${lastInviteCode} to clipboard`);
  } catch (err) { console.error(err); toast("Couldn't copy — long-press the code above instead"); }
}

async function onSyncSignIn() {
  try {
    await db.signIn();
    renderSyncStatus();
    toast("Signed in");
  } catch (err) { console.error(err); toast(err.message || "Sign-in failed"); }
}

async function onSyncCreate() {
  try {
    const uploadExisting = dates.length > 0 &&
      confirm(`Upload your existing ${dates.length} dates to the shared space?`);
    const code = await db.createSpace(uploadExisting);
    await reload();
    renderSyncStatus();
    show(currentTab);
    toast(`Space created — share code ${code} with your partner`);
  } catch (err) { console.error(err); toast(err.message || "Couldn't create space"); }
}

async function onSyncJoin() {
  const code = prompt("Enter the 6-character code from your partner:");
  if (!code) return;
  try {
    await db.joinSpace(code);
    await reload();
    renderSyncStatus();
    show(currentTab);
    toast("Joined — syncing with your partner ♥");
  } catch (err) { console.error(err); toast(err.message || "Couldn't join — check the code"); }
}

async function onSyncSignOut() {
  if (db.getMode() === "cloud" &&
    !confirm("Stop syncing? This device goes back to its own local-only data.")) return;
  try {
    await db.signOut();
    await reload();
    renderSyncStatus();
    show(currentTab);
    toast("Back to local-only mode");
  } catch (err) { console.error(err); toast(err.message || "Couldn't sign out"); }
}

function show(tab) {
  if (!["home", "history", "insights", "suggest"].includes(tab)) tab = "home"; // migrates stale "log"
  currentTab = tab;
  localStorage.setItem("activeTab", tab);
  document.querySelectorAll(".tab").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  if (tab === "home") renderHome();
  else if (tab === "history") renderHistory();
  else if (tab === "insights") renderInsights();
  else renderSuggest();
  viewEl().scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

// ---------- HOME tab ----------
function renderHome() {
  const v = viewEl();
  const top = suggest(dates, { explore: 0.5 })[0];
  const memories = !memoryDismissed ? A.onThisDay(dates) : [];
  const s = A.summary(dates);
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

  v.innerHTML = `
    ${top ? `
    <h3 class="section-title">Tonight's pick</h3>
    <section class="card hero-card">
      <span class="sticker-tag ${top.kind === "explore" ? "butter" : "mint"}">${top.kind === "explore" ? "new!" : "favorite ♥"}</span>
      <h3>${catEmoji(top.category)} ${escHtml(top.title)}</h3>
      <p class="sug-reason">${escHtml(top.reason)}</p>
      <button class="mini-btn" id="home-plan">Plan it →</button>
    </section>` : ""}
    ${memoryCard}
    <h3 class="section-title">Recent memories</h3>
    <div id="date-list"></div>
    ${dates.length ? `
    <h3 class="section-title">Our story so far</h3>
    <div class="stat-grid trio">
      <div class="stat"><div class="num">${s.count}</div><div class="lbl">Dates</div></div>
      <div class="stat"><div class="num">${s.avgEnjoyment.toFixed(1)}★</div><div class="lbl">Avg joy</div></div>
      <div class="stat"><div class="num">${s.distinctCategories}/${s.totalCategories}</div><div class="lbl">Categories</div></div>
    </div>` : ""}
  `;
  bind("home-plan", "click", () => show("suggest"));
  bind("memory-dismiss", "click", () => { memoryDismissed = true; renderHome(); });
  renderList();
}

// ---------- log sheet (opened from the ＋ button) ----------
function openLogSheet() {
  document.getElementById("logSheet").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderLog();
}

function closeLogSheet() {
  document.getElementById("logSheet").classList.add("hidden");
  document.body.style.overflow = "";
}

// ---------- log form (renders inside the log sheet) ----------
function renderLog() {
  const v = formEl();
  const isEdit = !!editingId;
  document.querySelector(".logsheet-title").textContent = isEdit ? "Edit date" : "New page!";
  v.innerHTML = `
    <section class="card">
      <label class="field" style="margin-top:0"><span>What did you do?</span>
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
  `;
  wireForm();
  renderPhotoStrip();
}

function ratingBlock(label, field, value, unit) {
  const pills = [1, 2, 3, 4, 5].map(n =>
    `<button class="${n === value ? "on" : ""}" data-rating="${field}" data-val="${n}">${n}${unit}</button>`).join("");
  return `<label class="field"><span>${label}</span></label><div class="rating ${unit ? "stars" : ""}" data-rating-group="${field}">${pills}</div>`;
}

function wireForm() {
  const v = formEl();
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
  if (cancel) cancel.addEventListener("click", () => { resetDraft(); closeLogSheet(); });
}

async function renderPhotoStrip() {
  const strip = formEl().querySelector("#f-photos");
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
    const v = formEl();
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
  const isNew = !editingId;
  if (isNew) draft.createdAt = Date.now();
  await db.putDate(draft);
  if (isNew) push.sendNewDatePush(draft.title); // fire-and-forget; no-op unless syncing
  await reload();
  const saved = costCurrency !== "ILS" && draft.cost != null ? ` (${fmtMoney(draft.cost)})` : "";
  toast((editingId ? "Updated ♥" : "Date saved ♥") + saved);
  resetDraft();
  costCurrency = "ILS";
  closeLogSheet();
  show(currentTab);
}

function resetDraft() { draft = blankEntry(); editingId = null; }

async function editEntry(id) {
  const e = await db.getDate(id);
  if (!e) return;
  draft = structuredClone(e);
  editingId = id;
  openLogSheet();
}

async function removeEntry(id) {
  if (!confirm("Delete this date?")) return;
  await db.deleteDate(id);
  await reload();
  toast("Deleted");
  show(currentTab);
}

// Renders the 3 most recent dates into #date-list (used by the Home tab).
async function renderList() {
  const host = viewEl().querySelector("#date-list");
  if (!host) return;
  if (!dates.length) {
    host.innerHTML = `<div class="empty"><div class="big">📭</div>No dates yet — tap ＋ to log your first one, or add demo data from the ⋯ menu.</div>`;
    return;
  }
  const sorted = [...dates].sort((a, b) => entryTimeMs(b) - entryTimeMs(a)).slice(0, 3);
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
        <button class="seg slideshow-btn" id="h-slideshow" title="Play a slideshow of your highlights">▶ Slideshow</button>
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
            ${hist.moods.length ? `<span class="fg-badge">${hist.moods.length === 1 ? (MOOD_OPTIONS.find(m => m.key === hist.moods[0])?.emoji + " " + MOOD_OPTIONS.find(m => m.key === hist.moods[0])?.label) : hist.moods.length + " selected"}</span>` : ""}
            <span class="fg-arrow">▼</span>
          </span>
        </summary>
        <div class="chips" id="h-mood">
          ${MOOD_OPTIONS.map(m => `<button class="chip ${hist.moods.includes(m.key) ? "on" : ""}" data-hmood="${m.key}">${m.emoji} ${m.label}</button>`).join("")}
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
  bind("h-slideshow", "click", startSlideshow);
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
    const key = b.dataset.hmood;
    if (hist.moods.includes(key)) hist.moods = hist.moods.filter(m => m !== key);
    else hist.moods = [...hist.moods, key];
    v.querySelectorAll("#h-mood .chip").forEach(chip => {
      chip.classList.toggle("on", hist.moods.includes(chip.dataset.hmood));
    });
    const badge = v.querySelector("#h-mood-group summary .fg-badge");
    if (badge) badge.remove();
    if (hist.moods.length) {
      const span = document.createElement("span");
      span.className = "fg-badge";
      const m0 = MOOD_OPTIONS.find(m => m.key === hist.moods[0]);
      span.textContent = hist.moods.length === 1 ? `${m0.emoji} ${m0.label}` : `${hist.moods.length} selected`;
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
  if (hist.moods.length) list = list.filter(e => Array.isArray(e.mood) && hist.moods.some(k => e.mood.includes(k)));
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
    const tiles = [...host.querySelectorAll(".gallery-tile")];
    tiles.forEach((tile, i) => tile.addEventListener("click", () => {
      const items = tiles.map(t => ({
        url: t.querySelector("img").getAttribute("src"),
        caption: t.querySelector(".gallery-label").textContent,
      }));
      openLightbox(items, i);
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
    const urls = (await Promise.all(ids.map(id => photoURL(id)))).filter(Boolean);
    el.innerHTML = urls.map(u => `<img src="${u}" alt=""/>`).join("");
    el.querySelectorAll("img").forEach((img, i) =>
      img.addEventListener("click", () => openLightbox(urls.map(url => ({ url })), i)));
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
      <h2 style="margin:0 0 10px">Date night ideas</h2>
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
    openLogSheet();
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
  const msg = db.getMode() === "cloud"
    ? "Erase ALL dates and photos in your shared space — for both of you? This cannot be undone."
    : "Erase ALL dates and photos? This cannot be undone.";
  if (!confirm(msg)) return;
  await db.wipeAll();
  await reload();
  urlCache.clear();
  document.getElementById("sheet").classList.add("hidden");
  toast("Everything erased");
  show("home");
}

// ---------- photo import (EXIF triage) ----------
let triageItems = null;

async function onImportPhotos(e) {
  const files = [...e.target.files].filter(f => f.type.startsWith("image/"));
  e.target.value = "";
  if (!files.length) return;
  document.getElementById("sheet").classList.add("hidden");
  toast("Reading photos…");
  const { readExif } = await import("./exif.js");
  // Group all photos taken on the same day into one candidate date entry.
  const byDate = new Map();
  for (const file of files) {
    let ex = {};
    try { ex = await readExif(file); } catch (err) { console.error(err); }
    const date = ex.date || fileDateISO(file);
    let g = byDate.get(date);
    if (!g) {
      g = { date, files: [], urls: [], location: "", title: "", category: "dining", keep: true };
      byDate.set(date, g);
    }
    g.files.push(file);
    g.urls.push(URL.createObjectURL(file));
    if (!g.location && ex.lat != null) g.location = `${ex.lat.toFixed(5)}, ${ex.lon.toFixed(5)}`;
  }
  const groups = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  openTriage(groups);
}

function fileDateISO(file) {
  const d = new Date(file.lastModified || Date.now());
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function openTriage(items) {
  triageItems = items;
  const nPhotos = items.reduce((s, g) => s + g.files.length, 0);
  const box = document.createElement("div");
  box.className = "triage";
  box.innerHTML = `
    <div class="triage-head">
      <strong>${nPhotos} photo${nPhotos > 1 ? "s" : ""} · ${items.length} date${items.length > 1 ? "s" : ""}</strong>
      <span class="muted small">Photos from the same day are grouped. Set a title &amp; category, or skip.</span>
    </div>
    <div class="triage-list">${items.map(triageCard).join("")}</div>
    <div class="triage-foot">
      <button class="btn ghost" data-tr="cancel">Cancel</button>
      <button class="btn" data-tr="import">Import kept</button>
    </div>`;
  document.body.appendChild(box);

  box.addEventListener("input", ev => {
    const el = ev.target.closest("[data-i]"); if (!el) return;
    triageItems[+el.dataset.i][el.dataset.f] = el.value;
  });
  box.addEventListener("change", ev => {
    const el = ev.target.closest("[data-i]"); if (!el) return;
    triageItems[+el.dataset.i][el.dataset.f] = el.value;
  });
  box.addEventListener("click", async ev => {
    const skip = ev.target.closest("[data-skip]");
    if (skip) {
      const i = +skip.dataset.skip, it = triageItems[i];
      it.keep = !it.keep;
      box.querySelector(`[data-card="${i}"]`).classList.toggle("skipped", !it.keep);
      skip.textContent = it.keep ? "Skip" : "Keep";
      return;
    }
    const act = ev.target.closest("[data-tr]");
    if (!act) return;
    if (act.dataset.tr === "cancel") return closeTriage(box);
    act.disabled = true;
    await importTriage();
    closeTriage(box);
  });
}

function triageCard(g, i) {
  const badge = g.files.length > 1 ? `<span class="triage-count">${g.files.length}</span>` : "";
  return `<div class="triage-card" data-card="${i}">
    <div class="triage-thumb"><img src="${g.urls[0]}" alt=""/>${badge}</div>
    <div class="triage-fields">
      <input data-i="${i}" data-f="title" type="text" placeholder="${escAttr(catLabel(g.category))}" value="${escAttr(g.title)}"/>
      <div class="row">
        <select data-i="${i}" data-f="category">
          ${CATEGORIES.map(c => `<option value="${c.key}" ${g.category === c.key ? "selected" : ""}>${c.emoji} ${c.label}</option>`).join("")}
        </select>
        <input data-i="${i}" data-f="date" type="date" value="${g.date}"/>
      </div>
    </div>
    <button class="triage-skip" data-skip="${i}">Skip</button>
  </div>`;
}

async function importTriage() {
  const kept = triageItems.filter(g => g.keep);
  let n = 0;
  for (const g of kept) {
    try {
      const photos = [];
      for (const file of g.files) {
        const blob = await downscale(file, 1280, 0.82);
        photos.push(await db.putPhoto(blob));
      }
      const entry = blankEntry();
      entry.date = g.date;
      entry.title = g.title.trim() || catLabel(g.category);
      entry.category = g.category;
      entry.location = g.location;
      entry.photos = photos;
      await db.putDate(entry);
      n++;
    } catch (err) { console.error(err); }
  }
  await reload();
  toast(n ? `Imported ${n} date${n > 1 ? "s" : ""} ♥` : "Nothing imported");
  if (n) show("history");
}

function closeTriage(box) {
  (triageItems || []).forEach(g => g.urls.forEach(u => URL.revokeObjectURL(u)));
  triageItems = null;
  box.remove();
}

// ---------- small helpers ----------
// ids are unique app-wide (form ids live in the log sheet, tab ids in #view)
function bind(id, ev, fn) { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); }
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

// Full-screen photo viewer. items: [{ url, caption, entryId? }]. Supports prev/next
// + swipe. opts.autoAdvanceMs turns it into a slideshow; opts.onTap(item) fires when
// a slide is tapped (used to jump to that date) instead of dismissing.
function openLightbox(items, startIndex = 0, opts = {}) {
  items = items.filter(it => it && it.url);
  if (!items.length) return;
  const { autoAdvanceMs = 0, onTap = null } = opts;
  let idx = Math.max(0, Math.min(startIndex, items.length - 1));
  const multi = items.length > 1;
  const box = document.createElement("div");
  box.className = "lightbox" + (autoAdvanceMs ? " slideshow" : "");
  box.innerHTML = `
    <button class="lb-close" aria-label="Close">✕</button>
    <button class="lb-nav lb-prev" aria-label="Previous"${multi ? "" : " hidden"}>‹</button>
    <img class="lb-img" src="" alt=""/>
    <button class="lb-nav lb-next" aria-label="Next"${multi ? "" : " hidden"}>›</button>
    <div class="lb-caption"></div>`;
  const imgEl = box.querySelector(".lb-img");
  const capEl = box.querySelector(".lb-caption");
  let timer = null;
  const arm = () => { if (autoAdvanceMs && multi) { clearInterval(timer); timer = setInterval(() => go(1), autoAdvanceMs); } };
  const show = () => {
    if (autoAdvanceMs) { imgEl.style.opacity = "0"; imgEl.onload = () => { imgEl.style.opacity = "1"; }; }
    imgEl.src = items[idx].url;
    capEl.textContent = items[idx].caption || "";
    capEl.style.display = items[idx].caption ? "" : "none";
  };
  const go = d => { idx = (idx + d + items.length) % items.length; show(); };
  const goUser = d => { go(d); arm(); };   // manual nav restarts the auto-advance clock
  const close = () => { clearInterval(timer); document.removeEventListener("keydown", onKey); box.remove(); };
  const onKey = e => {
    if (e.key === "Escape") close();
    else if (multi && e.key === "ArrowLeft") goUser(-1);
    else if (multi && e.key === "ArrowRight") goUser(1);
  };
  box.querySelector(".lb-close").addEventListener("click", close);
  box.querySelector(".lb-prev").addEventListener("click", e => { e.stopPropagation(); goUser(-1); });
  box.querySelector(".lb-next").addEventListener("click", e => { e.stopPropagation(); goUser(1); });
  imgEl.addEventListener("click", e => {
    e.stopPropagation();
    if (onTap) { close(); onTap(items[idx]); }
  });
  box.addEventListener("click", close);   // tap backdrop to dismiss
  document.addEventListener("keydown", onKey);
  let sx = null;
  box.addEventListener("touchstart", e => { sx = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", e => {
    if (sx == null || !multi) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 45) goUser(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });
  document.body.appendChild(box);
  show();
  arm();
}

// Highlights slideshow: fullscreen auto-advancing reel of your best photos.
// Tapping a slide jumps to that date. Same data path a native lockscreen carousel
// would consume (A.highlightReel) — see the note there.
async function startSlideshow() {
  const reel = A.highlightReel(dates);
  if (!reel.length) { toast("No photos yet — log a date with a photo first."); return; }
  const items = [];
  for (const r of reel) {
    const url = await photoURL(r.photoId);
    if (url) items.push({ url, caption: r.title, entryId: r.entryId });
  }
  openLightbox(items, 0, { autoAdvanceMs: 5000, onTap: it => it.entryId && openEntry(it.entryId) });
}

// Jump to a single date's entry in History, expanded and scrolled into view.
function openEntry(entryId) {
  hist.view = "list";           // the expanded detail only renders in list view
  hist.category = null; hist.moods = []; hist.query = "";  // clear filters so the entry is guaranteed visible
  hist.expanded = entryId;
  show("history");
  requestAnimationFrame(() =>
    viewEl().querySelector(".hist-entry.open")?.scrollIntoView({ block: "center" }));
}

// Idle screensaver: after IDLE_MS of no interaction, auto-start the slideshow
// (only when the tab is visible, nothing is already open, and photos exist).
let idleTimer = null;
const IDLE_MS = 60000;
function resetIdle() { clearTimeout(idleTimer); idleTimer = setTimeout(maybeScreensaver, IDLE_MS); }
function maybeScreensaver() {
  if (document.visibilityState !== "visible") return;
  if (document.querySelector(".lightbox")) return;
  if (!dates.some(d => Array.isArray(d.photos) && d.photos.length)) return;
  startSlideshow();
}
function wireIdle() {
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    document.addEventListener(ev, resetIdle, { passive: true }));
  document.addEventListener("visibilitychange", resetIdle);
  resetIdle();
}

export function downscale(file, maxDim, quality) {
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
export function toast(msg) {
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
