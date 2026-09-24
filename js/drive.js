/* HOURS — drive.js
   IDLE -> OUT ON A RUN -> IDLE (plus the "what was it?" sheet).

   The stopwatch is a stored timestamp, never a running counter. Elapsed is
   always Date.now() - startedAt, computed fresh, so it is exact whether the
   phone was locked for 7 minutes or the tab was killed for 3 hours.

   A run is timed from leaving home (GO) to walking back in (I'M BACK) —
   shopping, queueing and waiting in the car park all count. */

import * as store from './store.js';
import * as errands from './errands.js';
import { getFix } from './geo.js';

export const STALE_MS = 6 * 60 * 60 * 1000;   // 6 hours: he forgot to tap I'M BACK
export const MIN_DRIVE_MS = 30 * 1000;        // under 30 s, ask before saving

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

export function start(errandId = null) {
  if (store.getLive()) return store.getLive();   // a second GO is harmless

  // 1. the timestamp goes down first, before anything can fail
  store.setLive({ startedAt: Date.now(), from: null, errandId });

  // 2. GPS lands whenever it lands. GO is always tapped at home, so the
  //    first fix ever becomes home — nobody has to find a setting for it.
  getFix().then(fix => {
    if (!fix.ok) return;
    if (store.getLive()) store.patchLive({ from: fix.coords });
    if (!store.get().settings.homeCoords) {
      store.setting('homeCoords', fix.coords);
      errands.resolveRoutes();
    }
  });

  return store.getLive();
}

/* --- finishing -------------------------------------------------------- */
/* Returns { short, drive }. When short is true the drive is NOT saved — the
   UI asks first and calls keep(drive) if he wants it. */

export function finish(endedAtOverride) {
  const live = store.getLive();
  if (!live) return null;

  const endedAt = endedAtOverride || Date.now();
  const drive = store.newDrive({
    errandId: live.errandId || null,
    startedAt: live.startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - live.startedAt),
    from: live.from || null,
    origin: 'live'
  });

  store.setLive(null);
  const short = drive.durationMs < MIN_DRIVE_MS;
  if (!short) store.addDrive(drive);
  return { short, drive };
}

export function keep(drive) {
  if (!store.getDrive(drive.id)) store.addDrive(drive);
  return drive;
}

export function setErrand(live, errandId) {
  if (live) store.patchLive({ errandId });
}

/* Finish a forgotten run with an explicit length. */
export function recoverWith(durationMs) {
  const live = store.getLive();
  if (!live) return null;
  const drive = store.newDrive({
    errandId: live.errandId || null,
    startedAt: live.startedAt,
    endedAt: live.startedAt + durationMs,
    durationMs,
    from: live.from || null,
    origin: 'live'
  });
  store.setLive(null);
  store.addDrive(drive);
  return drive;
}

export function binLive() {
  store.setLive(null);
}
