/* ==========================================================================
   sw.js — Service Worker（PWA 离线缓存）
   在 http/https 部署时生效；file:// 协议下不会被注册。
   ========================================================================== */
var CACHE = 'qzb-v1';
var ASSETS = [
  './',
  './index.html',
  './css/main.css',
  './js/db.js',
  './js/defaults.js',
  './js/store.js',
  './js/charts.js',
  './js/ui.js',
  './js/app.js',
  './icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); })
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
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (res) {
        if (res.ok && e.request.url.indexOf(self.location.origin) === 0) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      });
    })
  );
});
