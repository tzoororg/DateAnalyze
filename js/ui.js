// UI layer: app chrome, the Home and History tabs, the log form and photos.
// The Insights and Suggest tabs live in ui-insights.js / ui-suggest.js — they read
// the date list and own their own view state, so they get a small ctx from here
// rather than importing this module back. Leaf helpers are in ui-shared.js.

import * as db from "./store.js";
import {
  CATEGORIES, MOOD_OPTIONS, COST_TIERS, METER, catLabel, catEmoji,
  blankEntry, fmtDate, entryTimeMs, tierForCost, repeatForEnjoyment,
  normTitle, todayISO, fmtDuration,
} from "./model.js";
import * as A from "./analytics.js";
import { suggest } from "./suggest.js";   // Home's "tonight's idea" card
import * as push from "./push.js";
import { renderInsights } from "./ui-insights.js";
import { renderSuggest } from "./ui-suggest.js";
import {
  viewEl, bind, setOn, escHtml, escAttr, safeUrl, costBadge, tierPill, heartsHtml,
  emptyState2, wireEmpty2Cta, toast, photoURL, clearPhotoCache,
  attachSwipe, attachSwipeDown, downscale,
} from "./ui-shared.js";

const formEl = () => document.getElementById("logSheetBody");
let dates = [];
// Wishlist ideas (status:"idea") live in the same `dates` array so History can show
// them, but every analytics/suggest/memory consumer reads done() to exclude them.
// Legacy entries have no status → treated as done.
const done = () => dates.filter(e => e.status !== "idea");
let draft = blankEntry();        // the entry currently being composed/edited
let editingId = null;
let draftSnapshot = null;        // JSON snapshot of draft when an edit was opened, to detect no-op edits on close
// True once the "When" date is deliberately set (manual edit, editing an entry,
// a date-night session) — blocks the EXIF auto-fill so it only ever replaces the
// untouched default. Also set by the auto-fill itself, so it fires at most once.
let dateTouched = false;
let currentTab = "home";
const hist = { sort: "date-desc", category: null, moods: [], query: "", view: "list", expanded: null };
let memoryDismissed = false;

// ---------- Date Night mode (Roadmap #7) ----------
// activeDate: { startedAt: <ms>, photoIds: [<uuid>...] } | null. Device-local setting;
// the finished entry syncs like any other date once "End" saves it.
let activeDate = null;
let dnTimer = null;
const DN_MAX_MIN = 720; // 12h auto-expire cap

export async function init() {
  dates = await db.getAllDates();
  activeDate = await db.getSetting("activeDate", null);
  memoryDismissed = (await db.getSetting("memoryDismissed", null)) === todayISO();
  wireChrome();
  wireIdle();
  updateFab();
  if (activeDate) startDnTimer();
  // A notification tap opens the app at #history (see sw.js notificationclick).
  show(location.hash === "#history" ? "history" : "home");
  // First-run explainer: show once to genuinely new users; ?shot=intro forces it
  // (for capture/smoke); suppressed under every other ?shot so captures stay clean.
  const shot = new URLSearchParams(location.search).get("shot");
  const seenIntro = await db.getSetting("seenIntro", false);
  let welcomeShown = false;
  if (shot === "welcome") { renderWelcomeScreen(1); showWelcome(); welcomeShown = true; }
  else welcomeShown = await maybeShowWelcome();
  if (welcomeShown) {
    await db.setSetting("seenIntro", true); // welcome supersedes the old intro sheet
  } else if (shot === "intro") showIntro();
  else if (!shot && !seenIntro) {
    if (dates.length === 0) showIntro();
    else await db.setSetting("seenIntro", true); // existing user — never nag later
  }
  db.subscribe(onRemoteChange);
  push.refreshToken();
  if (dates.length) maybeRequestPersist();
  maybeBackupNudge();
  const TABS = [...document.querySelectorAll(".tab[data-tab]")].map(b => b.dataset.tab);
  let swipeTarget = null;
  viewEl().addEventListener("touchstart", e => { swipeTarget = e.target; }, { passive: true, capture: true });
  attachSwipe(viewEl(),
    () => { if (swipeTarget?.closest('.wrap-card, input[type=range]')) return; show(TABS[Math.min(TABS.length - 1, TABS.indexOf(currentTab) + 1)]); },
    () => { if (swipeTarget?.closest('.wrap-card, input[type=range]')) return; show(TABS[Math.max(0, TABS.indexOf(currentTab) - 1)]); });
}

async function onRemoteChange() {
  await reload();
  show(currentTab);
}

async function reload() { dates = await db.getAllDates(); }

// ---------- tab + chrome wiring ----------
const THEME_COLORS = { plum: "#2a1b26", candle: "#211511", twilight: "#141126" };

// pick = explicit user choice ("plum"|"candle"|"twilight"); no arg = just sync UI + meta color.
function applyTheme(pick) {
  if (pick) {
    localStorage.setItem("theme", pick);
    document.documentElement.dataset.theme = pick;
  }
  const eff = document.documentElement.dataset.theme || "plum"; // Plum is the default theme
  document.querySelector('meta[name="theme-color"]').setAttribute("content", THEME_COLORS[eff]);
  document.querySelectorAll("[data-theme-pick]").forEach(b =>
    b.classList.toggle("on", b.dataset.themePick === eff));
  // The Wrapped card bakes the theme into literal SVG colors; re-render it on switch.
  if (pick && currentTab === "insights") renderInsights(insightsCtx);
}

function wireChrome() {
  document.querySelectorAll(".tab").forEach(btn =>
    btn.addEventListener("click", () => show(btn.dataset.tab)));

  document.getElementById("fab").addEventListener("click", () => {
    if (activeDate) document.getElementById("dnCameraInput").click();
    else openLogSheet();
  });
  document.getElementById("dnCameraInput").addEventListener("change", onDnPhotoPick);
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

  const idleBtns = document.querySelectorAll("[data-idle-pick]");
  const markIdleBtn = () => idleBtns.forEach(b => b.classList.toggle("on", +b.dataset.idlePick === idleMs));
  markIdleBtn();
  idleBtns.forEach(b => b.addEventListener("click", () => {
    idleMs = +b.dataset.idlePick;
    localStorage.setItem("idleMs", String(idleMs));
    markIdleBtn();
    resetIdle();
    toast(idleMs ? "Slideshow starts after idle" : "Idle slideshow off");
  }));

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
  document.getElementById("syncRegenBtn").addEventListener("click", onSyncRegen);
  document.getElementById("syncNotifyBtn").addEventListener("click", onSyncNotify);
  document.getElementById("syncBackfillBtn").addEventListener("click", onSyncBackfill);
  document.getElementById("syncShowKeyBtn").addEventListener("click", onSyncShowKey);
  document.getElementById("syncEnterKeyBtn").addEventListener("click", onSyncEnterKey);
  document.getElementById("syncEncryptBtn").addEventListener("click", onSyncEncrypt);
  document.getElementById("syncSignOutBtn").addEventListener("click", onSyncSignOut);
  document.getElementById("syncDeleteAcctBtn").addEventListener("click", onDeleteAccount);
  renderSyncStatus();
}

// First-run explainer (PRODUCTION §2): one-time welcome/privacy sheet, dismissed
// only by its CTA. Gating lives in init().
function showIntro() {
  const el = document.getElementById("introSheet");
  el.classList.remove("hidden");
  document.getElementById("introStartBtn").addEventListener("click", async () => {
    await db.setSetting("seenIntro", true);
    el.classList.add("hidden");
  }, { once: true });
}

function renderSwVersion() {
  const el = document.getElementById("swVersion");
  if (!el || !navigator.serviceWorker?.controller) return;
  const channel = new MessageChannel();
  channel.port1.onmessage = e => { el.textContent = `App build: ${e.data}`; };
  navigator.serviceWorker.controller.postMessage("GET_VERSION", [channel.port2]);
}

// ---------- storage persistence (plan §3.1) ----------

// Ask the browser to protect IndexedDB from eviction. Once per install.
async function maybeRequestPersist() {
  if (!navigator.storage?.persist) return;
  if (await db.getSetting("persistAsked", false)) return;
  await db.setSetting("persistAsked", true);
  const granted = await navigator.storage.persist().catch(() => false);
  await db.setSetting("persistGranted", granted);
}

async function renderStorageStatus() {
  const el = document.getElementById("storageStatus");
  if (!el) return;
  try {
    const last = await db.getSetting("lastExportAt", 0);
    el.textContent = last
      ? `backed up ${Math.max(0, Math.floor((Date.now() - last) / 86400e3))}d ago`
      : "no backup yet";
  } catch { el.textContent = ""; }
}

// Gentle reminder to back up if local-only, has data, and no export in 60 days.
// Shown as a persistent banner on Home (not a one-shot toast) until exported or dismissed.
let showBackupBanner = false;
async function maybeBackupNudge() {
  if (db.getMode() !== "local" || !dates.length) { showBackupBanner = false; return; }
  const last = await db.getSetting("lastExportAt", 0);
  if (last && Date.now() - last < 60 * 86400e3) { showBackupBanner = false; return; }
  const snooze = await db.getSetting("backupNudgeSnooze", 0);
  showBackupBanner = !(snooze && Date.now() < snooze);
}

// ---------- sync menu ----------
let lastInviteCode = null;

