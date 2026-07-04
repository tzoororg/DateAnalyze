// Bootstrap: start the UI and register the service worker for offline use.
import { init } from "./js/ui.js";
import { autoEnableSync } from "./js/store.js";

autoEnableSync()
  .catch(err => console.warn("Sync auto-enable failed, staying local:", err))
  .then(init)
  .catch(err => {
    console.error(err);
    document.getElementById("view").innerHTML =
      `<div class="empty"><div class="big">⚠️</div>Something went wrong starting the app.<br><span class="muted small">${err.message}</span></div>`;
  });

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(e => console.warn("SW registration failed:", e));
  });
}
