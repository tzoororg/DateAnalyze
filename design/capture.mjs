// Captures a screenshot of every app view (and roadmap "after" mocks) via
// Chrome DevTools Protocol + the ?shot= dev hook (js/dev-shots.js), which sets
// document.title to "SHOT-READY:<state>" when the view has settled.
// Usage: node design/capture.mjs [baseUrl]   (default http://127.0.0.1:8163)
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv[2] || "http://127.0.0.1:8163";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "shots");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9223;

// shot name -> viewport height (390 wide = phone)
const SHOTS = {
  "empty": 844, "home": 1000, "log": 1750, "menu": 900,
  "history-list": 1250, "history-detail": 1450, "history-gallery": 1000,
  "lightbox": 844, "insights": 2750, "suggest": 1650,
  "after-wrapped": 1300, "after-wishlist-suggest": 1750, "after-wishlist-history": 1500,
  "after-reminders": 900, "after-datenight-home": 1150, "after-datenight-active": 1150,
  "after-forecast": 1300, "after-value": 1200, "after-interview": 1300,
  "after-capsule-log": 2200, "after-capsule-home": 1100, "after-match": 1750,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- minimal CDP client ----
let ws, msgId = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res, rej) => pending.set(id, { res, rej }));
}
async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      ws = new WebSocket(v.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) {
          const { res, rej } = pending.get(m.id);
          pending.delete(m.id);
          m.error ? rej(new Error(m.error.message)) : res(m.result);
        }
      };
      return;
    } catch { await sleep(300); }
  }
  throw new Error("could not reach Chrome DevTools");
}

async function capture(name, height) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s("Emulation.setDeviceMetricsOverride", { width: 390, height, deviceScaleFactor: 1, mobile: true });
  await s("Page.enable");
  await s("Page.navigate", { url: `${BASE}/index.html?shot=${name}` });
  for (let i = 0; i < 100; i++) {                       // wait for the ready signal
    const { result } = await s("Runtime.evaluate", { expression: "document.title", returnByValue: true });
    if (String(result.value).startsWith("SHOT-READY:")) break;
    await sleep(200);
  }
  await sleep(400);                                     // let images/fonts paint
  const { data } = await s("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
  await send("Target.closeTarget", { targetId });
  console.log("ok ", name);
}

mkdirSync(OUT, { recursive: true });
const profile = path.join(process.env.TEMP || "/tmp", "cdp-shot-profile");
rmSync(profile, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

try {
  await connect();
  for (const [name, h] of Object.entries(SHOTS)) await capture(name, h);
} finally {
  chrome.kill();
  ws?.close();
}
