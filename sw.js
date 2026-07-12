// Service worker: cache the app shell so the app opens & runs fully offline.
// User data lives in IndexedDB (not here), so bumping CACHE only refreshes code/assets.

const CACHE = "us-date-tracker-v32";
const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./app.js",
  "./js/ui.js",
  "./js/db.js",
  "./js/store.js",
  "./js/sync.js",
  "./js/firebase-config.js",
  "./js/model.js",
  "./js/catalog.js",
  "./js/analytics.js",
  "./js/charts.js",
  "./js/suggest.js",
  "./js/exif.js",
  "./js/sample.js",
  "./js/gphotos.js",
  "./js/gphotos-config.js",
  "./js/feedback.js",
  "./js/feedback-config.js",
  "./js/push.js",
  "./js/push-config.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
];

self.addEventListener("message", e => {
  if (e.data === "GET_VERSION") e.ports[0].postMessage(CACHE);
});

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Web push: the partner's device sends this via FCM when they save a date.
// We render it ourselves (no FCM SW SDK) — the payload arrives under `notification`,
// with a relative `data.link` for the click target.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const n = d.notification || d;
  const title = n.title || "New date ♥";
  const body = n.body || "Your partner added a date";
  const link = (d.data && d.data.link) || d.link || "./#history";
  e.waitUntil(self.registration.showNotification(title, {
    body, icon: "./icons/icon.svg", badge: "./icons/icon.svg", tag: "new-date", data: { link },
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = e.notification.data?.link || "./#history";
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ("focus" in c) { c.navigate?.(link); return c.focus(); }
    }
    return clients.openWindow(link);
  }));
});

// Cache-first for same-origin GETs, falling back to network (and caching new shell files).
self.addEventListener("fetch", e => {
  const { request } = e;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(request).then(hit => hit || fetch(request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
