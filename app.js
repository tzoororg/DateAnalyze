// Bootstrap: start the UI and register the service worker for offline use.
import { init } from "./js/ui.js";
import { autoEnableSync, completeRedirectSignIn, setSyncDisabled } from "./js/store.js";
import { installCrashReporter } from "./js/crash-report.js";
import { cacheOutdated } from "./js/version.js";

installCrashReporter();

// Dev-only screenshot mode: ?shot=<state> seeds demo data and drives the UI
// into a named view so headless Chrome can capture it (see design/capture.mjs).
const shot = new URLSearchParams(location.search).get("shot");

// Remote kill switch: version.json at the site root, never cached by the SW.
// Fails open (returns null) on any network/parse error or timeout.
async function getVersionInfo() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store", signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// If the running SW's cache is older than minCache, force a one-shot refresh:
// unregister the SW, drop our caches, and reload. Guarded against reload loops.
async function forceRefreshIfStale(minCache) {
  if (!navigator.serviceWorker?.controller) return;
  const running = await new Promise(resolve => {
    const chan = new MessageChannel();
    const t = setTimeout(() => resolve(null), 1000);
    chan.port1.onmessage = e => { clearTimeout(t); resolve(e.data); };
    navigator.serviceWorker.controller.postMessage("GET_VERSION", [chan.port2]);
  });
  if (!cacheOutdated(running, minCache)) return;
  if (localStorage.getItem("vjsReloadedFor") === minCache) return;
  localStorage.setItem("vjsReloadedFor", minCache);
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.includes("us-date-tracker-")).map(k => caches.delete(k)));
  location.reload();
}

(async () => {
  if (shot && shot !== "empty") await (await import("./js/dev-shots.js")).seed(shot);
  if (!shot) {
    const v = await getVersionInfo();
    if (v?.syncDisabled) setSyncDisabled(true, v.message);
    if (v?.minCache) await forceRefreshIfStale(v.minCache);
  }
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
