// Network-first service worker so the game also works offline after the first visit.
const CACHE = 'nitro-strikers-v1';
const CORE = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './vendor/three.module.min.js',
  './js/main.js', './js/game.js', './js/config.js', './js/sdf.js', './js/ball.js', './js/car.js',
  './js/ai.js', './js/camera.js', './js/arenaView.js', './js/models.js', './js/effects.js',
  './js/audio.js', './js/input.js', './js/hud.js', './js/replay.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
