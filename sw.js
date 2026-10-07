// Offline support. The app shell and data are cached on install; the page is
// fetched network-first (so updates arrive quickly), everything else
// cache-first. Bump VERSION together with the ?v= tags in index.html and
// store.js when anything changes.
const VERSION = "v1";
const CACHE = `trip-kit-${VERSION}`;
const V = VERSION.replace("v", "v=");
const FILES = [
  "./",
  "index.html",
  `style.css?${V}`,
  `app.js?${V}`,
  "store.js",
  "signs.js",
  "pocket.js",
  "export.js",
  `data/signs.json?${V}`,
  `data/phrases.json?${V}`,
  `data/kanji.json?${V}`,
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("trip-kit-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    // Network first, fall back to the cached page when offline.
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("index.html", copy)); return res; })
        .catch(() => caches.match("index.html", { ignoreSearch: true })),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
