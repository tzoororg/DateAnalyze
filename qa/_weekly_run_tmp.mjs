// Weekly two-partner exploratory QA driver. Plays Alex (phoneA) + Sam (phoneB)
// against the emulator-backed app, drives the real UI via DOM clicks/evaluate,
// and prints a findings log to stdout.
import { launchChrome, openTab, sleep } from "../test/cdp.mjs";
import { writeFileSync } from "node:fs";

const SHOT_DIR = "C:/Users/tzoor/AppData/Local/Temp/claude/T--programming-claude-DateAnalyze/a1dad241-45ba-49a3-9b96-dbfc592cfc5e/scratchpad";
async function shot(tab, name) {
  const { data } = await tab.s("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${SHOT_DIR}/${name}.png`, Buffer.from(data, "base64"));
  console.log("screenshot saved:", name);
}

const BASE = "http://127.0.0.1:8000/index.html?emu=1";
const findings = []; // { severity, text }
const note = (text) => { console.log("NOTE:", text); findings.push(text); };
const log = (...a) => console.log(...a);

// Every tab needs confirm()/prompt() stubbed since Runtime.evaluate blocks on
// native dialogs. __promptAnswer is set per-call right before the click that
// triggers the dialog.
const DIALOG_SHIM = `
  window.confirm = () => true;
  window.__promptAnswer = "";
  window.prompt = () => window.__promptAnswer;
`;

async function boot(port, profile) {
  const cdp = await launchChrome({ port, profileName: profile });
  const tab = await openTab(cdp, BASE, { width: 390, height: 844 });
  await tab.waitFor(`document.getElementById("fab") != null`);
  await tab.evaluate(DIALOG_SHIM);
  // dismiss first-run intro if present
  await tab.evaluate(`{
    const el = document.getElementById("introSheet");
    if (el && !el.classList.contains("hidden")) document.getElementById("introStartBtn").click();
  }`);
  await sleep(200);
  return { cdp, tab };
}

const openMenu = t => t.evaluate(`document.getElementById("menuBtn").click()`);
const closeMenu = t => t.evaluate(`document.getElementById("sheet").classList.add("hidden")`);

let phoneA, phoneB;
try {
  log("=== BOOT ===");
  phoneA = await boot(9225, "cdp-qa-alex");
  phoneB = await boot(9226, "cdp-qa-sam");
  const A = phoneA.tab, B = phoneB.tab;

  log("=== PAIRING (Alex creates, Sam joins) ===");
  await openMenu(A);
  await A.evaluate(`document.getElementById("syncSignInBtn").click()`);
  await A.waitFor(`import("./js/store.js").then(s => !!s.getUser())`, { timeout: 8000 });
  await sleep(200);
  await A.evaluate(`document.getElementById("syncCreateBtn").click()`);
  await A.waitFor(`import("./js/store.js").then(s => s.getMode() === "cloud")`, { timeout: 8000 });
  await sleep(500);
  const statusA = await A.evaluate(`document.getElementById("syncStatus").textContent`);
  log("Alex sync status:", statusA);
  const codeMatch = statusA.match(/space code (\S+)/);
  if (!codeMatch) { note("bug: after 'Create space', the sync status text didn't show a parseable invite code — text was: " + statusA); }
  const code = codeMatch ? codeMatch[1] : null;
  await closeMenu(A);

  await openMenu(B);
  await B.evaluate(`document.getElementById("syncSignInBtn").click()`);
  await B.waitFor(`import("./js/store.js").then(s => !!s.getUser())`, { timeout: 8000 });
  await sleep(200);
  if (code) {
    await B.evaluate(`window.__promptAnswer = ${JSON.stringify(code)}`);
    await B.evaluate(`document.getElementById("syncJoinBtn").click()`);
    await B.waitFor(`import("./js/store.js").then(s => s.getMode() === "cloud")`, { timeout: 8000 }).catch(() => {});
    await sleep(500);
  }
  const statusB = await B.evaluate(`document.getElementById("syncStatus").textContent`);
  log("Sam sync status:", statusB);
  const [modeA, modeB] = await Promise.all([
    A.evaluate(`import("./js/store.js").then(s => s.getMode())`),
    B.evaluate(`import("./js/store.js").then(s => s.getMode())`),
  ]);
  log("modes:", modeA, modeB);
  if (modeA !== "cloud" || modeB !== "cloud") note(`bug: pairing failed to put both phones in cloud mode (A=${modeA} B=${modeB}, code=${code})`);
  else log("ok: pairing succeeded via UI, both phones cloud mode");
  await closeMenu(B);

  log("=== LOG: Alex logs a full date (incl. photo attach) ===");
  await A.evaluate(`document.querySelector("#fab").click()`);
  await A.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  await A.evaluate(`{
    const i = document.getElementById("f-title"); i.value = "Sunset picnic"; i.dispatchEvent(new Event("input"));
    const vb = document.getElementById("f-vibe"); vb.value = "cozy"; vb.dispatchEvent(new Event("input"));
    document.querySelector('#f-category [data-cat="outdoors"]')?.click();
    document.querySelector('#f-cost [data-tier="mid"]')?.click();
    document.getElementById("f-note-toggle")?.click();
    const nt = document.getElementById("f-notes"); if (nt) { nt.value = "Lovely evening by the water."; nt.dispatchEvent(new Event("input")); }
  }`);
  // real photo attach via CDP DOM.setFileInputFiles on the hidden gallery-picker input
  try {
    const { root } = await A.s("DOM.getDocument", { depth: -1 });
    const { nodeId } = await A.s("DOM.querySelector", { nodeId: root.nodeId, selector: "#f-photo-gallery" });
    await A.s("DOM.setFileInputFiles", {
      files: [String.raw`C:\Users\tzoor\AppData\Local\Temp\claude\T--programming-claude-DateAnalyze\a1dad241-45ba-49a3-9b96-dbfc592cfc5e\scratchpad\test.jpg`],
      nodeId,
    });
    await sleep(600);
    const photoAdded = await A.evaluate(`document.querySelectorAll("#f-photos .pshot:not(.empty), #f-photos img").length`);
    log("photo strip items after attach:", photoAdded);
    if (!photoAdded) note("bug: attaching a photo via the log form's gallery picker (#f-photo-gallery) didn't add it to the photo strip.");
  } catch (err) { log("photo-attach via CDP failed (test harness limitation, not necessarily an app bug):", err.message); }
  await A.evaluate(`document.getElementById("f-save").click()`);
  await A.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`);
  const id1 = await A.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.find(d => d.title === "Sunset picnic")?.id)`);
  log("logged id1:", id1);

  log("=== EDGE CASE: Sam logs blank title / cost 0 / very long notes / future date ===");
  await B.evaluate(`document.querySelector("#fab").click()`);
  await B.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  const longNote = "A".repeat(4000);
  await B.evaluate(`{
    document.querySelector('#f-cost [data-tier="free"]')?.click();
    const d = document.getElementById("f-date"); d.value = "2099-12-31"; d.dispatchEvent(new Event("change"));
    document.getElementById("f-note-toggle")?.click();
    const nt = document.getElementById("f-notes"); nt.value = ${JSON.stringify(longNote)}; nt.dispatchEvent(new Event("input"));
  }`);
  // blank-title alone is expected to block save (checked below); do a second pass
  // WITH a title so cost-0 / long-notes / future-date actually get exercised end to end.
  await B.evaluate(`{
    const i = document.getElementById("f-title");
    i.value = "Someday trip"; i.dispatchEvent(new Event("input"));
  }`);
  await B.evaluate(`document.getElementById("f-save").click()`);
  await B.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`, { timeout: 5000 }).catch(() => {});
  const futureEntry = await B.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.find(d => d.title === "Someday trip"))`);
  log("future/cost-0/long-notes entry saved:", !!futureEntry, futureEntry ? `cost=${futureEntry.cost} date=${futureEntry.date} notesLen=${futureEntry.notes?.length}` : "");
  if (futureEntry?.date !== "2099-12-31") note(`possible bug: future date typed into the log form's date field (2099-12-31) wasn't what got saved (saved as ${futureEntry?.date}) — check the date-picker binding.`);
  if (futureEntry) {
    await B.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
    await sleep(400);
    await B.evaluate(`(() => {
      const row = [...document.querySelectorAll(".hist-entry")].find(e => e.innerText.includes("Someday trip"))?.querySelector("[data-toggle]");
      row?.click();
    })()`);
    await sleep(300);
    const detailLen = await B.evaluate(`document.querySelector(".hist-detail .notes")?.textContent?.length || 0`);
    log("4000-char note renders in detail, length seen:", detailLen);
    if (detailLen < 3000) note(`ux: a 4000-char note doesn't fully render in the date detail view (only ${detailLen} chars visible) — may be silently truncated somewhere in the pipeline.`);
    await shot(B, "long-note-detail");
  }
  await sleep(200);
  // reopen the form for the original blank-title probe below
  await B.evaluate(`document.querySelector("#fab").click()`);
  await B.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  const beforeCount = await B.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.length)`);
  await B.evaluate(`document.getElementById("f-save").click()`);
  await sleep(400);
  const stillOpen = await B.evaluate(`!document.getElementById("logSheet").classList.contains("hidden")`);
  const afterCount = await B.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.length)`);
  log("blank-title save: stillOpen=", stillOpen, "count", beforeCount, "->", afterCount);
  if (!stillOpen && afterCount === beforeCount + 1) {
    const savedBlank = await B.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.filter(d=>d.date==="2099-12-31"))`);
    log("blank-title / future-date / long-note entry saved:", JSON.stringify(savedBlank).slice(0, 300));
    note("ux: the log form accepts a blank title, a cost of 0, and a date 70+ years in the future with zero validation or warning — a real user could easily fat-finger the year and never notice.");
  } else if (stillOpen) {
    log("ok: form blocked blank-title save (or is still open for another reason)");
    await B.evaluate(`(document.getElementById("f-cancel") || document.getElementById("logCloseBtn"))?.click()`);
    await sleep(300);
  }

  log("=== SYNC CHECK: does Alex's picnic appear on Sam's phone? ===");
  let seenOnB = false, waited = 0;
  while (waited < 12000 && !seenOnB) {
    seenOnB = await B.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.some(d => d.id === ${JSON.stringify(id1)}))`);
    if (!seenOnB) { await sleep(500); waited += 500; }
  }
  log(`sync A->B took ~${waited}ms, seen=${seenOnB}`);
  if (!seenOnB) note(`bug: date logged on Alex's phone never synced to Sam's phone within 12s (id=${id1})`);

  log("=== EDIT: Sam edits Alex's date, via the real Edit UI ===");
  await B.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(400);
  await B.evaluate(`(() => {
    const row = [...document.querySelectorAll(".hist-entry")]
      .find(e => e.innerText.includes("Sunset picnic"))?.querySelector("[data-toggle]");
    row?.click();
  })()`);
  await sleep(300);
  await B.evaluate(`document.querySelector("[data-kebab]")?.click()`);
  await sleep(150);
  await B.evaluate(`document.querySelector("[data-edit]")?.click()`);
  const editFormOpened = await B.evaluate(`!document.getElementById("logSheet").classList.contains("hidden")`).catch(() => false);
  log("Sam's Edit opened the log form:", editFormOpened);
  if (editFormOpened) {
    await B.evaluate(`{
      const i = document.getElementById("f-title");
      i.value = "Sunset picnic (rescheduled)"; i.dispatchEvent(new Event("input"));
    }`);
    await B.evaluate(`document.getElementById("f-save").click()`);
    await B.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`, { timeout: 5000 }).catch(() => {});
  }
  const editedTitleNow = await B.evaluate(`import("./js/store.js").then(s => s.getDate(${JSON.stringify(id1)})).then(d => d?.title)`);
  log("title after Sam's UI edit:", editedTitleNow);
  if (editedTitleNow !== "Sunset picnic (rescheduled)") note(`bug: editing another partner's entry via the kebab -> Edit -> Save flow didn't persist the change (title now: "${editedTitleNow}")`);

  log("=== DELETE: Alex deletes Sam's future-date entry (if it saved) ===");
  const futureId = await A.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => ds.find(d=>d.date==="2099-12-31")?.id)`);
  if (futureId) {
    await A.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
    await sleep(400);
    const delOk = await A.evaluate(`(async () => {
      const s = await import("./js/store.js");
      await s.deleteDate(${JSON.stringify(futureId)});
      return true;
    })()`);
    log("Alex deleted Sam's entry (store call, verification path):", delOk);
    let goneOnB = false, w2 = 0;
    while (w2 < 10000 && !goneOnB) {
      goneOnB = await B.evaluate(`import("./js/store.js").then(s => s.getAllDates()).then(ds => !ds.some(d => d.id === ${JSON.stringify(futureId)}))`);
      if (!goneOnB) { await sleep(500); w2 += 500; }
    }
    log(`delete propagated to Sam in ~${w2}ms:`, goneOnB);
    if (!goneOnB) note("bug: deleting the other partner's entry didn't propagate within 10s");
  } else {
    log("no future-date entry existed to delete (earlier save was blocked)");
  }

  log("=== HISTORY: list vs gallery, search, filters (Sam) ===");
  await B.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(300);
  const viewToggle = await B.evaluate(`!!document.querySelector(".hist-view-toggle")`);
  log("history view toggle present:", viewToggle);
  await B.evaluate(`document.querySelector('.hist-view-toggle [data-view="gallery"]')?.click()`);
  await sleep(500);
  const galleryCount = await B.evaluate(`document.querySelectorAll('.gallery-tile').length`);
  const galleryLabel = await B.evaluate(`document.getElementById("h-count")?.textContent || ""`);
  log("gallery-view tiles:", galleryCount, "label:", galleryLabel);
  if (galleryCount === 0) note("possible bug: Sam's gallery view shows 0 photos even though Alex attached and synced a photo to the shared entry — check photo sync timing / gallery tile rendering.");
  await B.evaluate(`document.querySelector('.hist-view-toggle [data-view="list"]')?.click()`);
  await B.evaluate(`{ const s = document.getElementById("h-search"); if (s) { s.value = "picnic"; s.dispatchEvent(new Event("input")); } }`);
  await sleep(300);
  const searchResults = await B.evaluate(`document.getElementById("h-count")?.textContent || ""`);
  log("search 'picnic' ->", searchResults);
  await B.evaluate(`{ const s = document.getElementById("h-search"); if (s) { s.value = ""; s.dispatchEvent(new Event("input")); } }`);

  log("=== INSIGHTS: little data then more (Alex) ===");
  await A.evaluate(`document.querySelector('.tab[data-tab="insights"]').click()`);
  await sleep(400);
  const insightsText1 = await A.evaluate(`document.querySelector("#view").innerText.length`);
  const chartCount1 = await A.evaluate(`document.querySelectorAll("#view svg").length`);
  log("insights with little data: textLen=", insightsText1, "chartCount=", chartCount1);
  // add a bunch of same-category quirky data
  await A.evaluate(`(async () => {
    const s = await import("./js/store.js"); const m = await import("./js/model.js");
    for (let i = 0; i < 8; i++) {
      const e = { ...m.blankEntry(), title: "Coffee #"+i, category: "food", enjoyment: 4, cost: 20,
        date: new Date(Date.now() - i*86400000).toISOString().slice(0,10) };
      await s.putDate(e);
    }
  })()`);
  await A.evaluate(`document.querySelector('.tab[data-tab="insights"]').click()`);
  await sleep(500);
  const chartCount2 = await A.evaluate(`document.querySelectorAll("#view svg").length`);
  const insightsErr = phoneA.tab.errors.length;
  log("insights with quirky (all-same-category) data: chartCount=", chartCount2, "console errors so far=", insightsErr);
  if (phoneA.tab.errors.length) note("bug: JS console errors while viewing Insights with same-category-only data: " + phoneA.tab.errors.slice(-3).join(" | "));
  await shot(A, "insights-quirky-data");

  log("=== SUGGEST: slider 0 / 0.5 / 1 (Sam) ===");
  await B.evaluate(`document.querySelector('.tab[data-tab="suggest"]').click()`);
  await sleep(400);
  for (const v of [0, 50, 100]) {
    await B.evaluate(`{ const s = document.getElementById("s-explore"); if (s) { s.value = ${v}; s.dispatchEvent(new Event("input")); } }`);
    await sleep(300);
    const cardCount = await B.evaluate(`document.querySelectorAll("#sug-results .sug-card, #sug-results [data-save]").length`);
    log(`slider=${v} -> ${cardCount} results`);
  }
  // repeat suggestions check: re-shuffle and see if identical set comes back every time
  const set1 = await B.evaluate(`[...document.querySelectorAll('#sug-results [data-save]')].map(x=>x.dataset.save).join(",")`);
  await B.evaluate(`document.getElementById("s-shuffle")?.click()`);
  await sleep(300);
  const set2 = await B.evaluate(`[...document.querySelectorAll('#sug-results [data-save]')].map(x=>x.dataset.save).join(",")`);
  log("shuffle changed suggestions:", set1 !== set2);

  log("=== RATINGS + COMMENTS: Alex rates/comments on Sam's edited entry ===");
  await A.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(400);
  const entryCount = await A.evaluate(`document.querySelectorAll(".hist-entry").length`);
  log("Alex history entry count:", entryCount);
  const opened = await A.evaluate(`(() => {
    const entries = [...document.querySelectorAll(".hist-entry")];
    const row = entries[0]?.querySelector("[data-toggle]");
    row?.click();
    return !!row;
  })()`);
  log("clicked row to expand:", opened);
  await sleep(400);
  const isOpenNow = await A.evaluate(`!!document.querySelector(".hist-entry.open")`);
  log("an entry is now .open:", isOpenNow);
  const rateCtaPresent = await A.evaluate(`!!document.querySelector("[data-rate-cta]")`);
  log("rate-cta present:", rateCtaPresent);
  await A.evaluate(`document.querySelector("[data-rate-cta]")?.click()`);
  await sleep(150);
  const starPresent = await A.evaluate(`!!document.querySelector('[data-rate] [data-k="4"]')`);
  log("star k=4 present:", starPresent);
  await A.evaluate(`document.querySelector('[data-rate] [data-k="4"]')?.click()`);
  await sleep(300);
  const inputPresent = await A.evaluate(`!!document.querySelector("[data-cmt]")`);
  log("comment input present after rating:", inputPresent);
  await A.evaluate(`{
    const input = document.querySelector("[data-cmt]");
    if (input) { input.value = "loved this one!"; input.dispatchEvent(new Event("input")); }
  }`);
  const valueSet = await A.evaluate(`document.querySelector("[data-cmt]")?.value`);
  log("comment input value right before send click:", valueSet);
  await A.evaluate(`document.querySelector("[data-cmt-send]")?.click()`);
  await sleep(500);
  const commentsHtml = await A.evaluate(`document.querySelector(".comments")?.innerHTML?.slice(0,500) || "NO .comments ELEMENT"`);
  log("comments block html after send:", commentsHtml);
  const commentAdded = await A.evaluate(`document.querySelector(".comments .cmt .bubble")?.textContent || ""`);
  log("Alex's comment shows in own view:", commentAdded);
  if (!commentAdded.includes("loved")) note("ux/bug: adding a per-partner comment via the Notes-to-each-other input didn't render back in the same view after Send (or the input needed an explicit input-event to register the typed value).");

  log("=== ON-THIS-DAY memory card (Alex, home tab) ===");
  await A.evaluate(`document.querySelector('.tab[data-tab="home"]').click()`);
  await sleep(300);
  const memoryCard = await A.evaluate(`!!document.querySelector(".capsule-memory, .memory-card, [id^='memory-']")`);
  log("memory card present (expected: no, no matching-date-last-year data seeded):", memoryCard);

  log("=== THEME SWITCH + export (Sam) ===");
  await openMenu(B);
  const themeBefore = await B.evaluate(`document.documentElement.dataset.theme`);
  await B.evaluate(`document.querySelector('[data-theme-pick="mint"]')?.click() || document.querySelectorAll("[data-theme-pick]")[1]?.click()`);
  await sleep(200);
  const themeAfter = await B.evaluate(`document.documentElement.dataset.theme`);
  log("theme switch:", themeBefore, "->", themeAfter);
  await B.evaluate(`document.getElementById("exportBtn")?.click()`);
  await sleep(400);
  log("export click errors:", phoneB.tab.errors.slice(-2));
  await closeMenu(B);

  log("\n=== CONSOLE ERRORS SUMMARY ===");
  log("Alex tab errors:", JSON.stringify(phoneA.tab.errors));
  log("Sam tab errors:", JSON.stringify(phoneB.tab.errors));

  log("\n=== FINDINGS QUEUE ===");
  findings.forEach((f, i) => log(`${i + 1}. ${f}`));

  log("\n=== FILING FEEDBACK (via Sam's ⋯ menu → Send feedback) ===");
  // File up to the cap via the app's own UI. Only report genuinely new/impactful items.
  const toFile = process.env.QA_TOFILE ? JSON.parse(process.env.QA_TOFILE) : [];
  for (const text of toFile) {
    await openMenu(B);
    await B.evaluate(`document.getElementById("feedbackBtn").click()`);
    await sleep(300);
    await B.evaluate(`{
      const ta = document.getElementById("fb-text");
      ta.value = ${JSON.stringify(text)};
      ta.dispatchEvent(new Event("input"));
    }`);
    await B.evaluate(`document.getElementById("fb-send").click()`);
    await sleep(1500);
    const hint = await B.evaluate(`document.getElementById("fb-hint")?.textContent || document.querySelector("#feedback-sheet") ? "sheet still present" : "sheet closed"`);
    log("filed:", text.slice(0, 60), "-> state:", hint);
  }

} catch (err) {
  console.error("RUN ERROR:", err);
} finally {
  log("\n=== TEARDOWN: closing chrome instances ===");
  try { phoneA?.cdp.close(); } catch {}
  try { phoneB?.cdp.close(); } catch {}
}
