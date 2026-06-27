// Bootstrap: start the UI and register the service worker for offline use.
import { init } from "./js/ui.js";

init().catch(err => {
  console.error(err);
  document.getElementById("view").innerHTML =
    `<div class="empty"><div class="big">⚠️</div>Something went wrong starting the app.<br><span class="muted small">${err.message}</span></div>`;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW registration failed:", e));
  });
}
