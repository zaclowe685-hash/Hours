/* HOURS — store.js
   Every byte of state lives in localStorage under one key, and every read and
   write goes through this file. Nothing else touches localStorage.

   v2 (2026-09-24): HOURS only counts time spent helping the family. Personal
   drives and routines are gone; errands (the one-tap buttons) are new. The
   whole v1 state is copied to BACKUP_KEY before the migration runs, so the
   old data can always be downloaded from Settings. */

const KEY = 'hours.v1';                 // unchanged, so the phone's data carries over
const BACKUP_KEY = 'hours.backup.pre-v2';
const SCHEMA_VERSION = 2;
const SAVE_DEBOUNCE_MS = 250;

/* crypto.randomUUID() only exists in a secure context. Served over plain http
   from a LAN IP (phone testing) it is undefined, so fall back. */
export function uid(prefix) {
  const raw = (self.crypto && self.crypto.randomUUID)
    ? self.crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  return prefix + '_' + raw;
}

function blank() {
  return {
    schemaVersion: SCHEMA_VERSION,
    drives: [],
    errands: [],
    liveDrive: null,
    settings: {
      name: 'Zac',              // the Proof screen says "<name> has spent…"
      homeCoords: null,
      homeRange: 'week',        // the home hero: week | month | all
      proofRange: 'all',
      lastOpened: Date.now(),
      seenV2: false,            // the one-time "what changed" sheet
      backfilled: false,        // the Sept 2026 catch-up runs, added once
      errandsSeeded: false,
      lastLat: null, lastLon: null
    }
  };
}

/* --- migrations -------------------------------------------------------
   Each entry takes state at version N and returns state at version N+1. */
const MIGRATIONS = {
  // v0/v1 had no errands, and counted personal drives (CHOSE) and routines
  // (the gym). Keep only the drives someone sent him on.
  1: (s) => {
    s.drives = (s.drives || [])
      .filter(d => d.category === 'sent' && d.origin !== 'routine')
      .map(d => ({ ...d, errandId: null }));
    delete s.routines;
    delete s.places;
    delete s.geocache;
    s.errands = [];
    return s;
  }
};
MIGRATIONS[0] = MIGRATIONS[1];

function migrate(raw) {
  let s = raw;
  let v = s.schemaVersion || 0;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (step) s = step(s);
    v = v === 0 ? 2 : v + 1;     // v0 and v1 share the same step
  }
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

/* --- state ------------------------------------------------------------ */

let state = blank();
let saveTimer = null;
const listeners = new Map();   // event -> Set(fn)

export function load() {
  let text = null, raw = null;
  try { text = localStorage.getItem(KEY); raw = JSON.parse(text || 'null'); }
  catch (e) { raw = null; }

  if (!raw || typeof raw !== 'object') {
    state = blank();
    return state;
  }

  // copy the pre-v2 data aside, once, before anything is dropped
  if ((raw.schemaVersion || 0) < 2) {
    try { if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, text); }
    catch (e) { /* quota — the migration still runs */ }
  }

  const base = blank();
  state = migrate({
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) }
  });
  if (!Array.isArray(state.drives))  state.drives = [];
  if (!Array.isArray(state.errands)) state.errands = [];
  save(true);
  return state;
}

export function get() { return state; }

export function save(immediate = false) {
  if (immediate) {
    clearTimeout(saveTimer);
    saveTimer = null;
    write();
    return;
  }
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; write(); }, SAVE_DEBOUNCE_MS);
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('HOURS: could not save', e);
  }
}

/* --- events ----------------------------------------------------------- */

export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => listeners.get(evt).delete(fn);
}
export function emit(evt, payload) {
  const set = listeners.get(evt);
  if (set) set.forEach(fn => fn(payload));
  if (evt !== '*') emit('*', { evt, payload });
}

/* --- drives (a "run": leaving home to walking back in) ---------------- */

export function newDrive(fields = {}) {
  const now = Date.now();
  return {
    id: uid('d'),
    errandId: null,
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    from: null,
    to: null,
    placeLabel: null,          // only old v1 drives use this
    distanceKm: null,          // only old v1 drives use this
    routeGeometry: null,       // only old v1 drives use this
    origin: 'live',            // live | quick | backfill | v1
    note: null,
    createdAt: now,
    updatedAt: now,
    ...fields
  };
}

