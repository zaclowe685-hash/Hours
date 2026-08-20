/* HOURS — drive.js
   IDLE -> DRIVING -> IDLE (plus the finish sheet).

   The stopwatch is a stored timestamp, never a running counter. Elapsed is
   always Date.now() - startedAt, computed fresh, so it is exact whether the
   phone was locked for 7 minutes or the tab was killed for 3 hours. */

import * as store from './store.js';
import { getFix, routeBetween, metresBetween } from './geo.js';
import { resolveDestination, matchPlace } from './places.js';

export const STALE_MS = 6 * 60 * 60 * 1000;   // 6 hours
export const MIN_DRIVE_MS = 20 * 1000;        // under 20 s, ask before saving
export const DRIFT_M = 120;                   // closer than this = stayed local

/* --- state ------------------------------------------------------------ */

export function isDriving() { return !!store.getLive(); }

export function elapsedMs() {
  const live = store.getLive();
  return live ? Math.max(0, Date.now() - live.startedAt) : 0;
}

export function isStale() {
  const live = store.getLive();
  return !!live && (Date.now() - live.startedAt) > STALE_MS;
}

/* --- starting --------------------------------------------------------- */

export function start() {
  if (store.getLive()) return store.getLive();   // a second GO is harmless

  // 1. the timestamp goes down first, before anything can fail
  store.setLive({ startedAt: Date.now(), from: null, geoStatus: 'pending' });

  // 2. GPS lands whenever it lands; the drive is already running
  getFix().then(fix => {
    if (!store.getLive()) return;               // he finished before it landed
    if (fix.ok) store.patchLive({ from: fix.coords, geoStatus: 'ok' });
    else        store.patchLive({ geoStatus: fix.status });
  });

  return store.getLive();
}

/* --- finishing -------------------------------------------------------- */
/* Returns { short, drive }. When short is true the drive is NOT saved — the
   UI asks first. Call commit(drive) to keep it. */

export function finish(endedAtOverride) {
  const live = store.getLive();
  if (!live) return null;

  const endedAt = endedAtOverride || Date.now();
  const durationMs = Math.max(0, endedAt - live.startedAt);

  const drive = store.newDrive({
    category: store.get().settings.lastCategory,   // remembered from last time
    startedAt: live.startedAt,
    endedAt,
    durationMs,
    from: live.from || null,
    to: null,
    routeSource: live.from ? 'pending' : 'none',
    origin: 'manual'
  });

  store.setLive(null);

  const short = durationMs < MIN_DRIVE_MS;
  if (!short) commit(drive);
  return { short, drive };
}

/* Saves the drive and kicks off the end fix, naming and routing in the
   background. Nothing here blocks the UI. */
export function commit(drive) {
  if (!store.getDrive(drive.id)) store.addDrive(drive);

  getFix().then(async fix => {
    if (fix.ok) {
      store.updateDrive(drive.id, { to: fix.coords });
    } else {
      store.updateDrive(drive.id, { routeSource: 'none' });
    }
    const fresh = store.getDrive(drive.id);
    if (!fresh) return;                       // deleted while we were waiting
    await nameIt(fresh);
    resolveRoute(fresh.id);
  });

  return drive;
}

async function nameIt(drive) {
  // Ended within 120 m of where he started: don't ask a server about his house.
  if (drive.from && drive.to && stayedLocal(drive)) {
    const hit = matchPlace(drive.to);
    if (hit) {
      store.updateDrive(drive.id, { placeId: hit.id, placeLabel: hit.label });
      store.updatePlace(hit.id, { visits: (hit.visits || 0) + 1, totalMs: (hit.totalMs || 0) + drive.durationMs });
    } else {
      store.updateDrive(drive.id, { placeLabel: 'Round trip' });
    }
    return;
  }
  await resolveDestination(drive);
}

export function stayedLocal(drive) {
  if (!drive.from || !drive.to) return false;
  const m = metresBetween(drive.from, drive.to);
  return m !== null && m < DRIFT_M;
}

/* --- routing (lazy, never blocks) ------------------------------------- */

export async function resolveRoute(driveId) {
  const drive = store.getDrive(driveId);
  if (!drive) return;
  if (!drive.from || !drive.to) {
    store.updateDrive(driveId, { routeSource: 'none', distanceKm: null, routeGeometry: null });
    return;
  }
  if (stayedLocal(drive)) {
    // GPS drift, not a journey. No line, no distance.
    store.updateDrive(driveId, { routeSource: 'none', distanceKm: null, routeGeometry: null });
    return;
  }
  if (navigator.onLine === false) {
    store.updateDrive(driveId, { routeSource: 'pending' });   // retried next open
    return;
  }

  const route = await routeBetween(drive.from, drive.to);
  if (!route) {
    store.updateDrive(driveId, { routeSource: 'none' });
    return;
  }
  store.updateDrive(driveId, {
    distanceKm: Math.round(route.distanceKm * 10) / 10,
    routeGeometry: route.geometry,
    routeSource: route.source
  });
  store.emit('route', driveId);
}

/* Anything left 'pending' from an offline drive gets another go on open. */
export function retryPendingRoutes() {
  if (navigator.onLine === false) return;
  store.get().drives
    .filter(d => d.routeSource === 'pending' && d.from && d.to)
    .slice(0, 20)                       // don't stampede OSRM after a long trip
    .forEach((d, i) => setTimeout(() => resolveRoute(d.id), i * 400));
}

/* --- the stale-drive recovery ----------------------------------------- */

/* Finish a forgotten drive with an explicit duration (or "now"). */
export function recoverWith(durationMs) {
  const live = store.getLive();
  if (!live) return null;
  const endedAt = durationMs ? live.startedAt + durationMs : Date.now();
  const drive = store.newDrive({
    category: store.get().settings.lastCategory,
    startedAt: live.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - live.startedAt),
    from: live.from || null,
    routeSource: live.from ? 'pending' : 'none',
    origin: 'manual'
  });
  store.setLive(null);
  store.addDrive(drive);
  // no end fix — he is not there any more, so the route stays unknown
  store.updateDrive(drive.id, { routeSource: 'none' });
  if (!drive.placeLabel) store.updateDrive(drive.id, { placeLabel: 'Unnamed stop' });
  return drive;
}

export function binLive() {
  store.setLive(null);
}
