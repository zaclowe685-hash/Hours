/* HOURS — routines.js
   Recurring drives, TickTick style. A routine quietly writes the drives Zac
   takes every week, so the app is never empty in a lazy week.

   Two rules that matter: never generate a leg in the future, and never
   generate the same leg twice. */

import * as store from './store.js';
import { dayKey, keyToDate, startOfDay, DAY_MS, DAY_SHORT, fmtDur } from './stats.js';

export const CATCHUP_CAP_DAYS = 14;

function atTime(dayTs, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(dayTs);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function legExists(routineId, startedAt) {
  return store.get().drives.some(d => d.routineId === routineId && d.startedAt === startedAt);
}

function makeLeg(routine, startedAt) {
  const durationMs = Math.max(1, routine.legMinutes) * 60000;
  return store.newDrive({
    category: routine.category,
    tags: [...(routine.tags || [])],
    startedAt,
    endedAt: startedAt + durationMs,
    durationMs,
    placeId: routine.placeId || null,
    placeLabel: routine.placeLabel || routine.name,
    routeSource: 'none',
    origin: 'routine',
    routineId: routine.id
  });
}

/* Runs on every app open, and once a minute while it is open. */
export function catchUp(now = Date.now()) {
  const today = startOfDay(now);
  const todayK = dayKey(now);
  const state = store.get();
  let generated = 0;
  let capped = false;
  const firedToday = [];

  for (const r of state.routines) {
    if (!r.enabled || !r.days || !r.days.length) continue;

    const earliest = today - (CATCHUP_CAP_DAYS - 1) * DAY_MS;
    let from = earliest;
    if (r.lastGeneratedFor) {
      const after = startOfDay(keyToDate(r.lastGeneratedFor).getTime()) + DAY_MS;
      if (after > from) from = after;
      else if (after < earliest) capped = true;   // he was away longer than the cap
    }

    for (let day = from; day <= today; day += DAY_MS) {
      const weekday = new Date(day).getDay();
      if (!r.days.includes(weekday)) continue;

      const outStart = atTime(day, r.timeOfDay);
      if (outStart > now) continue;                       // never invent the future
      if (!legExists(r.id, outStart)) {
        store.addDrive(makeLeg(r, outStart));
        generated++;
        if (dayKey(outStart) === todayK) firedToday.push(r);
      }

      if (r.returnTrip) {
        const backStart = outStart + r.legMinutes * 60000 + (r.returnOffsetMinutes || 0) * 60000;
        if (backStart <= now && !legExists(r.id, backStart)) {
          store.addDrive(makeLeg(r, backStart));
          generated++;
        }
      }
    }
    store.updateRoutine(r.id, { lastGeneratedFor: todayK });
  }

  if (generated) store.emit('drives');
  return { generated, capped, firedToday };
}

/* Every drive a routine created on a given day — both legs. */
export function legsOnDay(routineId, ts) {
  const k = dayKey(ts);
  return store.get().drives.filter(d => d.routineId === routineId && dayKey(d.startedAt) === k);
}

/* "Didn't go" — wipes both legs of that day. Returns them so we can undo. */
export function didntGo(routineId, ts) {
  const legs = legsOnDay(routineId, ts);
  legs.forEach(d => store.deleteDrive(d.id));
  return legs;
}

export function drivesFromRoutine(routineId) {
  return store.get().drives.filter(d => d.routineId === routineId);
}

export function deleteRoutine(routineId, alsoDrives) {
  const drives = drivesFromRoutine(routineId);
  if (alsoDrives) drives.forEach(d => store.deleteDrive(d.id));
  store.deleteRoutine(routineId);
  return drives.length;
}

/* --- the live preview line in the editor ------------------------------ */

export function describe(r) {
  if (!r.days || !r.days.length) return 'Pick at least one day.';
  const days = [...r.days].sort().map(d => DAY_SHORT[d][0] + DAY_SHORT[d].slice(1, 3).toLowerCase());
  const dayText = days.length === 7 ? 'Every day'
    : 'Every ' + (days.length === 1 ? days[0] : days.slice(0, -1).join(', ') + ' & ' + days[days.length - 1]);

  const [h, m] = (r.timeOfDay || '00:00').split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = (h % 12) || 12;
  const timeText = `${h12}:${String(m).padStart(2, '0')}${ap}`;

  const legs = r.returnTrip ? 2 : 1;
  const weekMins = r.days.length * r.legMinutes * legs;

  let legText = r.returnTrip
    ? `two ${r.legMinutes}-minute legs, ${gapText(r.returnOffsetMinutes)} apart`
    : `one ${r.legMinutes}-minute leg`;

  return `${dayText} at ${timeText} — ${legText}. ${fmtDur(weekMins * 60000)} a week.`;
}

function gapText(mins) {
  const m = Math.max(0, mins || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
}

/* --- the one seeded routine (section 9.4 of the build prompt) --------- */

export function seed() {
  store.addRoutine({
    name: 'Gym',
    enabled: true,
    days: [3, 5],                 // Wednesday, Friday
    timeOfDay: '06:30',
    legMinutes: 7,
    returnTrip: true,
    returnOffsetMinutes: 75,
    category: 'chose',
    tags: ['gym'],
    placeLabel: 'The gym',
    placeId: null,
    lastGeneratedFor: dayKey(Date.now())   // starts today, no backfilled history
  });
}