export function addDrive(drive) {
  state.drives.push(drive);
  save(true);
  emit('drives');
  return drive;
}

export function getDrive(id) { return state.drives.find(d => d.id === id) || null; }

export function updateDrive(id, patch) {
  const d = getDrive(id);
  if (!d) return null;
  Object.assign(d, patch, { updatedAt: Date.now() });
  save(true);
  emit('drives');
  return d;
}

export function deleteDrive(id) {
  const i = state.drives.findIndex(d => d.id === id);
  if (i === -1) return null;
  const [gone] = state.drives.splice(i, 1);
  save(true);
  emit('drives');
  return gone;
}

export function restoreDrives(drives) {   // undo support
  drives.forEach(d => { if (!getDrive(d.id)) state.drives.push(d); });
  save(true);
  emit('drives');
}

/* Drives sorted newest first. */
export function drivesDesc() {
  return [...state.drives].sort((a, b) => b.startedAt - a.startedAt);
}

/* --- errands (the one-tap buttons) ------------------------------------ */

export function newErrand(fields = {}) {
  return {
    id: uid('e'),
    name: 'Errand',
    minutes: 30,
    group: null,               // 'takeaway' groups it under Get takeaway
    icon: 'pin',
    lat: null, lon: null,
    routeKm: null,             // one way, home -> here
    routeGeom: null,
    routeFor: null,            // the home it was routed from ("lat,lon")
    ...fields
  };
}

export function addErrand(fields) {
  const e = newErrand(fields);
  state.errands.push(e);
  save(true);
  emit('errands');
  return e;
}

export function getErrand(id) { return state.errands.find(e => e.id === id) || null; }

export function updateErrand(id, patch) {
  const e = getErrand(id);
  if (!e) return null;
  Object.assign(e, patch);
  save(true);
  emit('errands');
  return e;
}

export function deleteErrand(id) {
  const i = state.errands.findIndex(e => e.id === id);
  if (i === -1) return null;
  const [gone] = state.errands.splice(i, 1);
  // its runs keep their time and remember the name
  state.drives.forEach(d => { if (d.errandId === id) { d.errandId = null; d.placeLabel = gone.name; } });
  save(true);
  emit('errands'); emit('drives');
  return gone;
}

/* --- live drive (always written immediately) -------------------------- */

export function setLive(live) {
  state.liveDrive = live;
  save(true);
  emit('live');
}
export function patchLive(patch) {
  if (!state.liveDrive) return null;
  Object.assign(state.liveDrive, patch);
  save(true);
  emit('live');
  return state.liveDrive;
}
export function getLive() { return state.liveDrive; }

/* --- settings --------------------------------------------------------- */

export function setting(key, value) {
  if (value === undefined) return state.settings[key];
  state.settings[key] = value;
  save();
  emit('settings');
  return value;
}

/* --- export / import -------------------------------------------------- */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
}

export function preV2Backup() {
  try { return localStorage.getItem(BACKUP_KEY); } catch (e) { return null; }
}

export function importJSON(text, mode /* 'replace' | 'merge' */) {
  const incoming = JSON.parse(text);
  if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.drives)) {
    throw new Error('That file does not look like a HOURS backup.');
  }
  if ((incoming.schemaVersion || 0) > SCHEMA_VERSION) {
    throw new Error('That backup is from a newer version of HOURS.');
  }
  const clean = migrate({ ...blank(), ...incoming, settings: { ...blank().settings, ...(incoming.settings || {}) } });

  if (mode === 'replace') {
    state = clean;
  } else {
    const haveDrive = new Set(state.drives.map(d => d.id));
    clean.drives.forEach(d => { if (!haveDrive.has(d.id)) state.drives.push(d); });
    const haveErrand = new Set(state.errands.map(e => e.id));
    (clean.errands || []).forEach(e => { if (!haveErrand.has(e.id)) state.errands.push(e); });
  }
  state.liveDrive = null;   // never import a half-finished drive
  save(true);
  emit('drives'); emit('errands'); emit('settings');
  return { drives: state.drives.length, errands: state.errands.length };
}

export function wipe() {
  state = blank();
  state.settings.seenV2 = true;
  state.settings.backfilled = true;
  save(true);
  emit('drives'); emit('errands'); emit('settings');
}

export { SCHEMA_VERSION, KEY };
