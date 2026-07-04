// Service worker: cache the app shell so the app opens & runs fully offline.
// User data lives in IndexedDB (not here), so bumping CACHE only refreshes code/assets.

const CACHE = "us-date-tracker-v15";
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
  "./js/sample.js",
  "./js/feedback.js",
  "./js/feedback-config.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
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
