// Captures a screenshot of every app view (and roadmap "after" mocks) via
// Chrome DevTools Protocol + the ?shot= dev hook (js/dev-shots.js), which sets
// document.title to "SHOT-READY:<state>" when the view has settled.
// Usage: node design/capture.mjs [baseUrl] [shotName...]
//   baseUrl defaults to http://127.0.0.1:8163; with shot names, captures only
//   those (cheap iteration on the views under discussion) instead of all.
// The CDP client lives in test/cdp.mjs (shared with the smoke/sync tests).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchChrome, openTab, sleep } from "../test/cdp.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8163";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");

// shot name -> viewport height (390 wide = phone)
const SHOTS = {
  "empty": 844, "home": 1000, "log": 1750, "menu": 900,
  "history-list": 1250, "history-detail": 1450, "history-gallery": 1000,
  "lightbox": 844, "insights": 2750, "suggest": 1650,
  "wrapped": 2900, "wishlist-suggest": 1750, "wishlist-history": 1500,
  "after-reminders": 900, "datenight-home": 1150, "datenight-active": 1150,
  "after-forecast": 1300, "after-value": 1200, "after-interview": 1300,
  "after-capsule-log": 2200, "after-capsule-home": 1100, "after-match": 1750,
};

const only = process.argv.slice(3);
const unknown = only.filter((n) => !(n in SHOTS));
if (unknown.length) {
  console.error("unknown shot(s):", unknown.join(", "), "\nknown:", Object.keys(SHOTS).join(", "));
  process.exit(1);
}
const shots = only.length
  ? Object.fromEntries(only.map((n) => [n, SHOTS[n]]))
  : SHOTS;

mkdirSync(OUT, { recursive: true });
const cdp = await launchChrome({ port: 9223, profileName: "cdp-shot-profile" });
try {
  for (const [name, height] of Object.entries(shots)) {
    const tab = await openTab(cdp, `${BASE}/index.html?shot=${name}`, { height });
    await tab.waitFor(`document.title.startsWith("SHOT-READY:")`, { timeout: 20000 });
    await sleep(400); // let images/fonts paint
    const { data } = await tab.s("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    await tab.close();
    console.log("ok ", name);
  }
} finally {
  cdp.close();
}
