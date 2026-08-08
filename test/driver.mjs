// High-level app driver for agent-authored checks, on top of test/cdp.mjs.
// Boots the real app in headless Chrome at a ?shot= state and exposes a
// handful of helpers so one-off probes don't reinvent raw CDP evaluate().
//
//   import { openApp } from "./driver.mjs";
//   const app = await openApp("home");            // needs the dev server (see run.mjs)
//   await app.tap("#fab");
//   await app.fill("#f-title", "Picnic");
//   console.log(await app.viewText());
//   await app.close();                             // closes Chrome too
//
// States come from js/dev-shots.js (empty, home, history-list, history-detail,
// history-gallery, lightbox, insights, suggest, menu, intro, ...).
import { launchChrome, openTab, sleep } from "./cdp.mjs";

export async function openApp(state = "home", { baseUrl = "http://127.0.0.1:8000", height = 1700, port = 9226 } = {}) {
  const cdp = await launchChrome({ port, profileName: "cdp-driver-profile" });
  const tab = await openTab(cdp, `${baseUrl}/index.html?shot=${state}`, { height });
  await tab.waitFor(`document.title.startsWith("SHOT-READY:")`);

  const app = {
    tab, cdp,
    evaluate: tab.evaluate,
    waitFor: tab.waitFor,
    errors: tab.errors,
    // tap an element, wait for the UI to settle
    tap: async (sel, settle = 300) => {
      await tab.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
      await sleep(settle);
    },
    // set an input/textarea value and fire the input event ui.js listens for
    fill: (sel, value) => tab.evaluate(`{
      const el = document.querySelector(${JSON.stringify(sel)});
      el.value = ${JSON.stringify(String(value))};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }`),
    text: sel => tab.evaluate(`document.querySelector(${JSON.stringify(sel)})?.innerText || ""`),
    viewText: () => tab.evaluate(`document.querySelector("#view").innerText`),
    count: sel => tab.evaluate(`document.querySelectorAll(${JSON.stringify(sel)}).length`),
    visible: sel => tab.evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      return !!el && !el.classList.contains("hidden") && getComputedStyle(el).display !== "none";
    })()`),
    // switch app tab: home | history | insights | suggest
    goTab: async name => { await app.tap(`.tab[data-tab="${name}"]`, 400); },
    // read the persisted store from inside the page
    dates: () => tab.evaluate(`import("./js/store.js").then(s => s.getAllDates())`),
    close: () => cdp.close(),
  };
  return app;
}
