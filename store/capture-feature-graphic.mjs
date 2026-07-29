// Renders store/feature-graphic.html at exactly 1024x500 and screenshots it.
// Reuses test/cdp.mjs (same headless-Chrome client as design/capture.mjs) — no new dependency.
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { launchChrome, openTab } from "../test/cdp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(HERE, "feature-graphic.html")).href;

const cdp = await launchChrome({ port: 9226, profileName: "feature-graphic-profile" });
try {
  const tab = await openTab(cdp, url, { width: 1024, height: 500 });
  await tab.evaluate("document.fonts.ready");
  const { data } = await tab.s("Page.captureScreenshot", { format: "png" });
  writeFileSync(path.join(HERE, "feature-graphic.png"), Buffer.from(data, "base64"));
  await tab.close();
  console.log("ok feature-graphic.png");
} finally {
  cdp.close();
}
