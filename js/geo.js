/* HOURS — geo.js
   One GPS fix when GO is tapped (it becomes home if home isn't set yet), and
   real road routes from OSRM between home and each errand.
   Nothing here ever blocks the UI. */

import * as store from './store.js';

const GEO_OPTS = { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 };
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
const NET_TIMEOUT_MS = 5000;

/* --- one GPS fix ------------------------------------------------------ */

export function getFix() {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({ ok: false, status: 'unavailable' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        store.setting('lastLat', fix.lat);
        store.setting('lastLon', fix.lon);
        resolve({ ok: true, status: 'ok', coords: fix, accuracy: pos.coords.accuracy });
      },
      err => {
        const status = err.code === 1 ? 'denied' : 'unavailable';
        if (status === 'denied') store.setting('geoDenied', true);
        resolve({ ok: false, status });
      },
      GEO_OPTS
    );
  });
}

/* --- maths ------------------------------------------------------------ */

export function haversineKm(a, b) {
  if (!a || !b) return null;
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function metresBetween(a, b) {
  const km = haversineKm(a, b);
  return km === null ? null : km * 1000;
}

/* A gentle arc between two pins, for when we could not get a real route. */
export function curveBetween(a, b, steps = 24) {
  const mid = {
    lat: (a.lat + b.lat) / 2 + (b.lon - a.lon) * 0.12,
    lon: (a.lon + b.lon) / 2 - (b.lat - a.lat) * 0.12
  };
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * a.lat + 2 * u * t * mid.lat + t * t * b.lat,
      u * u * a.lon + 2 * u * t * mid.lon + t * t * b.lon
    ]);
  }
  return pts;
}

function withTimeout(url, ms = NET_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal })
    .finally(() => clearTimeout(timer));
}

/* --- routing ---------------------------------------------------------- */
/* Returns { distanceKm, geometry: [[lat,lon]...], source: 'osrm'|'estimate' } */

export async function routeBetween(from, to) {
  if (!from || !to) return null;
  const url = `${OSRM}${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`;
  try {
    const res = await withTimeout(url);
    if (!res.ok) throw new Error('OSRM ' + res.status);
    const data = await res.json();
    const route = data && data.routes && data.routes[0];
    if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates)) {
      throw new Error('no route');
    }
    return {
      distanceKm: route.distance / 1000,
      geometry: route.geometry.coordinates.map(([lon, lat]) => [lat, lon]),
      source: 'osrm'
    };
  } catch (e) {
    const straight = haversineKm(from, to);
    if (straight === null) return null;
    return {
      distanceKm: straight * 1.25,
      geometry: curveBetween(from, to),
      source: 'estimate'
    };
  }
}

export function online() { return navigator.onLine !== false; }
