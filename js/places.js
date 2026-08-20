/* HOURS — places.js
   Naming the destination, in priority order:
     1. a saved place within 150 m   (no network at all)
     2. home within 150 m            (a round trip)
     3. Nominatim, once, cached
   Renaming a stop creates or updates a saved place, so the next drive there
   is recognised instantly by rule 1. */

import * as store from './store.js';
import { metresBetween, reverseGeocode } from './geo.js';

export const MATCH_RADIUS_M = 150;

export function matchPlace(coords, radius = MATCH_RADIUS_M) {
  if (!coords) return null;
  let best = null, bestD = Infinity;
  for (const p of store.get().places) {
    if (p.lat === null || p.lon === null) continue;
    const d = metresBetween(coords, { lat: p.lat, lon: p.lon });
    if (d !== null && d <= radius && d < bestD) { best = p; bestD = d; }
  }
  return best;
}

export function isHome(coords, radius = MATCH_RADIUS_M) {
  const home = store.get().settings.homeCoords;
  if (!home || !coords) return false;
  const d = metresBetween(coords, home);
  return d !== null && d <= radius;
}

function countVisit(place, drive) {
  store.updatePlace(place.id, {
    visits: (place.visits || 0) + 1,
    totalMs: (place.totalMs || 0) + (drive.durationMs || 0)
  });
}

/* Resolves a label for the drive and patches the record.
   Returns the label it settled on. */
export async function resolveDestination(drive) {
  const to = drive.to;
  if (!to) {
    store.updateDrive(drive.id, { placeLabel: drive.placeLabel || null });
    return drive.placeLabel || null;
  }

  // 1. saved place
  const hit = matchPlace(to);
  if (hit) {
    countVisit(hit, drive);
    store.updateDrive(drive.id, { placeId: hit.id, placeLabel: hit.label });
    return hit.label;
  }

  // 2. home — came back to where he started
  if (isHome(to)) {
    const label = (drive.tags && drive.tags.length)
      ? titleise(drive.tags[0])
      : 'Round trip';
    store.updateDrive(drive.id, { placeLabel: label });
    return label;
  }

  // 3. ask the map people, once, cached by 4dp coords
  const label = await reverseGeocode(to.lat, to.lon);
  store.updateDrive(drive.id, { placeLabel: label });
  return label;
}

function titleise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* Renaming a stop. Creates the saved place if this spot is new, updates it if
   he is correcting one he already has, and re-labels the drive. */
export function renameStop(driveId, label) {
  const drive = store.getDrive(driveId);
  if (!drive) return null;
  const clean = label.trim().slice(0, 60);
  if (!clean) return null;

  let place = drive.placeId ? store.getPlace(drive.placeId) : null;
  if (!place && drive.to) place = matchPlace(drive.to);

  if (place) {
    store.updatePlace(place.id, { label: clean });
    // every other drive pointing at this place follows the new name
    store.get().drives.forEach(d => {
      if (d.placeId === place.id && d.id !== drive.id) store.updateDrive(d.id, { placeLabel: clean });
    });
    store.updateDrive(driveId, { placeId: place.id, placeLabel: clean });
  } else if (drive.to) {
    const made = store.addPlace({
      label: clean,
      lat: drive.to.lat,
      lon: drive.to.lon,
      visits: 1,
      totalMs: drive.durationMs || 0
    });
    store.updateDrive(driveId, { placeId: made.id, placeLabel: clean });
    place = made;
  } else {
    // no GPS on this drive — the name is just a label on the record
    store.updateDrive(driveId, { placeLabel: clean });
  }
  return place;
}

/* Places whose label starts with / contains what he is typing (quick-add). */
export function suggest(query, limit = 5) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return store.get().places
    .filter(p => p.label.toLowerCase().includes(q))
    .sort((a, b) => (b.visits || 0) - (a.visits || 0))
    .slice(0, limit);
}

/* Attach a drive to a saved place by label (quick-add, routines). */
export function placeByLabel(label) {
  const l = label.trim().toLowerCase();
  return store.get().places.find(p => p.label.toLowerCase() === l) || null;
}
