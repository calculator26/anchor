/* Anchor service worker — cache-first app shell for full offline use. */
var CACHE = 'anchor-v1.0.0';
var SHELL = [
  './',
  './index.html',
  './anchor.css',
  './js/fsrs.js',
  './js/store.js',
  './js/seed.js',
  './js/ui-extra.js',
  './js/ui-main.js',
  './manifest.webmanifest',
  './icons/anchor.svg',
  './icons/anchor-maskable.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    })
  );
});
