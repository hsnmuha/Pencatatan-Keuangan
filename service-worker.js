const CACHE_NAME = "catatin-dynamic-v1";

// Daftar file yang akan disimpan di cache HP
const PRE_CACHE_ASSETS = [
  "/Pencatatan-Keuangan/",
  "/Pencatatan-Keuangan/index.html",
  "/Pencatatan-Keuangan/style.css",
  "/Pencatatan-Keuangan/app.js",
  "/Pencatatan-Keuangan/manifest.json",
  "/Pencatatan-Keuangan/icon192.png",
  "/Pencatatan-Keuangan/icon512.png",
  "/Pencatatan-Keuangan/icon3.png"
];

// 1. Install Service Worker & Cache Aset Awal
self.addEventListener("install", event => {
  self.skipWaiting(); // Langsung aktifkan SW baru tanpa menunggu
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRE_CACHE_ASSETS);
    })
  );
});

// 2. Activate & Bersihkan Cache Lama (Jika ganti nama cache)
self.addEventListener("activate", event => {
  self.clients.claim(); // Ambil alih kontrol halaman segera
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// 3. Fetch Strategy: Network First (Internet Dulu -> Baru Cache)
// Ini agar kalau ada update di GitHub, user langsung dapat versinya saat online.
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Skenario Online: Ambil dari internet
        // 1. Cek apakah respon valid
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // 2. Jika valid, simpan copy-nya ke cache (update cache otomatis)
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      })
      .catch(() => {
        // Skenario Offline: Ambil dari cache
        return caches.match(event.request);
      })
  );
});
