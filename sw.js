const CACHE_NAME = 'yt-bg-player-v1.7.1';
const ASSETS_TO_CACHE = [
  '/?v=1.7.1',
  '/index.html?v=1.7.1',
  '/style.css?v=1.7.1',
  '/app.js?v=1.7.1'
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

  // Network-First Strategy cho tất cả file tĩnh để đảm bảo F5 luôn tải code mới
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      });
    }).catch(() => {
      // Nếu mất mạng, fallback về Cache
      return caches.match(event.request, { ignoreSearch: true }).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback về index.html nếu request là navigate (load page)
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html', { ignoreSearch: true });
        }
      });
    })
  );
});
