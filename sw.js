const CACHE_NAME = 'yt-bg-player-v1.6.5';
const ASSETS_TO_CACHE = [
  '/?v=1.6.5',
  '/index.html?v=1.6.5',
  '/style.css?v=1.6.5',
  '/app.js?v=1.6.5'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Bỏ qua các API hoặc Stream (chỉ cache Static Assets)
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      // Trả về cache nếu có, ngược lại gọi network
      return response || fetch(event.request).then((fetchRes) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, fetchRes.clone());
          return fetchRes;
        });
      });
    }).catch(() => {
      // Trả về index.html nếu mất mạng
      if (event.request.mode === 'navigate') {
        return caches.match('/index.html', { ignoreSearch: true });
      }
    })
  );
});
