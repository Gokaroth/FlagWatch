
const CACHE_NAME = 'beach-safety-v3'; // Incremented version to force update
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
];

// Install the service worker and cache the static assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// Clean up old caches
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// Serve cached content when offline, otherwise try network first
self.addEventListener('fetch', event => {
    // For app-owned assets, use network-first strategy
    if (event.request.url.startsWith(self.location.origin)) {
        event.respondWith(
            fetch(event.request).then(response => {
                // If the fetch is successful, update the cache
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            }).catch(() => {
                // If the network fails, serve from cache
                return caches.match(event.request);
            })
        );
    } else {
        // For third-party assets (like Leaflet), use cache-first strategy
        event.respondWith(
            caches.match(event.request).then(response => {
                return response || fetch(event.request);
            })
        );
    }
});
