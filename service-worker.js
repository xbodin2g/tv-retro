const CACHE_NAME = 'tv-retro-v3';

const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// Installation
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting())
    );
});

// Activation
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Pour les données JSON, toujours essayer le réseau d'abord
    if (url.pathname.includes('/data/') || url.pathname.endsWith('.json')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });

                    return response;
                })
                .catch(() => caches.match(event.request))
        );

        return;
    }

    // Pour le reste, cache d'abord
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request).then(networkResponse => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }

                    const responseClone = networkResponse.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });

                    return networkResponse;
                });
            })
    );
});