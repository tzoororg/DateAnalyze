// Bootstrap: start the UI and register the service worker for offline use.
import { init } from "./js/ui.js";
import { autoEnableSync, completeRedirectSignIn } from "./js/store.js";

// Dev-only screenshot mode: ?shot=<state> seeds demo data and drives the UI
// into a named view so headless Chrome can capture it (see design/capture.mjs).
const shot = new URLSearchParams(location.search).get("shot");

(async () => {
  if (shot && shot !== "empty") await (await import("./js/dev-shots.js")).seed(shot);
  await completeRedirectSignIn().catch(err => console.warn("Redirect sign-in failed:", err));
  await autoEnableSync().catch(err => console.warn("Sync auto-enable failed, staying local:", err));
  await init();
  if (shot) await (await import("./js/dev-shots.js")).applyShot(shot);
})().catch(err => {
  console.error(err);
  document.getElementById("view").innerHTML =
    `<div class="empty"><div class="big">⚠️</div>Something went wrong starting the app.<br><span class="muted small">${err.message}</span></div>`;
});

if ("serviceWorker" in navigator && !shot) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW registration failed:", e));
  });
}
