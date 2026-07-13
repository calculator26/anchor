/* Anchor service worker — network-first with offline fallback.
   Online users always get the newest deploy; offline still works from cache.
   Supabase API calls (auth + sync) are never intercepted — they go straight
   to the network. The Supabase JS library is cached so a signed-in user can
   still boot the app with no connection. */
var CACHE = 'anchor-v3';
var SUPABASE_LIB = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
var SHELL = [
  './',
  './index.html',
  './anchor.css',
  './js/fsrs.js',
  './js/store.js',
  './js/seed.js',
  './js/config.js',
  './js/cloud.js',
  './js/ui-extra.js',
  './js/ui-main.js',
  './manifest.webmanifest',
  './icons/anchor.svg',
  './icons/anchor-maskable.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(SHELL).then(function () {
        return c.add(SUPABASE_LIB).catch(function () {}); // best-effort, non-fatal
      });
    }).then(function () { return self.skipWaiting(); })
  );
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
  var sameOrigin = new URL(e.request.url).origin === location.origin;
  if (!sameOrigin && e.request.url !== SUPABASE_LIB) return; // e.g. Supabase API → network only
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        if (hit) return hit;
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
