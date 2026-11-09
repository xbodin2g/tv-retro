const CACHE_NAME = 'tv-retro-v4';

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

    // On retire les paramètres de requête pour le cache des JSON
    const cacheUrl = new URL(event.request.url);
    cacheUrl.search = '';

    // Réseau d'abord pour les fichiers importants et les données JSON
    const networkFirstTypes = [
        '.html',
        '.js',
        '.css',
        '.json',
        '.webmanifest'
    ];

    const shouldNetworkFirst =
        event.request.mode === 'navigate' ||
        networkFirstTypes.some(type => url.pathname.endsWith(type));

    if (shouldNetworkFirst) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    const responseClone = response.clone();

                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(cacheUrl, responseClone);
                    });

                    return response;
                })
                .catch(() => caches.match(cacheUrl))
        );

        return;
    }

    // Cache d'abord pour les autres ressources
    event.respondWith(
        caches.match(cacheUrl)
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
                        cache.put(cacheUrl, responseClone);
                    });

                    return networkResponse;
                });
            })
    );
});