async function renderSyncStatus() {
  const status = document.getElementById("syncStatus");
  const explainer = document.getElementById("syncExplainer");
  const signIn = document.getElementById("syncSignInBtn");
  const create = document.getElementById("syncCreateBtn");
  const join = document.getElementById("syncJoinBtn");
  const copyCode = document.getElementById("syncCopyCodeBtn");
  const regen = document.getElementById("syncRegenBtn");
  const notify = document.getElementById("syncNotifyBtn");
  const backfill = document.getElementById("syncBackfillBtn");
  const signOut = document.getElementById("syncSignOutBtn");
  const deleteAcct = document.getElementById("syncDeleteAcctBtn");
  const showKey = document.getElementById("syncShowKeyBtn");
  const enterKey = document.getElementById("syncEnterKeyBtn");
  const encrypt = document.getElementById("syncEncryptBtn");
  const mode = db.getMode();
  const user = db.getUser();
  renderStorageStatus();
  const hint = document.getElementById("syncHint");
  if (hint) hint.textContent = mode === "cloud" ? "Syncing" : "Local only";

  const keyB64 = mode === "cloud" ? await db.getSpaceKeyB64() : null;
  showKey.classList.toggle("hidden", !keyB64);
  enterKey.classList.toggle("hidden", !(mode === "cloud" && user && !keyB64));
  encrypt.classList.toggle("hidden", !(mode === "cloud" && user && keyB64));

  if (mode === "cloud" && user) {
    lastInviteCode = await db.getInviteCode();
    if (lastInviteCode) {
      const exp = await db.getSetting("spaceInviteCodeExp", null);
      const daysLeft = exp ? Math.ceil((exp - Date.now()) / 86_400_000) : null;
      const validity = daysLeft == null ? "" : daysLeft > 0 ? ` (valid ${daysLeft}d)` : " (expired — tap New pairing code)";
      status.textContent = `🔄 Syncing as ${user.email} — space code ${lastInviteCode}${validity}`;
    } else {
      status.textContent = `🔄 Syncing as ${user.email}`;
    }
    status.classList.remove("hidden");
    explainer.classList.add("hidden");
    signIn.classList.add("hidden"); create.classList.add("hidden"); join.classList.add("hidden");
    copyCode.classList.toggle("hidden", !lastInviteCode);
    regen.classList.toggle("hidden", !lastInviteCode);
    notify.classList.remove("hidden");
    backfill.classList.remove("hidden");
    signOut.classList.remove("hidden");
    deleteAcct.classList.remove("hidden");
  } else if (user) {
    status.textContent = `Signed in as ${user.email} — set up a shared space:`;
    status.classList.remove("hidden");
    explainer.classList.add("hidden");
    signIn.classList.add("hidden"); create.classList.remove("hidden"); join.classList.remove("hidden");
    copyCode.classList.add("hidden");
    regen.classList.add("hidden");
    notify.classList.add("hidden");
    backfill.classList.add("hidden");
    signOut.classList.remove("hidden");
    deleteAcct.classList.remove("hidden");
  } else {
    status.classList.add("hidden");
    explainer.classList.remove("hidden");
    signIn.classList.remove("hidden"); create.classList.add("hidden"); join.classList.add("hidden");
    copyCode.classList.add("hidden");
    regen.classList.add("hidden");
    notify.classList.add("hidden");
    backfill.classList.add("hidden");
    signOut.classList.add("hidden");
    deleteAcct.classList.add("hidden");
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

async function onSyncShowKey() {
  const keyB64 = await db.getSpaceKeyB64();
  if (!keyB64) return;
  prompt("Your encryption key — store this safely. Lost key = lost cloud data.\nYour partner needs it too (it's part of the invite code).", keyB64);
}

async function onSyncEnterKey() {
  const b64 = prompt("Paste your encryption key:");
  if (!b64) return;
  try {
    await db.setSpaceKeyB64(b64);
    await reload();
    renderSyncStatus();
    show(currentTab);
    toast("Key saved — data decrypted");
  } catch (err) { console.error(err); toast("That key doesn't look right"); }
}

async function onSyncEncrypt() {
  const btn = document.getElementById("syncEncryptBtn");
  btn.disabled = true;
  toast("Encrypting cloud data…");
  try {
    const n = await db.encryptExistingData((done, total) => { btn.textContent = `🔐 Encrypting ${done}/${total}…`; });
    toast(n ? `Encrypted ${n} item${n > 1 ? "s" : ""}` : "Everything already encrypted");
    renderSyncStatus();
  } catch (err) { console.error(err); toast(err.message || "Couldn't encrypt"); }
  finally { btn.disabled = false; btn.textContent = "🔐 Encrypt cloud data"; }
}

async function onSyncCopyCode() {
  if (!lastInviteCode) return;
  try {
    await navigator.clipboard.writeText(lastInviteCode);
    toast(`Copied ${lastInviteCode} to clipboard`);
  } catch (err) { console.error(err); toast("Couldn't copy — long-press the code above instead"); }
}

async function onSyncRegen() {
  if (!confirm("Get a fresh 7-day pairing code? The current code stops working.")) return;
  try {
    const combined = await db.regenerateInviteCode();
    if (!combined) return;
    try { await navigator.clipboard.writeText(combined); } catch { /* clipboard optional */ }
    renderSyncStatus();
    toast("New code ready — copied to clipboard");
  } catch (err) { console.error(err); toast(err.message || "Couldn't make a new code"); }
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
  const code = prompt("Enter the code from your partner:");
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

async function onDeleteAccount() {
  const cloud = db.getMode() === "cloud";
  const msg = cloud
    ? "Delete your account? This removes your sign-in and, if your partner isn't in the space, all shared dates and photos. This cannot be undone."
    : "Delete your account and all data on this device? This cannot be undone.";
  if (!confirm(msg)) return;
  if (!confirm("Are you sure? This is permanent.")) return;
  const btn = document.getElementById("syncDeleteAcctBtn");
  btn.disabled = true;
  try {
    await db.deleteAccount();
    await reload();
    clearPhotoCache();
    renderSyncStatus();
    document.getElementById("sheet").classList.add("hidden");
    show("home");
    toast("Account deleted");
  } catch (err) { console.error(err); toast(err.message || "Couldn't delete account"); }
  finally { btn.disabled = false; }
}

// ---------- new-user onboarding (design/welcome.html) ----------
// Full-screen welcome flow for a brand-new, local, signed-out, zero-date
// profile. Once dismissed (any exit path) it never returns. Reuses the same
// store.signIn/createSpace/joinSpace calls as the settings-menu sync rows.
async function maybeShowWelcome() {
  if (dates.length || db.getMode() !== "local") return false;
  if (await db.getSetting("welcomeDismissed", false)) return false;
  renderWelcomeScreen(db.getUser() ? 2 : 1);
  showWelcome();
  return true;
}

function showWelcome() { document.getElementById("welcomeView").classList.remove("hidden"); }
function hideWelcome() { document.getElementById("welcomeView").classList.add("hidden"); }

async function dismissWelcome(tab = "home") {
  await db.setSetting("welcomeDismissed", true);
  hideWelcome();
  show(tab);
}

function welcomeFirstName() {
  const u = db.getUser();
  return u?.displayName?.split(" ")[0] || u?.email?.split("@")[0] || "";
}

function renderWelcomeScreen(screen, code = "") {
  const el = document.getElementById("welcomeView");
  if (screen === 1) {
    el.innerHTML = `
      <div class="ob">
        <div class="ob-hero">
          <div class="w-heart">💞</div>
          <h1>Us</h1>
          <p class="w-sub">A little book of your dates together — what you did, how it felt, and ideas for the next one.</p>
        </div>
        <div class="ob-stack">
          <button class="w-choice together" id="wTogetherBtn"><span class="c-title"><span>💑</span> Track together</span></button>
          <button class="w-choice alone" id="wAloneBtn"><span class="c-title"><span>📔</span> Just me</span></button>
          <p class="w-privacy">🔒 Private by default — no account needed, and syncing is end-to-end encrypted.</p>
        </div>
      </div>`;
    document.getElementById("wTogetherBtn").addEventListener("click", onWelcomeTogether);
    document.getElementById("wAloneBtn").addEventListener("click", () => dismissWelcome());
  } else if (screen === 2) {
    const name = welcomeFirstName();
    el.innerHTML = `
      <button class="btn ghost small p-back" id="wBackBtn">‹ Back</button>
      <div class="ob">
        <div class="ob-hero">
          <div class="w-heart">👋</div>
          <h2>You're in${name ? `, ${name}` : ""}</h2>
          <p class="w-sub">Connect your two phones — one of you starts, the other joins with a code.</p>
        </div>
        <div class="ob-stack">
          <button class="w-choice together" id="wCreateBtn"><span class="c-title"><span>✨</span> I'm first — create our space</span></button>
          <button class="w-choice alone" id="wJoinBtn">
            <span class="c-title"><span>🔑</span> I have a code</span>
            <span class="c-desc">Paste the code your partner sent you.</span>
          </button>
        </div>
      </div>`;
    document.getElementById("wBackBtn").addEventListener("click", () => renderWelcomeScreen(1));
    document.getElementById("wCreateBtn").addEventListener("click", onWelcomeCreate);
    document.getElementById("wJoinBtn").addEventListener("click", onWelcomeJoin);
  } else {
    const display = code.split(".")[0] || code;
    el.innerHTML = `
      <button class="btn ghost small p-back" id="wBackBtn">‹ Back</button>
      <div class="ob">
        <div class="ob-hero">
          <div class="w-heart">💌</div>
          <h2>Send this to your partner</h2>
          <p class="w-sub">They tap <b>Track together → I have a code</b> and paste it.</p>
        </div>
        <div class="ob-stack">
          <div class="code-big" id="wCodeTile">${display}<span class="c-tap">tap to copy</span><span class="c-stamp">💞</span></div>
          <p class="code-hint">Valid for 7 days · includes your encryption key</p>
          <button class="btn" id="wShareBtn">📤 Share code</button>
          <div class="code-wait"><span class="dotpulse"></span> Waiting for your partner…</div>
          <div><button class="w-textlink" id="wSkipBtn">Skip for now — start logging</button></div>
        </div>
      </div>`;
    document.getElementById("wBackBtn").addEventListener("click", () => renderWelcomeScreen(2));
    document.getElementById("wCodeTile").addEventListener("click", () => copyWelcomeCode(code));
    document.getElementById("wShareBtn").addEventListener("click", () => shareWelcomeCode(code));
    document.getElementById("wSkipBtn").addEventListener("click", () => dismissWelcome());
  }
}

async function onWelcomeTogether() {
  try {
    await db.signIn();
    renderWelcomeScreen(2);
  } catch (err) { console.error(err); toast(err.message || "Sign-in failed"); }
}

async function onWelcomeCreate() {
  try {
    const code = await db.createSpace(false); // welcome only fires with zero dates — nothing to upload
    await reload();
    renderWelcomeScreen(3, code);
  } catch (err) { console.error(err); toast(err.message || "Couldn't create space"); }
}

async function onWelcomeJoin() {
  const code = prompt("Enter the code from your partner:");
  if (!code) return;
  try {
    await db.joinSpace(code);
    await reload();
    await db.setSetting("welcomeDismissed", true);
    hideWelcome();
    show("home");
    toast("Joined — syncing with your partner ♥");
  } catch (err) { console.error(err); toast(err.message || "Couldn't join — check the code"); }
}

async function copyWelcomeCode(code) {
  try { await navigator.clipboard.writeText(code); toast("Copied"); }
  catch { toast("Couldn't copy — long-press the code above instead"); }
}

async function shareWelcomeCode(code) {
  const text = `Join me on Us 💞 — code: ${code}`;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch { /* user cancelled the share sheet */ }
  } else {
    try { await navigator.clipboard.writeText(code); toast("Copied"); }
    catch { toast("Couldn't copy — long-press the code above instead"); }
  }
}

// Context handed to the split-out tab modules. They render from the date list and
// their own view state; anything that belongs to the app shell (navigation, the
// log sheet, the shared `dates` array) comes back through here.
const insightsCtx = { done, goSuggest: () => show("suggest") };
const suggestCtx = {
  done,
  all: () => dates,
  reload,
  logSeed(seed) {
    draft = blankEntry();
    Object.assign(draft, { title: seed.title, category: seed.category, cost: seed.cost, effort: seed.effort || 3 });
    editingId = null;
    openLogSheet();
    toast("Pre-filled — save it after your date");
  },
};

function show(tab) {
  if (!["home", "history", "insights", "suggest"].includes(tab)) tab = "home"; // migrates stale "log"
  currentTab = tab;
  document.querySelectorAll(".tab").forEach(b =>
    b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
  if (tab === "home") renderHome();
  else if (tab === "history") renderHistory();
  else if (tab === "insights") renderInsights(insightsCtx);
  else renderSuggest(suggestCtx);
  renderDnBanner();
  viewEl().scrollTo?.(0, 0);
  window.scrollTo(0, 0);
}

// ---------- Date Night banner (pinned above the view content, every tab) ----------
function updateFab() {
  const fab = document.getElementById("fab");
  fab.textContent = activeDate ? "📷" : "＋";
  fab.setAttribute("aria-label", activeDate ? "Take a photo" : "Log a date");
}

function startDnTimer() {
  clearInterval(dnTimer);
  dnTimer = setInterval(renderDnBanner, 60000);
}

function renderDnBanner() {
  const host = document.getElementById("dnBanner");
  if (!host) return;
  if (!activeDate) { host.innerHTML = ""; return; }
  const elapsedMin = Math.min(DN_MAX_MIN, Math.round((Date.now() - activeDate.startedAt) / 60000));
  const n = activeDate.photoIds.length;
  host.innerHTML = `
    <section class="dn-banner" id="dn-banner-body">
      <span class="moon">🌙</span>
      <div class="txt"><b>Date night</b><div class="sub">${elapsedMin < 1 ? "just started" : fmtDuration(elapsedMin)} · ${n} photo${n === 1 ? "" : "s"}</div></div>
      <button class="end" id="dn-end">End</button>
    </section>`;
  host.querySelector("#dn-banner-body").addEventListener("click", () => document.getElementById("dnCameraInput").click());
  host.querySelector("#dn-end").addEventListener("click", ev => { ev.stopPropagation(); onDnEnd(); });
}

async function onDnStart() {
  activeDate = { startedAt: Date.now(), photoIds: [] };
  await db.setSetting("activeDate", activeDate);
  startDnTimer();
  updateFab();
  show(currentTab);
}

async function onDnPhotoPick(e) {
  const files = [...e.target.files];
  e.target.value = "";
  if (!activeDate) return;
  for (const file of files) {
    try {
      const blob = await downscale(file, 1280, 0.82);
      activeDate.photoIds.push(await db.putPhoto(blob));
    } catch (err) { console.error(err); toast("Couldn't add photo"); }
  }
  await db.setSetting("activeDate", activeDate);
  renderDnBanner();
  toast("Photo added 📸");
}

async function onDnEnd() {
  const elapsedMin = Math.min(DN_MAX_MIN, Math.round((Date.now() - activeDate.startedAt) / 60000));
  const startedAt = activeDate.startedAt;
  const photoIds = activeDate.photoIds;
  await db.setSetting("activeDate", null);
  activeDate = null;
  clearInterval(dnTimer); dnTimer = null;
  updateFab();
  renderDnBanner();

  draft = blankEntry();
  draft.date = todayISO(startedAt);
  dateTouched = true;              // the session knows when it happened
  draft.photos = photoIds;
  draft.durationMin = elapsedMin;
  editingId = null;
  openLogSheet();
}

// ---------- HOME tab ----------
function renderHome() {
  const v = viewEl();
  const top = suggest(done(), { explore: 0.5 })[0];
  const memories = !memoryDismissed ? A.onThisDay(done()) : [];
  const singleAgo = memories.length === 1
    ? new Date().getFullYear() - new Date(entryTimeMs(memories[0])).getFullYear() : null;
  const memoryCard = memories.length ? `
    <section class="card memory-card">
      <div class="memory-header">
        <span class="memory-title">On this day${singleAgo !== null ? ` · ${singleAgo} year${singleAgo !== 1 ? "s" : ""} ago` : ""} ✨</span>
        <button class="memory-dismiss" id="memory-dismiss">✕</button>
      </div>
      ${memories.map(e => {
        const yearsAgo = new Date().getFullYear() - new Date(entryTimeMs(e)).getFullYear();
        return `<div class="memory-item">
          ${singleAgo === null ? `<div class="memory-ago">${yearsAgo} year${yearsAgo !== 1 ? "s" : ""} ago</div>` : ""}
          <div class="memory-line">${catEmoji(e.category)} <b>${escHtml(e.title)}</b> <span class="sub">${fmtDate(e.date)} · ${heartsHtml(e.enjoyment)}</span></div>
          ${e.capsule ? `<div class="capsule-memory"><span class="from">💌 From you:</span><span class="msg">${escHtml(e.capsule)}</span></div>` : ""}
        </div>`;
        // ponytail: label is always "From you" — date docs carry no author uid; add author names when sync stamps one
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
    ${!activeDate ? `
    <section class="card dn-invite">
      <div class="moon">🌙</div>
      <div class="txt"><h3>Date night?</h3><div class="sub">Start a timer, snap photos as you go — log it when you're done.</div></div>
      <button class="mini-btn" id="dn-start">Start</button>
    </section>` : ""}
    ${memoryCard}
    ${showBackupBanner ? `
    <div class="backup-banner" id="backup-banner">
      <span class="em">☁️</span>
      <span class="msg">It's been a while — <b>back up your dates</b></span>
      <span class="chev">›</span>
      <button class="x" id="backup-dismiss" title="Dismiss">✕</button>
    </div>` : ""}
    <h3 class="section-title">Recent memories</h3>
    <div id="date-list"></div>
  `;
  bind("home-plan", "click", () => planIt(top?.title));
  bind("dn-start", "click", onDnStart);
  bind("memory-dismiss", "click", async () => { memoryDismissed = true; await db.setSetting("memoryDismissed", todayISO()); renderHome(); });
  bind("backup-banner", "click", onExport);
  bind("backup-dismiss", "click", async e => {
    e.stopPropagation();
    await db.setSetting("backupNudgeSnooze", Date.now() + 7 * 86400e3);
    showBackupBanner = false;
    renderHome();
  });
  renderList();
}

function planIt(title) {
  show("suggest");
  if (!title) return;
  const card = viewEl().querySelector(`[data-norm-title="${CSS.escape(normTitle(title))}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  card.classList.add("flash");
  setTimeout(() => card.classList.remove("flash"), 1500);
}

// ---------- log sheet (opened from the ＋ button) ----------
function openLogSheet() {
  document.getElementById("logSheet").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  renderLog();
}

function isDraftDirty() {
  return !!(draft.title.trim() || draft.notes.trim() || (draft.vibe || "").trim() ||
    (draft.capsule || "").trim() || (draft.url || "").trim() || draft.photos.length);
}

function isUnchangedEdit() {
  return !!(editingId && draftSnapshot && JSON.stringify(draft) === draftSnapshot);
}

async function closeLogSheet() {
  if (draft.durationMin != null && !editingId) {
    if (!confirm("Discard tonight's session? Any photos you took will be deleted.")) return;
    const referenced = new Set(dates.flatMap(e => e.photos || []));
    for (const id of draft.photos) if (!referenced.has(id)) await db.deletePhoto(id);
  } else if (isDraftDirty() && !isUnchangedEdit()) {
    if (!confirm("Discard this entry?")) return;
  }
  document.getElementById("logSheet").classList.add("hidden");
  document.body.style.overflow = "";
  resetDraft();
}

// ---------- log form (renders inside the log sheet) ----------
function renderLog() {
  const v = formEl();
  const isEdit = !!editingId;
  document.querySelector(".logsheet-title").textContent = isEdit ? "Edit date" : "New page!";
  const selTier = draft.costTier ?? tierForCost(draft.cost);
  const vibeSugs = pastVibes().filter(w => w !== (draft.vibe || "").trim().toLowerCase()).slice(0, 4);
  v.innerHTML = `
    <section class="card logform">
      ${draft.durationMin != null ? `<span class="dn-fromtonight">✨ From tonight — ${fmtDuration(draft.durationMin)} · ${draft.photos.length} photo${draft.photos.length === 1 ? "" : "s"}</span>` : ""}
      <div class="polaroid">
        <button class="pshot empty" id="f-add-photo" type="button"></button>
        <div class="photo-menu hidden" id="f-photo-menu">
          <button class="photo-menu-item" data-src="camera">📷 Camera</button>
          <button class="photo-menu-item" data-src="gallery">🖼️ Gallery</button>
          <button class="photo-menu-item" data-src="google">📸 Google Photos</button>
        </div>
        <input id="f-title" class="pol-caption" type="text" placeholder="write a caption…" value="${escAttr(draft.title)}"/>
      </div>
      <div class="photo-strip" id="f-photos"></div>
      <input id="f-photo-camera" type="file" accept="image/*" capture="environment" hidden/>
      <input id="f-photo-gallery" type="file" accept="image/*" hidden multiple/>

      <div class="form-grid">
        <div class="fields">
          <div class="qrow">
            <input id="f-date" type="date" value="${draft.date}"/>
            <span class="cat-current" id="f-cat-current">${draft.category ? catShort(draft.category) : ""}</span>
          </div>
          <span class="from-photo hidden" id="f-from-photo">📷 Date set from photo · <button type="button">undo</button></span>
          <div class="cat-strip-wrap">
            <div class="cat-strip" id="f-category">
              ${CATEGORIES.map(c => `<button type="button" class="cat-chip ${draft.category === c.key ? "on" : ""}" data-cat="${c.key}"><span class="em">${c.emoji}</span>${c.label}</button>`).join("")}
            </div>
            <div class="cat-fade"></div>
          </div>
          <div class="seg4" id="f-cost">
            ${COST_TIERS.map(t => `<button class="${selTier === t.key ? "on" : ""}" data-tier="${t.key}">${t.label}</button>`).join("")}
          </div>
          <div class="fields-bottom">
            <input id="f-vibe" type="text" class="vibe-input" placeholder="magical? chaotic? cozy?" value="${escAttr(draft.vibe || "")}"/>
            <div class="vibe-sugs" id="f-vibe-sugs">
              ${vibeSugs.map(w => `<button type="button" class="vibe-sug" data-vibe="${escAttr(w)}">${escHtml(w)}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="meter-col">
          <span class="end">😍</span>
          <span class="end-lbl">again<br/>ASAP</span>
          <div class="vtrack" id="f-meter">
            <div class="fill" id="f-meter-fill"></div>
            <div class="thumb" id="f-meter-thumb"></div>
          </div>
          <span class="end-lbl">never<br/>again</span>
          <span class="end">😵</span>
        </div>
      </div>
      <div class="verdict-word" id="f-verdict"></div>

      <div class="link-row">
        <button class="addnote-link" id="f-note-toggle" type="button">+ add a note</button>
        <button class="capsule-toggle" id="f-capsule-toggle" type="button">💌 note to next year</button>
      </div>
      <label class="field ${draft.notes ? "" : "hidden"}" id="f-notes-wrap"><span>Notes / memories</span>
        <textarea id="f-notes" placeholder="What made it good (or not)?">${escHtml(draft.notes)}</textarea></label>

      <div class="capsule-wrap ${draft.capsule ? "" : "hidden"}" id="f-capsule-wrap">
        <div class="capsule-field">
          <div class="capsule-head">💌 To future us <span class="when">opens ${fmtDate(capsuleOpenDate(draft.date))}</span></div>
          <textarea id="f-capsule" placeholder="If you're reading this…">${escHtml(draft.capsule)}</textarea>
        </div>
      </div>

      <button class="addnote-link" id="f-link-toggle" type="button">+ add a link</button>
      <label class="field ${draft.url ? "" : "hidden"}" id="f-link-wrap"><span>Link <span class="muted" style="font-weight:400">(optional — booking page, Pinterest…)</span></span>
        <input id="f-url" type="url" inputmode="url" placeholder="https://…" value="${escAttr(draft.url || "")}"/></label>

      <div class="btn-row">
        ${isEdit ? `<button class="btn ghost" id="f-cancel">Cancel</button>` : ""}
        <button class="btn" id="f-save">${isEdit ? "Save changes" : "Save date ♥"}</button>
      </div>
    </section>
  `;
  wireForm();
  paintMeter();
  renderPhotoStrip();
}

// Date a capsule note opens: entry date + 1 year (ISO string, for fmtDate).
function capsuleOpenDate(dateStr) {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// Free-text vibe words actually present in the diary, most-used first (no fallback).
function rawVibeWords() {
  const freq = new Map();
  for (const d of done()) {
    const w = (d.vibe || "").trim().toLowerCase();
    if (w) freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w);
}

// Most-used past vibe words for the suggestion chips (defaults for a fresh diary).
function pastVibes() {
  const mine = rawVibeWords();
  return mine.length ? mine : ["cozy", "spontaneous", "giggly", "romantic"];
}

// History "Vibe" filter chips: legacy MOOD_OPTIONS actually present in data, plus
// free-text vibe words from v2 entries — so new-entry vibes are filterable too.
function historyVibeChips() {
  const present = new Set();
  done().forEach(e => { if (Array.isArray(e.mood)) e.mood.forEach(k => present.add(k)); });
  const moodChips = MOOD_OPTIONS.filter(m => present.has(m.key));
  const moodLabels = new Set(moodChips.map(m => m.label.toLowerCase()));
  const vibeChips = rawVibeWords()
    .filter(w => !moodLabels.has(w))
    .map(w => ({ key: w, label: w, emoji: "💬" }));
  return [...moodChips, ...vibeChips];
}

// Does entry e match vibe-filter chip key k? Legacy mood array, or v2 free-text
// vibe compared case-insensitively against the chip's label.
function histVibeMatches(e, k) {
  if (Array.isArray(e.mood) && e.mood.includes(k)) return true;
  const label = (MOOD_OPTIONS.find(o => o.key === k)?.label || k).toLowerCase();
  return (e.vibe || "").trim().toLowerCase() === label;
}

// Paint the again-o-meter from draft.enjoyment (1–5).
function paintMeter() {
  const v = formEl();
  const m = METER[draft.enjoyment - 1] || METER[3];
  const pct = ((draft.enjoyment - 1) / 4) * 100;
  v.querySelector("#f-meter-fill").style.height = pct + "%";
  const thumb = v.querySelector("#f-meter-thumb");
  thumb.style.top = (100 - pct) + "%";
  thumb.textContent = m.face;
  v.querySelector("#f-verdict").textContent = `“${m.word}”`;
}

function wireForm() {
  const v = formEl();
  // text-ish inputs update the draft without re-rendering (keeps focus/caret)
  bind("f-title", "input", e => draft.title = e.target.value);
  bind("f-date", "change", e => {
    draft.date = e.target.value;
    dateTouched = true;
    const when = v.querySelector("#f-capsule-wrap .when");
    if (when) when.textContent = `opens ${fmtDate(capsuleOpenDate(draft.date))}`;
  });
  bind("f-vibe", "input", e => draft.vibe = e.target.value);
  bind("f-notes", "input", e => draft.notes = e.target.value);
  bind("f-url", "input", e => draft.url = e.target.value);
  bind("f-capsule", "input", e => draft.capsule = e.target.value);

  // category dots
  v.querySelector("#f-category").addEventListener("click", e => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    draft.category = b.dataset.cat;
    setOn(v.querySelectorAll("#f-category .cat-chip"), b);
    v.querySelector("#f-cat-current").textContent = catShort(b.dataset.cat);
  });

  // cost tiers — the tier is canonical; a representative ₪ lands in `cost` so
  // spend analytics keep working (approximate by design)
  v.querySelector("#f-cost").addEventListener("click", e => {
    const b = e.target.closest("[data-tier]"); if (!b) return;
    draft.costTier = b.dataset.tier;
    draft.cost = COST_TIERS.find(t => t.key === b.dataset.tier).ils;
    setOn(v.querySelectorAll("#f-cost button"), b);
  });

  // vibe suggestion chips fill the input
  v.querySelector("#f-vibe-sugs").addEventListener("click", e => {
    const b = e.target.closest("[data-vibe]"); if (!b) return;
    draft.vibe = b.dataset.vibe;
    v.querySelector("#f-vibe").value = draft.vibe;
  });

  // again-o-meter: one drag/tap sets enjoyment AND wouldRepeat
  const track = v.querySelector("#f-meter");
  const setFromY = ev => {
    const r = track.getBoundingClientRect();
    const frac = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    draft.enjoyment = Math.round(frac * 4) + 1;
    draft.wouldRepeat = repeatForEnjoyment(draft.enjoyment);
    paintMeter();
  };
  track.addEventListener("pointerdown", ev => { ev.preventDefault(); track.setPointerCapture(ev.pointerId); setFromY(ev); });
  track.addEventListener("pointermove", ev => { if (ev.buttons) setFromY(ev); });

  bind("f-note-toggle", "click", () => {
    v.querySelector("#f-notes-wrap").classList.toggle("hidden");
    v.querySelector("#f-notes").focus();
  });
  bind("f-link-toggle", "click", () => {
    v.querySelector("#f-link-wrap").classList.toggle("hidden");
    v.querySelector("#f-url").focus();
  });
  bind("f-capsule-toggle", "click", () => {
    v.querySelector("#f-capsule-wrap").classList.remove("hidden");
    v.querySelector("#f-capsule").focus();
  });

  // photo source menu, opened by tapping the polaroid shot
  const addBtn = v.querySelector("#f-add-photo");
  const menu = v.querySelector("#f-photo-menu");
  addBtn.addEventListener("click", () => menu.classList.toggle("hidden"));
  menu.addEventListener("click", e => {
    const item = e.target.closest("[data-src]"); if (!item) return;
    menu.classList.add("hidden");
    if (item.dataset.src === "camera") v.querySelector("#f-photo-camera").click();
    else if (item.dataset.src === "google") pickGooglePhotos();
    else v.querySelector("#f-photo-gallery").click();
  });
  document.addEventListener("click", e => {
    if (!addBtn.contains(e.target) && !menu.contains(e.target)) menu.classList.add("hidden");
  });
  v.querySelector("#f-photo-camera").addEventListener("change", onPhotoPick);
  v.querySelector("#f-photo-gallery").addEventListener("change", onPhotoPick);

  bind("f-save", "click", saveDraft);
  const cancel = v.querySelector("#f-cancel");
  if (cancel) cancel.addEventListener("click", () => { gpModule?.cancelPick(); closeLogSheet(); });
}

// Fills the polaroid shot (first photo + "+N" badge) and the manage strip below it.
async function renderPhotoStrip() {
  const v = formEl();
  const shot = v.querySelector("#f-add-photo");
  const strip = v.querySelector("#f-photos");
  if (!shot || !strip) return;
  const thumbs = (await Promise.all(draft.photos.map(async id => ({ id, url: await photoURL(id) }))))
    .filter(t => t.url);

  shot.classList.toggle("empty", !thumbs.length);
  shot.innerHTML = thumbs.length
    ? `<img src="${thumbs[0].url}" alt=""/>${thumbs.length > 1 ? `<span class="count-badge">+${thumbs.length - 1}</span>` : ""}`
    : `<span class="pshot-empty"><span class="big">📸</span><span class="hint">Tap to add photos</span><span class="srcs">Camera · Gallery · Google Photos</span></span>`;

  strip.innerHTML = thumbs.map(t =>
    `<div class="photo-thumb"><img src="${t.url}" alt=""/><button data-rm="${t.id}">✕</button></div>`).join("");
  strip.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
    draft.photos = draft.photos.filter(p => p !== b.dataset.rm);
    renderPhotoStrip();
  }));
}

async function addPhotoBlob(file) {
  const blob = await downscale(file, 1280, 0.82);
  const id = await db.putPhoto(blob);
  draft.photos.push(id);
}

async function onPhotoPick(e) {
  const files = [...e.target.files];
  e.target.value = "";
  for (const file of files) {
    try { await addPhotoBlob(file); await dateFromPhoto(file); }
    catch (err) { console.error(err); toast("Couldn't add photo"); }
    await renderPhotoStrip(); // per photo, so the first thumb shows while the rest encode
  }
}

// Set "When" from the photo's EXIF capture date, but only while the date is still
// the untouched default — never clobber a date the user picked.
async function dateFromPhoto(file) {
  if (dateTouched) return;
  const { readExif } = await import("./exif.js");
  const { date } = await readExif(file);
  if (!date || date === draft.date) return;
  const was = draft.date;
  draft.date = date;
  dateTouched = true;               // one shot: undo or a later photo won't re-fire
  const v = formEl();
  const input = v.querySelector("#f-date");
  input.value = date;
  input.classList.add("lit");
  setTimeout(() => input.classList.remove("lit"), 600);
  const chip = v.querySelector("#f-from-photo");
  chip.classList.remove("hidden");
  chip.querySelector("button").onclick = () => {
    draft.date = was;
    input.value = was;
    chip.classList.add("hidden");
  };
}

// Google Photos Picker — cloud photos the file input can't see. Lazy-loaded.
let gpModule = null;
async function pickGooglePhotos() {
  try {
    gpModule = gpModule || await import("./gphotos.js");
    if (!gpModule.isConfigured()) { toast("Google Photos isn't set up yet"); return; }
    const n = await gpModule.pickFromGooglePhotos(async blob => {
      await addPhotoBlob(blob);
      await renderPhotoStrip();
    }, toast);
    toast(n ? `Added ${n} photo${n > 1 ? "s" : ""} from Google Photos` : "No photos picked");
  } catch (err) { console.error(err); toast(err.message || "Google Photos failed"); }
}

async function saveDraft() {
  if (!draft.title.trim()) {
    toast("Write a caption first");
    const cap = formEl().querySelector("#f-title");
    cap?.scrollIntoView({ block: "center" });
    cap?.focus();
    return;
  }
  draft.title = draft.title.trim();
  draft.vibe = (draft.vibe || "").trim();
  draft.url = (draft.url || "").trim();
  draft.capsule = (draft.capsule || "").trim();
  if (draft.url && !/^https?:\/\//i.test(draft.url)) draft.url = "https://" + draft.url;
  if (draft.url) {
    // Chrome's URL parser percent-encodes spaces instead of throwing, so a bare
    // try/new URL lets "https://not a url" through — also require a dotted host.
    let ok = !/\s/.test(draft.url);
    try { ok = ok && new URL(draft.url).hostname.includes("."); } catch { ok = false; }
    if (!ok) { toast("That link doesn't look right"); return; }
  }
  const isNew = !editingId;
  if (isNew) draft.createdAt = Date.now();
  // attribute the form's enjoyment score to me as a per-person rating (see resolveRatings)
  draft.ratings = { ...(draft.ratings || {}), [myKey()]: draft.enjoyment };
  await db.putDate(draft);
  if (isNew) push.sendNewDatePush(draft.title); // fire-and-forget; no-op unless syncing
  maybeRequestPersist(); // first date saved → ask browser to protect our storage
  await reload();
  toast(editingId ? "Updated ♥" : "Date saved ♥");
  resetDraft();
  closeLogSheet();
  show(currentTab);
}

function resetDraft() { draft = blankEntry(); editingId = null; draftSnapshot = null; dateTouched = false; }

async function editEntry(id) {
  const e = await db.getDate(id);
  if (!e) return;
  draft = structuredClone(e);
  editingId = id;
  draftSnapshot = JSON.stringify(draft);
  dateTouched = true;
  openLogSheet();
}

async function removeEntry(id) {
  if (!confirm("Delete this date?")) return;
  await db.deleteDate(id);
  await reload();
  toast("Deleted");
  show(currentTab);
}

// Renders the 5 most recent dates into #date-list (used by the Home tab).
async function renderList() {
  const host = viewEl().querySelector("#date-list");
  if (!host) return;
  const logged = done();
  if (!logged.length) {
    host.innerHTML = `<div class="empty2"><div class="big">💌</div><h3>Your story starts here</h3>
      <span class="alt">tap <b class="fab-hint">＋</b> to log your first date ↘</span>
      <span class="alt">just looking? <b>Add sample dates</b> from the ⋯ menu</span></div>`;
    return;
  }
  const sorted = [...logged].sort((a, b) => entryTimeMs(b) - entryTimeMs(a)).slice(0, 5);
  host.innerHTML = sorted.map(e => {
    // one hearts sticker: my rating, else partner's, else the legacy enjoyment score
    const { lines } = resolveRatings(e);
    const r = lines.find(l => l.mine) || lines.find(l => !l.mine && l.name) || lines.find(l => l.key === null);
    const cost = tierPill(e);
    return `
    <div class="card home-card" data-open="${escAttr(e.id)}">
      <div class="home-photos" data-photos="${escAttr((e.photos || []).join(","))}" data-cat="${escAttr(e.category)}"></div>
      <span class="stk tape">${fmtDate(e.date)}</span>
      <span class="stk cat">${catEmoji(e.category)}</span>
      ${e.vibe ? `<span class="stk vibe">${escHtml(e.vibe)}</span>` : ""}
      ${r ? `<span class="stk hearts">${"♥".repeat(r.value)}${"♡".repeat(5 - r.value)}</span>` : ""}
      <span class="stk caption">${escHtml(e.title)}<span class="sub">${catLabel(e.category)}${cost ? " · " + cost : ""}</span></span>
    </div>`;
  }).join("");
  host.querySelectorAll("[data-open]").forEach(card =>
    card.addEventListener("click", () => openEntry(card.dataset.open)));
  host.querySelectorAll("[data-photos]").forEach(el => fillMosaic(el, el.dataset.photos.split(",").filter(Boolean), el.dataset.cat, false));
}

// Fills a mosaic container: 1 big + up to 2 small (with "+N"), single photo = banner,
// two = 50/50, zero = emoji banner. `detail` uses the even 2-col grid look (Album).
async function fillMosaic(el, ids, cat, detail) {
  if (!ids.length) {
    el.className = detail ? "detail-mosaic empty" : "home-banner";
    el.innerHTML = catEmoji(cat);
    return;
  }
  const urls = (await Promise.all(ids.map(id => photoURL(id)))).filter(Boolean);
  if (!urls.length) { el.className = detail ? "detail-mosaic empty" : "home-banner"; el.innerHTML = catEmoji(cat); return; }

  if (detail) {
    // even 2-col grid, max 4 tiles, "+N" on the 4th
    const shown = urls.slice(0, 4);
    el.className = "mosaic two detail-mosaic";
    el.innerHTML = shown.map((u, i) => {
      const more = i === 3 && urls.length > 4 ? `<span class="more-badge">+${urls.length - 4}</span>` : "";
      return `<div class="ph"><img src="${u}" alt=""/>${more}</div>`;
    }).join("");
    return;
  }

  // Home: 1 photo = banner, 2 = 50/50, 3+ = 1 big + 2 small with "+N"
  if (urls.length === 1) {
    el.className = "mosaic one";
    el.innerHTML = `<div class="ph"><img src="${urls[0]}" alt=""/></div>`;
  } else if (urls.length === 2) {
    el.className = "mosaic two";
    el.innerHTML = urls.map(u => `<div class="ph"><img src="${u}" alt=""/></div>`).join("");
  } else {
    el.className = "mosaic";
    const shown = urls.slice(0, 3);
    el.innerHTML = shown.map((u, i) => {
      const more = i === 2 && urls.length > 3 ? `<span class="more-badge">+${urls.length - 3}</span>` : "";
      return `<div class="ph"><img src="${u}" alt=""/>${more}</div>`;
    }).join("");
  }
}

// ---------- HISTORY tab ----------
function renderHistory() {
  const v = viewEl();
  if (!dates.length) {
    v.innerHTML = emptyState2("📸", "No memories yet", { alts: [`tap <b class="fab-hint">＋</b> to log a date — photos welcome ↘`] });
    return;
  }

  v.innerHTML = `
    <section class="card tight">
      <div class="hist-row1">
        <input class="h-search" id="h-search" type="text" placeholder="Search dates…" value="${escAttr(hist.query)}"/>
        <select id="h-sort" title="Sort by">
          <option value="date-desc" ${hist.sort === "date-desc" ? "selected" : ""}>Newest</option>
          <option value="date-asc" ${hist.sort === "date-asc" ? "selected" : ""}>Oldest</option>
          <option value="enjoy-desc" ${hist.sort === "enjoy-desc" ? "selected" : ""}>Best rated</option>
          <option value="enjoy-asc" ${hist.sort === "enjoy-asc" ? "selected" : ""}>Worst rated</option>
          <option value="cost-desc" ${hist.sort === "cost-desc" ? "selected" : ""}>Priciest</option>
          <option value="cost-asc" ${hist.sort === "cost-asc" ? "selected" : ""}>Cheapest</option>
          <option value="title-asc" ${hist.sort === "title-asc" ? "selected" : ""}>Title A–Z</option>
        </select>
      </div>
      <div class="hist-row2">
        <div class="hist-view-toggle">
          <button class="seg ${hist.view === "list" ? "on" : ""}" data-view="list" title="List">☰</button>
          <button class="seg ${hist.view === "gallery" ? "on" : ""}" data-view="gallery" title="Gallery">⊞</button>
          <button class="seg ${hist.view === "wishlist" ? "on" : ""}" data-view="wishlist" title="Wishlist">☆</button>
        </div>
        <button class="seg slideshow-btn" id="h-slideshow" title="Play a slideshow of your highlights">▶</button>
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
              ${hist.moods.length ? `<span class="fg-badge">${hist.moods.length === 1 ? (historyVibeChips().find(m => m.key === hist.moods[0])?.emoji + " " + historyVibeChips().find(m => m.key === hist.moods[0])?.label) : hist.moods.length + " selected"}</span>` : ""}
              <span class="fg-arrow">▼</span>
            </span>
          </summary>
          <div class="chips" id="h-mood">
            ${historyVibeChips().map(m => `<button class="chip ${hist.moods.includes(m.key) ? "on" : ""}" data-hmood="${escAttr(m.key)}">${m.emoji} ${escHtml(m.label)}</button>`).join("")}
          </div>
        </details>
        <span class="hist-count" id="h-count">${dates.length} date${dates.length !== 1 ? "s" : ""}</span>
      </div>
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
      const m0 = historyVibeChips().find(m => m.key === hist.moods[0]);
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
  let list = done();  // wishlist ideas render only in the dedicated wishlist view
  if (hist.category) list = list.filter(e => e.category === hist.category);
  if (hist.moods.length) list = list.filter(e => hist.moods.some(k => histVibeMatches(e, k)));
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

  if (hist.view === "wishlist") {
    renderWishlist(host, countEl);
    return;
  }

  if (hist.view === "gallery") {
    const photoEntries = list.flatMap(e => (e.photos || []).map(pid => ({ pid, e })));
    if (countEl) countEl.textContent = `${photoEntries.length} photo${photoEntries.length !== 1 ? "s" : ""}`;
    if (!photoEntries.length) {
      host.innerHTML = `<div class="empty"><div class="big">📷</div>No photos for this filter.</div>`;
      return;
    }
    host.innerHTML = `<div class="hist-gallery">${photoEntries.map(({ pid, e }, i) =>
      `<div class="gallery-tile" data-entry="${escAttr(e.id)}" data-pid="${escAttr(pid)}">
        <img src="" data-load="${escAttr(pid)}" alt="${escAttr(e.title)}"/>
        ${i === 0 || photoEntries[i - 1].e.id !== e.id ? `<div class="gallery-label">${escHtml(e.title)}</div>` : ""}
      </div>`).join("")}</div>`;
    host.querySelectorAll("[data-load]").forEach(async img => {
      const url = await photoURL(img.dataset.load);
      if (url) img.src = url;
    });
    const tiles = [...host.querySelectorAll(".gallery-tile")];
    tiles.forEach((tile, i) => tile.addEventListener("click", async () => {
      // Rebuild items from photo ids (not DOM img.src, which may still be empty
      // mid-load) so tile index always lines up with the right photo.
      const urls = await Promise.all(photoEntries.map(pe => photoURL(pe.pid)));
      const items = photoEntries.map((pe, j) => ({ url: urls[j], caption: pe.e.title }));
      openLightbox(items, i);
    }));
    return;
  }

  if (countEl) countEl.textContent = `${list.length} date${list.length !== 1 ? "s" : ""}`;
  if (!list.length) {
    host.innerHTML = `<div class="empty"><div class="big">🔍</div>No dates match this filter.</div>`;
    return;
  }
  host.innerHTML = list.map(e => {
    const isOpen = hist.expanded === e.id;
    if (isOpen) return `<div class="card tight hist-entry open">${histDetail(e)}</div>`;
    const pid = e.photos?.[0] || "";
    const extra = (e.photos?.length || 0) - 1;
    return `
    <div class="card tight hist-entry">
      <div class="hist-ledge" data-toggle="${escAttr(e.id)}">
        <div class="shot" data-shot="${escAttr(pid)}">
          ${pid ? "" : `<div class="grad-tile">${catEmoji(e.category)}</div>`}
          ${extra > 0 ? `<span class="count">+${extra}</span>` : ""}
        </div>
        <div class="body">
          <span class="tape-sm">${fmtDateShort(e.date)}</span>
          <h4>${escHtml(e.title)}</h4>
          <div class="sub">${catLabel(e.category)}${tierPill(e) ? " · " + tierPill(e) : ""} ${heartsHtml(e.enjoyment)}</div>
        </div>
      </div>
    </div>`;
  }).join("");

  // wire expand (collapse happens by tapping the expanded hero's title block)
  host.querySelectorAll("[data-toggle]").forEach(row => row.addEventListener("click", () => {
    hist.expanded = row.dataset.toggle;
    renderHistoryList();
  }));
  wireHistDetail(host);
  // load collapsed-row photo slabs
  host.querySelectorAll(".hist-ledge .shot[data-shot]").forEach(async el => {
    const id = el.dataset.shot;
    if (!id) return;
    const url = await photoURL(id);
    if (url) el.insertAdjacentHTML("afterbegin", `<img class="cover" src="${url}" alt=""/>`);
  });
}

// Tap anywhere in the background to collapse the expanded Album entry. The
// expanded card fills the list, so the visible background (page margins, the
// area below the list) sits OUTSIDE #hist-list — hence a document-level
// listener. Taps on any control or overlay are left alone.
document.addEventListener("click", ev => {
  if (!hist.expanded || !document.querySelector(".hist-entry.open")) return;
  // a detached target means another handler already re-rendered on this click
  // (row expand, home-card jump) — that's never a background tap
  if (!ev.target.isConnected) return;
  if (ev.target.closest(".lightbox, .menu-pop, .logsheet, .sheet, button, summary, a, input, textarea, select, label")) return;
  const entry = ev.target.closest(".hist-entry");
  if (entry && !entry.classList.contains("open")) return; // collapsed row = expand, not background
  // inside the open card, only interactive zones eat the tap (hero opens the
  // lightbox, stars rate; strip frames stopPropagation) — everything else,
  // including the film strip's empty tail, collapses like background
  if (entry && ev.target.closest("[data-hero], [data-rate]")) return;
  hist.expanded = null;
  renderHistoryList();
});

// short "Jul 18" (collapsed tape) / weekday "Fri, Jul 18" (expanded hero tape)
function fmtDateShort(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDateWeekday(iso) {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function histDetail(e) {
  const { lines, mineRated } = resolveRatings(e);
  const rateLines = lines.map(l => `
    <div class="rate-line">
      ${l.initial === "★" ? "" : `<span class="who ${l.mine ? "me" : "them"}">${escHtml(l.initial)}</span>`}
      ${l.name ? `<span class="name">${escHtml(l.name)}</span>` : ""}
      <span class="stars">${heartsHtml(l.value)}</span>
    </div>`).join("");
  const rateInput = mineRated ? "" : `
    <div class="rate-line">
      <span class="who me">${escHtml(myInitial())}</span><span class="name">You</span>
      <button class="btn rate-cta" style="width:auto;padding:5px 14px;font-size:13px" data-rate-cta="${escAttr(e.id)}">Rate ♥</button>
      <span class="big-stars hidden" data-rate="${escAttr(e.id)}">${[1, 2, 3, 4, 5].map(n => `<span class="rk off" data-k="${n}">♥</span>`).join("")}</span>
    </div>`;

  // only mood chips below the photo; wouldRepeat/effort/location moved elsewhere
  const chips = [];
  if (Array.isArray(e.mood)) e.mood.forEach((k, i) => {
    const m = MOOD_OPTIONS.find(o => o.key === k);
    if (m) chips.push(`<span class="chip ${i % 2 ? "butter" : "mint"}">${m.emoji} ${escHtml(m.label)}</span>`);
  });

  const comments = (e.comments || []).map(c => {
    const isMine = c.author === myKey();
    const ini = isMine ? myInitial() : (c.name?.[0]?.toUpperCase() || "P");
    return `<div class="cmt">
      <span class="who ${isMine ? "me" : "them"}">${escHtml(ini)}</span>
      <div><div class="bubble">${escHtml(c.text)}</div><div class="when">${relTime(c.ts)}</div></div>
    </div>`;
  }).join("");

  const photos = e.photos || [];
  const sub = [catLabel(e.category), costBadge(e), e.durationMin ? fmtDuration(e.durationMin) : "", e.location ? "📍 " + escHtml(e.location) : ""]
    .filter(Boolean).join(" · ");
  const hero = `
    <div class="hist-hero${photos.length ? "" : " empty"}" data-hero data-photos="${escAttr(photos.join(","))}" data-active="0" data-title="${escAttr(e.title)}">
      ${photos.length ? `<img class="hist-hero-img" data-hero-img src="" alt=""/>` : `<div class="grad-tile">${catEmoji(e.category)}</div>`}
      <span class="stk tape">${fmtDateWeekday(e.date)}</span>
      ${photos.length ? `<span class="stk cat">${catEmoji(e.category)}</span>` : ""}
      <button class="kebab hist-hero-kebab" data-kebab="${escAttr(e.id)}">⋯</button>
      <div class="hist-hero-title" data-collapse="${escAttr(e.id)}">
        <h3>${escHtml(e.title)}</h3>
        ${sub ? `<div class="sub">${sub}</div>` : ""}
      </div>
    </div>`;
  const strip = photos.length > 1 ? `
    <div class="hist-strip" data-strip>
      ${photos.map((pid, i) => `<div class="fr ${i === 0 ? "on" : ""}" data-frame="${i}"><img data-strip-img="${escAttr(pid)}" src="" alt=""/></div>`).join("")}
    </div>` : "";

  return `
  ${hero}
  ${strip}
  <div class="hist-xbody">
    ${chips.length ? `<div class="chip-flow">${chips.join("")}</div>` : ""}
    <div class="rate-meta">${rateLines}${rateInput}</div>
    ${e.notes ? `<p class="notes">${escHtml(e.notes)}</p>` : ""}
    <div class="comments">
      <h5>Notes to each other</h5>
      ${comments}
      <div class="cmt-input">
        <input placeholder="Add a note…" data-cmt="${escAttr(e.id)}"/><button data-cmt-send="${escAttr(e.id)}">➤</button>
      </div>
    </div>
  </div>`;
}

function wireHistDetail(host) {
  // kebab popover menu
  host.querySelectorAll("[data-kebab]").forEach(btn => btn.addEventListener("click", ev => {
    ev.stopPropagation();
    host.querySelectorAll(".menu-pop").forEach(m => m.remove());
    const id = btn.dataset.kebab;
    const pop = document.createElement("div");
    pop.className = "menu-pop";
    pop.innerHTML = `<div data-edit="${escAttr(id)}">✎ Edit</div><div class="danger" data-del="${escAttr(id)}">🗑 Delete</div>`;
    btn.closest(".hist-entry").appendChild(pop);
    pop.querySelector("[data-edit]").addEventListener("click", ev2 => { ev2.stopPropagation(); editEntry(id); });
    pop.querySelector("[data-del]").addEventListener("click", async ev2 => {
      ev2.stopPropagation();
      await removeEntry(id);
      hist.expanded = null;
      renderHistoryList();
    });
    const close = ev2 => { if (!pop.contains(ev2.target) && ev2.target !== btn) { pop.remove(); document.removeEventListener("click", close); } };
    setTimeout(() => document.addEventListener("click", close), 0);
  }));

  // "Rate ♥" pill swaps inline into the 5-heart input
  host.querySelectorAll("[data-rate-cta]").forEach(btn => btn.addEventListener("click", ev => {
    ev.stopPropagation();
    const stars = btn.nextElementSibling;
    btn.classList.add("hidden");
    stars.classList.remove("hidden");
  }));

  // tap-to-rate stars
  host.querySelectorAll("[data-rate]").forEach(group => group.addEventListener("click", async ev => {
    const star = ev.target.closest("[data-k]"); if (!star) return;
    ev.stopPropagation();
    await saveMyRating(group.dataset.rate, Number(star.dataset.k));
    renderHistoryList();
  }));

  // comments
  host.querySelectorAll("[data-cmt-send]").forEach(btn => btn.addEventListener("click", async ev => {
    ev.stopPropagation();
    const id = btn.dataset.cmtSend;
    const input = host.querySelector(`[data-cmt="${id}"]`);
    await addComment(id, input.value);
    await renderHistoryList();
    host.querySelector(`[data-cmt="${id}"]`)?.focus();
  }));
  host.querySelectorAll("[data-cmt]").forEach(input => input.addEventListener("keydown", async ev => {
    if (ev.key !== "Enter") return;
    ev.stopPropagation();
    const id = input.dataset.cmt;
    await addComment(id, input.value);
    await renderHistoryList();
    host.querySelector(`[data-cmt="${id}"]`)?.focus();
  }));

  // hero photo: load first photo, tap collapses via the title block, else opens the lightbox
  host.querySelectorAll("[data-hero]").forEach(hero => {
    const ids = hero.dataset.photos.split(",").filter(Boolean);
    const imgEl = hero.querySelector("[data-hero-img]");
    if (imgEl && ids.length) photoURL(ids[0]).then(url => { if (url) imgEl.src = url; });

    hero.querySelector("[data-collapse]").addEventListener("click", ev => {
      ev.stopPropagation();
      hist.expanded = null;
      renderHistoryList();
    });
    hero.addEventListener("click", async ev => {
      if (ev.target.closest("[data-collapse]") || ev.target.closest(".kebab") || !ids.length) return;
      const urls = (await Promise.all(ids.map(id => photoURL(id)))).filter(Boolean);
      openLightbox(urls.map(url => ({ url, caption: hero.dataset.title })), Number(hero.dataset.active) || 0);
    });
  });

  // film strip: load all thumbs, tapping one swaps the hero image (no re-render)
  host.querySelectorAll("[data-strip]").forEach(strip => {
    const hero = strip.previousElementSibling;
    const heroImg = hero.querySelector("[data-hero-img]");
    const frames = [...strip.querySelectorAll(".fr")];
    frames.forEach(fr => {
      const pid = fr.querySelector("img").dataset.stripImg;
      photoURL(pid).then(url => { if (url) fr.querySelector("img").src = url; });
    });
    strip.addEventListener("click", async ev => {
      const fr = ev.target.closest(".fr"); if (!fr) return;
      ev.stopPropagation();
      const i = Number(fr.dataset.frame);
      const ids = hero.dataset.photos.split(",").filter(Boolean);
      const url = await photoURL(ids[i]);
      if (url) heroImg.src = url;
      hero.dataset.active = i;
      frames.forEach(f => f.classList.toggle("on", f === fr));
    });
  });
}

// ---------- Wishlist (saved Suggest ideas) ----------
function prettyUrl(u) {
  return (u || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function wishlistIdeas() {
  let ideas = dates.filter(e => e.status === "idea");
  if (hist.category) ideas = ideas.filter(e => e.category === hist.category);
  if (hist.query) {
    const q = hist.query.toLowerCase();
    ideas = ideas.filter(e =>
      (e.title || "").toLowerCase().includes(q) ||
      (e.notes || "").toLowerCase().includes(q) ||
      (e.location || "").toLowerCase().includes(q)
    );
  }
  // vibe filter has no meaning for un-rated ideas — ignored rather than matching nothing
  const cmp = {
    "date-desc": (a, b) => entryTimeMs(b) - entryTimeMs(a),
    "date-asc":  (a, b) => entryTimeMs(a) - entryTimeMs(b),
    "cost-desc": (a, b) => (b.cost ?? -1) - (a.cost ?? -1) || entryTimeMs(b) - entryTimeMs(a),
    "cost-asc":  (a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || entryTimeMs(b) - entryTimeMs(a),
    "title-asc": (a, b) => a.title.localeCompare(b.title),
    // enjoy-* is meaningless for un-rated ideas — fall back to newest-first
  };
  ideas.sort(cmp[hist.sort] || cmp["date-desc"]);
  return ideas;
}

function renderWishlist(host, countEl) {
  const ideas = wishlistIdeas();
  if (countEl) countEl.textContent = `${ideas.length} idea${ideas.length !== 1 ? "s" : ""}`;
  if (!ideas.length) {
    host.innerHTML = emptyState2("☆", "Nothing saved yet", {
      sub: `Tap <b style="color:var(--accent)">♡ Wishlist</b> on any idea to keep it here.`,
      cta: "Find an idea →",
    });
    wireEmpty2Cta(host, () => show("suggest"));
    return;
  }
  host.innerHTML = `<h3 class="section-title">Want to try (${ideas.length})</h3>` + ideas.map(e => `
    <div class="card tight" style="position:relative">
      <button class="card-x" title="Remove" data-rmidea="${escAttr(e.id)}">✕</button>
      <div class="entry">
        <div class="thumb">${catEmoji(e.category)}</div>
        <div class="meta">
          <h4>${escHtml(e.title)}</h4>
          <div class="sub">${catLabel(e.category)}${tierPill(e) ? " · " + tierPill(e) : ""}${e.effort ? " · " + "⚡".repeat(e.effort) : ""}</div>
          ${e.url ? `<a class="url-link" href="${escAttr(safeUrl(e.url))}" target="_blank" rel="noopener">🔗 ${escHtml(prettyUrl(e.url))}</a>` : ""}
        </div>
        <button class="row-cta" data-didit="${escAttr(e.id)}">Log it →</button>
      </div>
    </div>`).join("");
  host.querySelectorAll("[data-didit]").forEach(b => b.addEventListener("click", () => logIdea(b.dataset.didit)));
  host.querySelectorAll("[data-rmidea]").forEach(b => b.addEventListener("click", () => removeIdea(b.dataset.rmidea)));
}

// Turn a wishlist idea into a real logged date: same doc (keeps id + url), status
// flips to done on save. editingId set so saveDraft updates in place — no duplicate.
async function logIdea(id) {
  const idea = await db.getDate(id);
  if (!idea) return;
  draft = structuredClone(idea);
  draft.status = "done";
  draft.date = todayISO();
  editingId = id;
  openLogSheet();
  toast("Fill in how it went, then save ♥");
}

async function removeIdea(id) {
  if (!confirm("Remove this idea from your wishlist?")) return;
  await db.deleteDate(id);
  await reload();
  toast("Removed");
  show("history");
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
  await db.setSetting("lastExportAt", Date.now());
  document.getElementById("sheet").classList.add("hidden");
  showBackupBanner = false;
  if (currentTab === "home") renderHome();
  toast("Backup downloaded");
}

async function onImport(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch (err) {
    console.error(err);
    document.getElementById("sheet").classList.add("hidden");
    toast("That file isn't JSON");
    return;
  }
  try {
    const n = await db.importAll(payload, { merge: true });
    await reload();
    document.getElementById("sheet").classList.add("hidden");
    toast(`Imported ${n} dates`);
    show(currentTab);
  } catch (err) {
    console.error(err);
    document.getElementById("sheet").classList.add("hidden");
    toast("That doesn't look like a Date Tracker backup");
  }
}

async function onSeed() {
  const { SAMPLE_DATES, attachSamplePhotos } = await import("./sample.js");
  for (const e of SAMPLE_DATES) await db.putDate(e());
  await attachSamplePhotos(db);
  await reload();
  document.getElementById("sheet").classList.add("hidden");
  toast("Added sample dates");
  show("insights");
}

async function onWipe() {
  const last = await db.getSetting("lastExportAt", 0);
  if (!last || Date.now() - last > 30 * 86400e3) {
    if (confirm("No recent backup — export before erasing?")) await onExport();
  }
  const cloud = db.getMode() === "cloud";
  const msg = cloud
    ? "Erase ALL dates and photos in your shared space — for both of you? This cannot be undone."
    : "Erase ALL dates and photos? This cannot be undone.";
  if (!confirm(msg)) return;
  if (cloud && !confirm("This erases the shared space for BOTH partners. Continue?")) return;
  await db.wipeAll();
  await reload();
  clearPhotoCache();
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

// ---------- per-person ratings + comments ----------
// authorKey identifies "me": my cloud uid, or "local" when not syncing.
function myKey() { return db.getUser()?.uid || "local"; }
function myInitial() { return (db.getUser()?.displayName || "You").trim()[0]?.toUpperCase() || "Y"; }

// Resolve who rated what. Returns [{ key, mine, initial, name, value }] plus a `mineRated` flag.
// Falls back to the legacy single `enjoyment` score (attributed to me) when there are no
// per-person ratings yet — old entries still show their star line and I can still add mine.
function resolveRatings(e) {
  const mk = myKey();
  const ratings = e.ratings && Object.keys(e.ratings).length ? e.ratings : null;
  const lines = [];
  if (ratings) {
    for (const [key, value] of Object.entries(ratings)) {
      const mine = key === mk;
      lines.push({ key, mine, value, initial: mine ? myInitial() : "P", name: mine ? "You" : "Partner" });
    }
    lines.sort((a, b) => (a.mine === b.mine ? 0 : a.mine ? -1 : 1)); // me first
  } else if (e.enjoyment) {
    // legacy: unattributed single score — show it, but not "mine" so tap-to-rate still offers.
    lines.push({ key: null, mine: false, value: e.enjoyment, initial: "★", name: "" });
  }
  return { lines, mineRated: !!(ratings && mk in ratings) };
}

async function saveMyRating(id, n) {
  const e = await db.getDate(id);
  if (!e) return;
  // ponytail: read-modify-write can clobber a concurrent partner edit; last-write-wins is fine here.
  e.ratings = { ...(e.ratings || {}), [myKey()]: n };
  await db.putDate(e);
  await reload();
}

async function addComment(id, text) {
  text = text.trim();
  if (!text) return;
  const e = await db.getDate(id);
  if (!e) return;
  const c = { id: crypto.randomUUID(), author: myKey(), name: db.getUser()?.displayName || "You", text, ts: Date.now() };
  // ponytail: same last-write-wins caveat as ratings.
  e.comments = [...(e.comments || []), c];
  await db.putDate(e);
  await reload();
}

function relTime(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 172800) return "yesterday";
  return `${Math.floor(s / 86400)}d ago`;
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
    // Full-bleed photo has no "outside" area to tap — the image itself is the
    // dismiss target (unless tapping jumps to the entry, e.g. slideshow mode).
    if (onTap) { close(); onTap(items[idx]); }
    else close();
  });
  box.addEventListener("click", close);   // tap backdrop (chrome areas) to dismiss
  document.addEventListener("keydown", onKey);
  if (multi) attachSwipe(box, () => goUser(1), () => goUser(-1));
  attachSwipeDown(box, close);
  document.body.appendChild(box);
  show();
  arm();
}

// Highlights slideshow: fullscreen auto-advancing reel of your best photos.
// Tapping a slide jumps to that date. Same data path a native lockscreen carousel
// would consume (A.highlightReel) — see the note there.
async function startSlideshow() {
  const reel = A.highlightReel(done());
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
let idleMs = localStorage.getItem("idleMs") == null ? 60000 : +localStorage.getItem("idleMs");
function resetIdle() {
  clearTimeout(idleTimer);
  if (idleMs > 0) idleTimer = setTimeout(maybeScreensaver, idleMs);
}
function maybeScreensaver() {
  if (document.visibilityState !== "visible") return;
  if (!document.hasFocus()) return;   // another app/picker is in front — don't count it as idle
  if (document.querySelector(".lightbox")) return;
  if (!done().some(d => Array.isArray(d.photos) && d.photos.length)) return;
  startSlideshow();
}
function wireIdle() {
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    document.addEventListener(ev, resetIdle, { passive: true }));
  document.addEventListener("visibilitychange", resetIdle);
  window.addEventListener("focus", resetIdle);   // returning from a picker/other app restarts the clock
  resetIdle();
}
// ---------- small helpers ----------
const catShort = k => catLabel(k).split("/")[0].trim();
