// ==========================================================================
// CFB PROPHET - PASSIVE CACHE BYPASS (Direct Live Network Fetching)
// ==========================================================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

// Always pass through directly to live network
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
