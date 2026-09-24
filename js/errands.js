/* HOURS — errands.js
   The one-tap buttons. Each errand knows its usual length (so a forgotten
   run is one tap to log) and, when it has a location, the road route from
   home — which is where every km and map line in the app comes from, because
   GO and I'M BACK are both tapped at home and GPS alone can't see the trip. */

import * as store from './store.js';
import { routeBetween } from './geo.js';

/* Fixed ids so the backfill can point at them. Locations from OpenStreetMap
   (Poppa Flock isn't in it — pin it from Settings when you're there). */
const DEFAULTS = [
  { id: 'e_allambie', name: 'Allambie shops',          minutes: 30, icon: 'bag',  lat: -33.7659,  lon: 151.2504 },
  { id: 'e_woolies',  name: 'Woolies Frenches Forest', minutes: 45, icon: 'cart', lat: -33.75022, lon: 151.22444 },
  { id: 'e_kfc',      name: 'KFC',                     minutes: 20, icon: 'food', group: 'takeaway', lat: -33.75155, lon: 151.2442 },
  { id: 'e_poppa',    name: 'Poppa Flock',             minutes: 25, icon: 'food', group: 'takeaway' },
  { id: 'e_dominos',  name: "Domino's Mona Vale",      minutes: 30, icon: 'food', group: 'takeaway', lat: -33.67779, lon: 151.3028 }
];

/* The runs from 10–23 Sept 2026 that were never logged. Local time. */
const BACKFILL = [
  ['bf_01', 'e_allambie', 10, 16, 10],
  ['bf_02', 'e_kfc',      11, 18, 35],
  ['bf_03', 'e_woolies',  12, 10, 20],
  ['bf_04', 'e_poppa',    13, 18, 10],
  ['bf_05', 'e_allambie', 14, 16, 25],
  ['bf_06', 'e_kfc',      16, 18, 45],
  ['bf_07', 'e_dominos',  18, 18, 55],
  ['bf_08', 'e_allambie', 19, 11,  5],
  ['bf_09', 'e_allambie', 21, 16,  5],
  ['bf_10', 'e_kfc',      22, 18, 30]
];

export function seed() {
  const s = store.get();
  if (s.settings.errandsSeeded) return;
  DEFAULTS.forEach(d => { if (!store.getErrand(d.id)) store.get().errands.push(store.newErrand(d)); });
  store.setting('errandsSeeded', true);
  store.save(true);
  store.emit('errands');
}

export function backfill() {
  const s = store.get();
  if (s.settings.backfilled) return 0;
  let added = 0;
  for (const [id, errandId, day, h, m] of BACKFILL) {
    const did = 'd_' + id;
    if (store.getDrive(did)) continue;
    const e = store.getErrand(errandId);
    const minutes = e ? e.minutes : 30;
    const startedAt = new Date(2026, 8, day, h, m, 0, 0).getTime();
    store.get().drives.push(store.newDrive({
      id: did, errandId, startedAt,
      endedAt: startedAt + minutes * 60000,
      durationMs: minutes * 60000,
      origin: 'backfill'
    }));
    added++;
  }
  store.setting('backfilled', true);
  store.save(true);
  store.emit('drives');
  return added;
}

/* --- lookups ---------------------------------------------------------- */

export function all() { return store.get().errands; }
export function main() { return all().filter(e => e.group !== 'takeaway'); }
export function takeaway() { return all().filter(e => e.group === 'takeaway'); }

export function labelFor(drive) {
  const e = drive.errandId && store.getErrand(drive.errandId);
  return e ? e.name : (drive.placeLabel || 'A run');
}
export function iconFor(drive) {
  const e = drive.errandId && store.getErrand(drive.errandId);
  return e ? e.icon : 'pin';
}

/* Round-trip km for one run: from its errand's route when known, otherwise
   whatever an old v1 drive measured. null = unknown. */
export function kmFor(drive) {
  const e = drive.errandId && store.getErrand(drive.errandId);
  if (e && e.routeKm) return e.routeKm * 2;
  if (drive.distanceKm) return drive.distanceKm;
  return null;
}

/* --- routes: home -> each errand, once per home ------------------------ */

let routing = false;

export async function resolveRoutes() {
  const home = store.get().settings.homeCoords;
  if (!home || routing || navigator.onLine === false) return;
  routing = true;
  const homeKey = home.lat.toFixed(4) + ',' + home.lon.toFixed(4);
  try {
    for (const e of all()) {
      if (e.lat === null || e.lat === undefined || e.routeFor === homeKey) continue;
      const r = await routeBetween(home, { lat: e.lat, lon: e.lon });
      if (!r) continue;
      store.updateErrand(e.id, {
        routeKm: Math.round(r.distanceKm * 10) / 10,
        routeGeom: r.geometry,
        routeFor: r.source === 'osrm' ? homeKey : null   // estimates get retried
      });
      await new Promise(res => setTimeout(res, 350));
    }
  } finally {
    routing = false;
  }
  store.emit('routes');
}

export function setLocation(id, coords) {
  store.updateErrand(id, {
    lat: coords ? coords.lat : null,
    lon: coords ? coords.lon : null,
    routeKm: null, routeGeom: null, routeFor: null
  });
  resolveRoutes();
}
