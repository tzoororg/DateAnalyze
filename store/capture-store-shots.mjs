// One-off generator for Play Store phone screenshots (1080x1920, PNG).
// Renders the app at a real phone CSS viewport (390x693, ~9:16) and scales the
// screenshot output via deviceScaleFactor, so the UI looks exactly like the
// live app, not a stretched tablet layout. Reuses test/cdp.mjs (same client
// design/capture.mjs uses) — no new dependency.
// Usage: node store/capture-store-shots.mjs [baseUrl]
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { launchChrome, sleep } from "../test/cdp.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8000";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "screenshots");
const CSS_W = 390, CSS_H = 693, SCALE = 1080 / CSS_W; // -> ~1080x1920 output

// order = listing order
const SHOTS = [
  ["01-home", "home"],
  ["02-log", "log"],
  ["03-history-gallery", "history-gallery"],
  ["04-insights", "insights"],
  ["05-suggest", "suggest"],
  ["06-history-list", "history-list"],
];

mkdirSync(OUT, { recursive: true });
const cdp = await launchChrome({ port: 9225, profileName: "store-shot-profile" });
try {
  for (const [file, shot] of SHOTS) {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (method, params) => cdp.send(method, params, sessionId);
    await s("Emulation.setDeviceMetricsOverride", {
      width: CSS_W, height: CSS_H, deviceScaleFactor: SCALE, mobile: true,
    });
    await s("Page.enable");
    await s("Runtime.enable");
    await s("Page.navigate", { url: `${BASE}/index.html?shot=${shot}` });

    const evaluate = async expression => {
      const { result } = await s("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      return result.value;
    };
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      if (await evaluate(`document.title.startsWith("SHOT-READY:")`)) break;
      await sleep(200);
    }
    await sleep(2500); // let the backup-nudge toast (2.2s autohide) clear before capturing
    const { data } = await s("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(OUT, `${file}.png`), Buffer.from(data, "base64"));
    await cdp.send("Target.closeTarget", { targetId });
    console.log("ok", file, shot);
  }
} finally {
  cdp.close();
}
