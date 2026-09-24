/* HOURS — service worker.
   Network-first for the app's own files (so an update shows up on the next
   open) with the cache as the no-signal fallback; cache-first for fonts and
   Leaflet. Map tiles, OSRM and Nominatim are never
   cached — a stale route is worse than no route. */

const CACHE_VERSION = 'hours-v2';

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
  'js/errands.js',
  'js/geo.js',
  'js/stats.js',
  'js/ui/screens.js',
  'js/ui/home.js',
  'js/ui/driving.js',
  'js/ui/sheets.js',
  'js/ui/proof.js',
  'js/ui/runs.js',
  'js/ui/map.js',
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
  'services.arcgisonline.com',
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

  const own = new URL(req.url).origin === self.location.origin;
  const save = res => {
    if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
      const copy = res.clone();
      caches.open(CACHE_VERSION).then(c => c.put(req, copy));
    }
    return res;
  };

  // the app's own files: network first (3 s), cache when there's no signal
  if (own) {
    e.respondWith(new Promise(resolve => {
      let settled = false;
      const fallback = () => caches.match(req).then(hit => hit || caches.match('index.html'));
      const t = setTimeout(() => { settled = true; resolve(fallback()); }, 3000);
      fetch(req).then(res => { clearTimeout(t); save(res); if (!settled) resolve(res); })
        .catch(() => { clearTimeout(t); if (!settled) resolve(fallback()); });
    }));
    return;
  }

  // fonts and Leaflet: cache first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(save).catch(() => hit)));
});
