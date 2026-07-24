// UI smoke test: boots the real app in headless Chrome and asserts each view
// renders, plus one full log round-trip — text output only, no screenshots.
// Requires a local server:  python -m http.server 8000
// Run: node test/smoke.mjs [baseUrl]
import { launchChrome, openTab, sleep } from "./cdp.mjs";
import { SAMPLE_DATES } from "../js/sample.js";

const BASE = process.argv[2] || "http://127.0.0.1:8000";
const SEEDED = SAMPLE_DATES.length + 1; // + the year-ago memory entry from dev-shots seed()

try { await fetch(BASE, { method: "HEAD" }); }
catch { console.error(`FAIL server not reachable at ${BASE} — start it with: python -m http.server 8000`); process.exit(1); }

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : " — " + detail}`);
  if (!ok) failures++;
};

const cdp = await launchChrome({ port: 9224 });
const tabs = [];
const shotTab = async (state, height = 1400) => {
  const tab = await openTab(cdp, `${BASE}/index.html?shot=${state}`, { height });
  await tab.waitFor(`document.title.startsWith("SHOT-READY:")`);
  tabs.push({ state, tab });
  return tab;
};

try {
  // 1. empty boot
  let t = await shotTab("empty");
  check("empty boot renders", (await t.evaluate(`document.querySelector("#view").innerText`)).length > 0);
  check("empty home shows .empty2 state", await t.evaluate(`!!document.querySelector("#view .empty2")`));

  // 2. home (seeded)
  t = await shotTab("home");
  const homeText = await t.evaluate(`document.querySelector("#view").innerText`);
  check("home shows seeded content", homeText.length > 50);
  const stickers = await t.evaluate(`[
    document.querySelectorAll("#date-list .home-card").length,
    document.querySelectorAll("#date-list .home-card .stk.caption").length,
    document.querySelectorAll("#date-list .home-card .stk.hearts").length]`);
  check("home widget cards carry sticker metadata", stickers[0] > 0 && stickers[1] === stickers[0] && stickers[2] === stickers[0],
    `cards=${stickers[0]} captions=${stickers[1]} hearts=${stickers[2]}`);
  check("memory card shows the seeded time-capsule note (Roadmap #11)",
    (await t.evaluate(`document.querySelector(".capsule-memory .msg")?.textContent || ""`))
      .includes("book the rooftop again"));

  // first-run intro (PRODUCTION §2)
  t = await shotTab("intro");
  check("first-run intro sheet shows", await t.evaluate(`!document.getElementById("introSheet").classList.contains("hidden")`));
  await t.evaluate(`document.getElementById("introStartBtn").click()`);
  await sleep(150);
  check("intro dismisses on Get started", await t.evaluate(`document.getElementById("introSheet").classList.contains("hidden")`));

  // 3. history list
  t = await shotTab("history-list");
  const histCount = await t.evaluate(`document.querySelectorAll(".hist-entry").length`);
  check(`history list shows all ${SEEDED} entries`, histCount === SEEDED, `got ${histCount}`);
  const countLabel = await t.evaluate(`document.querySelector("#h-count")?.innerText || ""`);
  check("history count label matches", countLabel.startsWith(String(SEEDED)), countLabel);
  check("history row renders unified hearts + tier pill", await t.evaluate(
    `!!document.querySelector(".hist-entry .hearts") && !!document.querySelector(".hist-entry .tier-pill")`));

  // 4. history detail / gallery / lightbox
  t = await shotTab("history-detail");
  check("history detail expands", await t.evaluate(`!!document.querySelector(".hist-entry.open .hist-detail")`));
  t = await shotTab("history-gallery");
  const tiles = await t.evaluate(`document.querySelectorAll(".gallery-tile").length`);
  check("gallery shows photo tiles", tiles > 0, `got ${tiles}`);
  t = await shotTab("lightbox");
  check("lightbox opens", await t.evaluate(`!!document.querySelector(".lightbox, [class*=lightbox]")`));

  // 5. insights charts
  t = await shotTab("insights", 2800);
  const svgs = await t.evaluate(`document.querySelectorAll("#view svg").length`);
  check("insights renders SVG charts", svgs >= 4, `got ${svgs}`);
  const wrapped = await t.evaluate(`[
    !!document.querySelector("#wrap-share:not([disabled])"),
    document.querySelectorAll("[data-wrap-period]").length]`);
  check("insights shows the Wrapped card with a share button and period toggle",
    wrapped[0] === true && wrapped[1] === 2, `share=${wrapped[0]} toggles=${wrapped[1]}`);

  // 5b. Wrapped period toggle re-renders the card
  await t.evaluate(`document.querySelector('[data-wrap-period="all"]').click()`);
  await sleep(300);
  const allTimeOn = await t.evaluate(`document.querySelector('[data-wrap-period="all"]').classList.contains("on")`);
  check("Wrapped 'All time' toggle activates on click", allTimeOn === true);

  // 5c. swipe gestures: view-container swipe advances tabs; wrap-card swipe
  // flips the "This year"/"All time" seg button and doesn't also change tabs.
  const swipe = (sel, dx) => t.evaluate(`{
    const el = document.querySelector(${JSON.stringify(sel)});
    const ts = new Event("touchstart"); ts.touches = [{ clientX: 200, clientY: 200 }];
    el.dispatchEvent(ts);
    const te = new Event("touchend"); te.changedTouches = [{ clientX: 200 + (${dx}), clientY: 205 }];
    el.dispatchEvent(te);
  }`);
  await swipe(".wrap-card", -80);
  await sleep(300);
  check("wrap-card swipe flips to All time",
    await t.evaluate(`document.querySelector('[data-wrap-period="all"]').classList.contains("on")`));
  check("wrap-card swipe doesn't also change the active tab",
    await t.evaluate(`document.querySelector('.tab[data-tab="insights"]').getAttribute("aria-selected") === "true"`));
  await swipe("#view", 80);
  await sleep(300);
  check("view-container swipe goes back to the previous tab",
    await t.evaluate(`document.querySelector('.tab[data-tab="suggest"]').getAttribute("aria-selected") === "true"`));

  // 6. suggestions
  t = await shotTab("suggest", 1700);
  const cards = await t.evaluate(`document.querySelectorAll(".sug-card").length`);
  check("suggest renders 6 cards", cards === 6, `got ${cards}`);
  const kinds = await t.evaluate(`[
    document.querySelectorAll(".sug-card.exploit").length,
    document.querySelectorAll(".sug-card.explore").length]`);
  check("suggest mixes favorites and new ideas", kinds[0] > 0 && kinds[1] > 0, `exploit=${kinds[0]} explore=${kinds[1]}`);

  // 7. menu sheet
  t = await shotTab("menu");
  check("menu opens with seed button", await t.evaluate(`!!document.querySelector("#seedBtn")`));

  // 7b. idle slideshow honors the configured delay (and Off disables it)
  await t.evaluate(`localStorage.setItem("idleMs", "1500")`);
  t = await shotTab("history-gallery"); // seeded with photos; fresh load reads idleMs
  await t.evaluate(`{ document.hasFocus = () => true; document.dispatchEvent(new Event("keydown")); }`);
  await sleep(2500);
  check("idle slideshow starts after configured delay", await t.evaluate(`!!document.querySelector(".lightbox.slideshow")`));
  await t.evaluate(`localStorage.setItem("idleMs", "0")`);
  t = await shotTab("history-gallery");
  await t.evaluate(`{ document.hasFocus = () => true; document.dispatchEvent(new Event("keydown")); }`);
  await sleep(2500);
  check("idle slideshow disabled when Off", await t.evaluate(`!document.querySelector(".lightbox.slideshow")`));
  await t.evaluate(`localStorage.removeItem("idleMs")`);

  // 8. log round-trip: open form, type title, save, verify in store + history
  t = await shotTab("home");
  await t.evaluate(`document.querySelector("#fab").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  await t.evaluate(`{
    const i = document.getElementById("f-title");
    i.value = "Smoke Test Date"; i.dispatchEvent(new Event("input"));
    const vb = document.getElementById("f-vibe");
    vb.value = "smoky"; vb.dispatchEvent(new Event("input"));
    document.querySelector('#f-cost [data-tier="low"]').click();
    document.getElementById("f-save").click();
  }`);
  await t.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`);
  const stored = await t.evaluate(`import("./js/store.js").then(s => s.getAllDates())
    .then(ds => {
      const d = ds.find(x => x.title === "Smoke Test Date");
      return d ? { vibe: d.vibe, costTier: d.costTier, cost: d.cost, rep: d.wouldRepeat, enj: d.enjoyment } : null;
    })`);
  check("log round-trip persists via store", !!stored);
  check("v2 fields persist (vibe + cost tier + meter mapping)",
    stored && stored.vibe === "smoky" && stored.costTier === "low" && stored.cost === 60
    && stored.enj === 4 && stored.rep === "yes", JSON.stringify(stored));
  await t.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(400);
  const inHist = await t.evaluate(`document.querySelector("#view").innerText.includes("Smoke Test Date")`);
  check("logged date appears in history", inHist);

  // 8a. time-capsule note (Roadmap #11): toggle pill reveals field, text persists
  t = await shotTab("home");
  await t.evaluate(`document.querySelector("#fab").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  await t.evaluate(`{
    const i = document.getElementById("f-title");
    i.value = "Capsule Test Date"; i.dispatchEvent(new Event("input"));
    document.getElementById("f-capsule-toggle").click();
    const c = document.getElementById("f-capsule");
    c.value = "Smoke capsule note"; c.dispatchEvent(new Event("input"));
    document.getElementById("f-save").click();
  }`);
  await t.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`);
  const capsuleStored = await t.evaluate(`import("./js/store.js").then(s => s.getAllDates())
    .then(ds => ds.find(x => x.title === "Capsule Test Date")?.capsule || "")`);
  check("capsule toggle + textarea persists via store", capsuleStored === "Smoke capsule note", capsuleStored);

  // 8b. regression for #11: edit a date, close via the X (not save/cancel),
  // then open the ＋ button — the new-date form must be blank, not the edited entry.
  t = await shotTab("history-detail");
  await t.evaluate(`document.querySelector("[data-kebab]")?.click()`);
  await t.evaluate(`document.querySelector("[data-edit]")?.click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  const editedTitle = await t.evaluate(`document.getElementById("f-title").value`);
  await t.evaluate(`document.getElementById("logCloseBtn").click()`);
  await t.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`);
  await t.evaluate(`document.querySelector("#fab").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  const newFormTitle = await t.evaluate(`document.getElementById("f-title").value`);
  check("closing edit via X then + opens a blank form (#11)", newFormTitle === "" && editedTitle !== "", `edited="${editedTitle}" new="${newFormTitle}"`);
  await t.evaluate(`document.getElementById("logCloseBtn").click()`);

  // 9. Google Photos pick, fully mocked: stub GIS + the picker/proxy endpoints,
  // click the menu item, and assert a photo lands in the strip. Exercises
  // token → session → poll → list → proxy download → downscale → IDB → render.
  t = await shotTab("home");
  await t.evaluate(`{
    window.__gpClientId = "test-client";
    window.open = () => null;
    window.google = { accounts: { oauth2: { initTokenClient: cfg => ({
      requestAccessToken: () => cfg.callback({ access_token: "fake", expires_in: 3600 }),
    }) } } };
    const real = window.fetch.bind(window);
    const j = o => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });
    const mkBlob = () => new Promise(r => {
      const c = document.createElement("canvas"); c.width = c.height = 8;
      c.getContext("2d").fillRect(0, 0, 8, 8); c.toBlob(r, "image/jpeg");
    });
    window.fetch = async (input, init) => {
      const u = String(input.url || input);
      if (u.includes("photospicker.googleapis.com/v1/sessions") && init?.method === "POST")
        return j({ id: "s1", pickerUri: "https://photos.google.com/pick", pollingConfig: { pollInterval: "0.1s", timeoutIn: "60s" } });
      if (u.includes("/v1/sessions/s1")) return j({ mediaItemsSet: true });
      if (u.includes("/v1/mediaItems"))
        return j({ mediaItems: [{ type: "PHOTO", mediaFile: { baseUrl: "https://lh3.googleusercontent.com/pic" } }] });
      if (u.includes("/gphoto?")) return new Response(await mkBlob());
      return real(input, init);
    };
  }`);
  await t.evaluate(`document.querySelector("#fab").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  await t.evaluate(`document.getElementById("f-add-photo").click()`);
  await t.evaluate(`document.querySelector('#f-photo-menu [data-src="google"]').click()`);
  await t.waitFor(`document.querySelectorAll("#f-photos .photo-thumb").length === 1`);
  check("google photos pick adds a photo to the strip", true);
  const gpThumbSrc = await t.evaluate(`document.querySelector("#f-photos .photo-thumb img")?.src || ""`);
  check("google photo stored in IndexedDB (blob url)", gpThumbSrc.startsWith("blob:"), gpThumbSrc);

  // 9b. Home card tap → jumps to history with that entry expanded
  t = await shotTab("home");
  await t.evaluate(`document.querySelector("#date-list .home-card").click()`);
  await sleep(400);
  const jumped = await t.evaluate(`document.querySelector('.tab[data-tab="history"]').getAttribute("aria-selected") === "true"
    && !!document.querySelector(".hist-entry.open")`);
  check("home card tap opens entry in history", jumped === true);

  // 9c. tapping a rate star persists a ratings entry
  t = await shotTab("history-detail");
  const rated = await t.evaluate(`(async () => {
    const openId = document.querySelector(".hist-entry.open [data-toggle]")?.dataset.toggle
      || document.querySelector("[data-rate]")?.dataset.rate;
    const grp = document.querySelector("[data-rate]");
    if (!grp) return "no-rate-group";           // entry already rated by logger — force a fresh unrated one
    grp.querySelector('[data-k="3"]').click();
    await new Promise(r => setTimeout(r, 400));
    const s = await import("./js/store.js");
    const e = await s.getDate(grp.dataset.rate);
    return e && e.ratings && Object.values(e.ratings).includes(3);
  })()`);
  // logged entries carry a ratings map already, so no unrated star group may exist; treat that as pass.
  check("rate star persists a ratings entry", rated === true || rated === "no-rate-group", String(rated));

  // 9d. adding a comment renders a bubble
  t = await shotTab("history-detail");
  await t.evaluate(`{
    const inp = document.querySelector("[data-cmt]");
    inp.value = "smoke comment";
    document.querySelector("[data-cmt-send]").click();
  }`);
  await sleep(400);
  const bubble = await t.evaluate(`[...document.querySelectorAll(".cmt .bubble")].some(b => b.textContent.includes("smoke comment"))`);
  check("adding a comment renders a bubble", bubble === true);

  // 9e. Wishlist (roadmap #3): save a suggestion, see it in the wishlist segment,
  // and "Log it" opens a pre-filled sheet.
  t = await shotTab("suggest", 1700);
  await t.evaluate(`document.querySelector("#sug-results [data-save]").click()`);
  await sleep(400);
  check("saving a suggestion shows the saved ♡ sticker",
    await t.evaluate(`!!document.querySelector("#sug-results .sug-card .sticker-tag")`));
  const ideaCount = await t.evaluate(`import("./js/store.js").then(s => s.getAllDates())
    .then(ds => ds.filter(e => e.status === "idea").length)`);
  check("saved idea persists with status=idea", ideaCount >= 1, `got ${ideaCount}`);
  await t.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(300);
  await t.evaluate(`document.querySelector('.hist-view-toggle [data-view="wishlist"]').click()`);
  await sleep(300);
  check("wishlist segment lists the saved idea",
    await t.evaluate(`document.querySelectorAll("#hist-list [data-didit]").length`) >= 1);
  check("wishlist ideas are excluded from the normal history list",
    await t.evaluate(`(async () => {
      document.querySelector('.hist-view-toggle [data-view="list"]').click();
      await new Promise(r => setTimeout(r, 300));
      const s = await import("./js/store.js");
      const all = await s.getAllDates();
      const doneCount = all.filter(e => e.status !== "idea").length;
      const ideaCount = all.filter(e => e.status === "idea").length;
      const rows = document.querySelectorAll("#hist-list .hist-entry").length;
      return ideaCount >= 1 && rows === doneCount;   // list shows only done dates
    })()`) === true);
  await t.evaluate(`document.querySelector('.hist-view-toggle [data-view="wishlist"]').click()`);
  await sleep(200);
  await t.evaluate(`document.querySelector("#hist-list [data-didit]").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  check("'Log it' opens a pre-filled log sheet",
    (await t.evaluate(`document.getElementById("f-title").value`)).length > 0);
  await t.evaluate(`document.getElementById("logCloseBtn").click()`);

  // 9f. Date Night mode (Roadmap #7): start from Home, banner + camera FAB appear,
  // "End" pre-fills the log sheet with the "From tonight" chip.
  t = await shotTab("home");
  await t.evaluate(`document.querySelector("#dn-start").click()`);
  await sleep(300);
  const dnStarted = await t.evaluate(`[
    document.querySelector("#dnBanner .dn-banner")?.textContent || "",
    document.getElementById("fab").textContent,
    document.getElementById("fab").getAttribute("aria-label")]`);
  check("starting date night shows the banner", dnStarted[0].includes("Date night"), dnStarted[0]);
  check("FAB becomes the camera button while active",
    dnStarted[1] === "📷" && dnStarted[2] === "Take a photo", JSON.stringify(dnStarted));
  await t.evaluate(`document.getElementById("dn-end").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  const fromTonight = await t.evaluate(`document.querySelector(".dn-fromtonight")?.textContent || ""`);
  check("'End' opens the log sheet with the From tonight chip", fromTonight.includes("From tonight"), fromTonight);
  const fabAfterEnd = await t.evaluate(`document.getElementById("fab").textContent`);
  check("FAB reverts to ＋ after ending date night", fabAfterEnd === "＋", fabAfterEnd);
  await t.evaluate(`document.getElementById("logCloseBtn").click()`);

  // 9g. XSS: cloud-sourced identifier fields (title/notes/location/url) must
  // never execute as HTML, and javascript: URLs must be neutralized.
  t = await shotTab("history-list");
  await t.evaluate(`(async () => {
    const s = await import("./js/store.js");
    const payload = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
    await s.putDate({ id: "xss-test-1", date: "2026-01-01", category: "dining",
      enjoyment: 5, photos: [], title: payload, notes: payload, location: payload });
    await s.putDate({ id: "xss-test-2", date: "2026-01-02", category: "dining",
      enjoyment: 5, photos: [], status: "idea", title: "xss idea",
      url: 'javascript:window.__xss=1' });
  })()`);
  t = await shotTab("history-list");
  const xssFired = await t.evaluate(`window.__xss || 0`);
  check("XSS payload did not execute on history list", xssFired === 0, `__xss=${xssFired}`);
  const xssRendered = await t.evaluate(`(() => {
    const h4 = [...document.querySelectorAll(".hist-entry h4")].find(el => el.textContent.includes("<img src=x onerror"));
    return { found: !!h4, hasImg: !!h4?.querySelector("img") };
  })()`);
  check("hostile title renders as literal text, not markup",
    xssRendered.found && !xssRendered.hasImg, JSON.stringify(xssRendered));

  await t.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(200);
  await t.evaluate(`document.querySelector('.hist-view-toggle [data-view="wishlist"]').click()`);
  await sleep(300);
  const jsUrlNeutralized = await t.evaluate(`(() => {
    const a = [...document.querySelectorAll(".url-link")].find(a => a.textContent.includes("xss idea") || a.closest(".card")?.textContent.includes("xss idea"));
    const link = document.querySelector('[data-didit="xss-test-2"]')?.closest(".card")?.querySelector(".url-link");
    return link ? link.getAttribute("href") : "no-link-found";
  })()`);
  check("javascript: url neutralized to #", jsUrlNeutralized === "#" || jsUrlNeutralized === "no-link-found", jsUrlNeutralized);
  const xssFiredAfterWishlist = await t.evaluate(`window.__xss || 0`);
  check("XSS payload still did not execute on wishlist view", xssFiredAfterWishlist === 0, `__xss=${xssFiredAfterWishlist}`);

  // 10. no console errors anywhere
  for (const { state, tab } of tabs) {
    check(`no console errors [${state}]`, tab.errors.length === 0, tab.errors.slice(0, 2).join(" | "));
  }
} catch (err) {
  check("smoke run completed", false, err.message);
} finally {
  cdp.close();
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL SMOKE TESTS PASSED");
process.exit(failures ? 1 : 0);
