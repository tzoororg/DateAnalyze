// Screenshot the redesign mocks at phone size. Usage: node design/redesign/capture-mocks.mjs
import { launchChrome, openTab, sleep } from "../../test/cdp.mjs";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const mocks = ["mock-a-love-letters", "mock-b-golden-hour", "mock-c-reading-nook", "mock-d-riviera"];

const cdp = await launchChrome({ port: 9231, profileName: "cdp-redesign-mocks" });
try {
  for (const m of mocks) {
    const tab = await openTab(cdp, "file:///" + path.join(dir, m + ".html").replace(/\\/g, "/"));
    await tab.waitFor("document.readyState === 'complete'");
    // let picsum images arrive
    await tab.waitFor("[...document.images].every(i => i.complete && i.naturalWidth > 0)", { timeout: 20000 })
      .catch(() => console.log(`${m}: some images did not load`));
    await sleep(300);
    const { data } = await tab.s("Page.captureScreenshot", { format: "png" });
    writeFileSync(path.join(dir, m + ".png"), Buffer.from(data, "base64"));
    console.log(`${m}.png written`);
    await tab.close();
  }
} finally {
  cdp.close();
}
