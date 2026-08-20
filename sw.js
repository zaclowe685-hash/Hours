/* HOURS — service worker.
   Cache-first for the app shell so it opens and logs a drive with no network,
   revalidating in the background. Map tiles, OSRM and Nominatim are never
   cached — a stale route is worse than no route. */

const CACHE_VERSION = 'hours-v1';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/reset.css',
  'css/theme.css',
  'css/app.css',
  'js/main.js',
  'js/store.js',
  'js/drive.js',
  'js/geo.js',
  'js/places.js',
  'js/routines.js',
  'js/stats.js',
  'js/ui/screens.js',
  'js/ui/home.js',
  'js/ui/driving.js',
  'js/ui/finish.js',
  'js/ui/log.js',
  'js/ui/map.js',
  'js/ui/insights.js',
  'js/ui/routinesUI.js',
  'js/ui/settings.js',
  'js/ui/widgets.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

const NEVER_CACHE = [
  'basemaps.cartocdn.com',
  'router.project-osrm.org',
  'nominatim.openstreetmap.org'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (NEVER_CACHE.some(host => req.url.includes(host))) return;

  e.respondWith(
    caches.match(req).then(hit => {
      const live = fetch(req).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || live;
    })
  );
});
