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

  // 2. home (seeded)
  t = await shotTab("home");
  const homeText = await t.evaluate(`document.querySelector("#view").innerText`);
  check("home shows seeded content", homeText.length > 50);

  // 3. history list
  t = await shotTab("history-list");
  const histCount = await t.evaluate(`document.querySelectorAll(".hist-entry").length`);
  check(`history list shows all ${SEEDED} entries`, histCount === SEEDED, `got ${histCount}`);
  const countLabel = await t.evaluate(`document.querySelector("#h-count")?.innerText || ""`);
  check("history count label matches", countLabel.startsWith(String(SEEDED)), countLabel);

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

  // 8. log round-trip: open form, type title, save, verify in store + history
  t = await shotTab("home");
  await t.evaluate(`document.querySelector("#fab").click()`);
  await t.waitFor(`!document.getElementById("logSheet").classList.contains("hidden")`);
  await t.evaluate(`{
    const i = document.getElementById("f-title");
    i.value = "Smoke Test Date"; i.dispatchEvent(new Event("input"));
    document.getElementById("f-save").click();
  }`);
  await t.waitFor(`document.getElementById("logSheet").classList.contains("hidden")`);
  const stored = await t.evaluate(`import("./js/store.js").then(s => s.getAllDates())
    .then(ds => ds.some(d => d.title === "Smoke Test Date"))`);
  check("log round-trip persists via store", stored === true);
  await t.evaluate(`document.querySelector('.tab[data-tab="history"]').click()`);
  await sleep(400);
  const inHist = await t.evaluate(`document.querySelector("#view").innerText.includes("Smoke Test Date")`);
  check("logged date appears in history", inHist);

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
