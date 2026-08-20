/* HOURS — store.js
   Every byte of state lives in localStorage under one key, and every read and
   write goes through this file. Nothing else touches localStorage. */

const KEY = 'hours.v1';
const SCHEMA_VERSION = 1;
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
    places: [],
    routines: [],
    liveDrive: null,
    settings: {
      homeCoords: null,
      firstRun: true,
      lastOpened: Date.now(),
      lastCategory: null,      // finish sheet remembers the last pick
      seenTour: false,
      seenNameTip: false,
      geoDenied: false,        // never nag twice in a session
      nudgeDismissedOn: null,  // YYYY-MM-DD
      routineNoticeOn: null,   // YYYY-MM-DD
      lastLat: null, lastLon: null   // last known fix, for centring the map
    },
    geocache: {}               // "lat,lon" (4dp) -> place label
  };
}

/* --- migrations -------------------------------------------------------
   v1 ships with an empty chain, but the mechanism is here so Zac's data
   survives every future change. Each entry takes state at version N and
   returns state at version N+1. */
const MIGRATIONS = {
  // 1: (s) => { ...; return s; }
};

function migrate(raw) {
  let s = raw;
  let v = s.schemaVersion || 0;
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) break;
    s = step(s);
    v++;
  }
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

/* --- state ------------------------------------------------------------ */

let state = blank();
let saveTimer = null;
const listeners = new Map();   // event -> Set(fn)

export function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); }
  catch (e) { raw = null; }    // REVIEW: corrupt JSON silently resets to empty; no backup copy is kept

  if (!raw || typeof raw !== 'object') {
    state = blank();
    return state;
  }
  const base = blank();
  state = migrate({
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    geocache: { ...(raw.geocache || {}) }
  });
  if (!Array.isArray(state.drives))   state.drives = [];
  if (!Array.isArray(state.places))   state.places = [];
  if (!Array.isArray(state.routines)) state.routines = [];
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
    // REVIEW: localStorage full (quota) fails silently — no user-facing warning
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

/* --- drives ----------------------------------------------------------- */

export function newDrive(fields = {}) {
  const now = Date.now();
  return {
    id: uid('d'),
    category: null,
    tags: [],
    startedAt: now,
    endedAt: now,
    durationMs: 0,
    from: null,
    to: null,
    placeId: null,
    placeLabel: null,
    distanceKm: null,
    routeGeometry: null,
    routeSource: 'none',
    origin: 'manual',
    routineId: null,
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
  save();
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
  drives.forEach(d => state.drives.push(d));
  save(true);
  emit('drives');
}

/* Drives sorted newest first. */
export function drivesDesc() {
  return [...state.drives].sort((a, b) => b.startedAt - a.startedAt);
}

/* --- places ----------------------------------------------------------- */

export function addPlace(fields) {
  const p = {
    id: uid('p'),
    label: 'Unnamed stop',
    lat: null, lon: null,
    visits: 0,
    totalMs: 0,
    isHome: false,
    createdAt: Date.now(),
    ...fields
  };
  state.places.push(p);
  save();
  emit('places');
  return p;
}

export function getPlace(id) { return state.places.find(p => p.id === id) || null; }

export function updatePlace(id, patch) {
  const p = getPlace(id);
  if (!p) return null;
  Object.assign(p, patch);
  save();
  emit('places');
  return p;
}

/* --- routines --------------------------------------------------------- */

export function addRoutine(fields) {
  const r = {
    id: uid('r'),
    name: 'New routine',
    enabled: true,
    days: [],
    timeOfDay: '07:00',
    legMinutes: 10,
    returnTrip: false,
    returnOffsetMinutes: 60,
    category: 'chose',
    tags: [],
    placeLabel: '',
    placeId: null,
    lastGeneratedFor: null,
    ...fields
  };
  state.routines.push(r);
  save(true);
  emit('routines');
  return r;
}

export function updateRoutine(id, patch) {
  const r = state.routines.find(x => x.id === id);
  if (!r) return null;
  Object.assign(r, patch);
  save(true);
  emit('routines');
  return r;
}

export function deleteRoutine(id) {
  const i = state.routines.findIndex(r => r.id === id);
  if (i === -1) return null;
  const [gone] = state.routines.splice(i, 1);
  save(true);
  emit('routines');
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

/* --- geocode cache ---------------------------------------------------- */

export function cacheKey(lat, lon) { return lat.toFixed(4) + ',' + lon.toFixed(4); }
export function cachedName(lat, lon) { return state.geocache[cacheKey(lat, lon)] || null; }
export function cacheName(lat, lon, label) {
  state.geocache[cacheKey(lat, lon)] = label;
  save();
}

/* --- export / import -------------------------------------------------- */

export function exportJSON() {
  return JSON.stringify(state, null, 2);
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
    const havePlace = new Set(state.places.map(p => p.id));
    clean.places.forEach(p => { if (!havePlace.has(p.id)) state.places.push(p); });
    const haveRoutine = new Set(state.routines.map(r => r.id));
    clean.routines.forEach(r => { if (!haveRoutine.has(r.id)) state.routines.push(r); });
    state.geocache = { ...clean.geocache, ...state.geocache };
  }
  state.liveDrive = null;   // never import someone else's half-finished drive
  save(true);
  emit('drives'); emit('places'); emit('routines'); emit('settings');
  return { drives: state.drives.length, places: state.places.length, routines: state.routines.length };
}

export function wipe() {
  state = blank();
  state.settings.firstRun = false;
  state.settings.seenTour = true;
  save(true);
  emit('drives'); emit('places'); emit('routines'); emit('settings');
}

export { SCHEMA_VERSION, KEY };
