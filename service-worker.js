const CACHE_NAME = "catatin-cache-v1";

const ASSETS = [
  "/Pencatatan-Keuangan/",
  "/Pencatatan-Keuangan/index.html",
  "/Pencatatan-Keuangan/style.css",
  "/Pencatatan-Keuangan/app.js",
  "/Pencatatan-Keuangan/manifest.json",
  "/Pencatatan-Keuangan/icon192.png",
  "/Pencatatan-Keuangan/icon512.png"
];

// Install SW dan cache aset
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate dan hapus cache lama
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cacheRes => {
      return (
        cacheRes ||
        fetch(event.request).catch(() => caches.match("/Pencatatan-Keuangan/index.html"))
      );
    })
  );
});
