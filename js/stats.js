/* HOURS — stats.js
   Pure functions only. No DOM, no store imports — everything takes the drives
   array and gives back numbers. Every one of these must survive an empty
   history without producing NaN or Infinity. */

export const DAY_MS = 86400000;
export const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const DAY_LONG  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/* --- dates ------------------------------------------------------------ */

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function dayKey(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function daysBetweenKeys(a, b) {
  return Math.round((startOfDay(keyToDate(b).getTime()) - startOfDay(keyToDate(a).getTime())) / DAY_MS);
}

/* --- formatting ------------------------------------------------------- */

/* The live timer: M:SS under an hour, H:MM:SS over. */
export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}

/* Everywhere else: "24 min", "1 h 20 m". */
export function fmtDur(ms) {
  const mins = Math.round(Math.max(0, ms) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

export function formatMins(ms) { return Math.round(Math.max(0, ms) / 60000); }

export function fmtTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}

export function fmtKm(km, source) {
  if (km === null || km === undefined || !isFinite(km)) return null;
  const tilde = source === 'estimate' || source === 'osrm' ? '~' : '';
  return `${tilde}${km.toFixed(1)} km`;
}

export function fmtDateHead(ts) {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return 'TODAY';
  if (day === today - DAY_MS) return 'YESTERDAY';
  const d = new Date(ts);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

/* --- basic slices ----------------------------------------------------- */

export function inRange(drives, from, to) {
  return drives.filter(d => d.startedAt >= from && d.startedAt < to);
}

export function totalMs(drives) {
  return drives.reduce((s, d) => s + (d.durationMs || 0), 0);
}

export function totalKm(drives) {
  return drives.reduce((s, d) => s + (typeof d.distanceKm === 'number' && isFinite(d.distanceKm) ? d.distanceKm : 0), 0);
}

export function byCategory(drives, cat) {
  return drives.filter(d => d.category === cat);
}

/* Lifetime minutes driven for other people — the home odometer. */
export function sentMinutes(drives) {
  return formatMins(totalMs(byCategory(drives, 'sent')));
}

/* --- weeks ------------------------------------------------------------ */

/* Weeks run Monday to Sunday. */
export function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  const shift = (d.getDay() + 6) % 7;      // Mon = 0
  return d.getTime() - shift * DAY_MS;
}

export function weekSummary(drives, weekStart) {
  const end = weekStart + 7 * DAY_MS;
  const week = inRange(drives, weekStart, end);
  return {
    drives: week.length,
    minutes: formatMins(totalMs(week)),
    km: Math.round(totalKm(week) * 10) / 10,
    sentMinutes: formatMins(totalMs(byCategory(week, 'sent'))),
    choseMinutes: formatMins(totalMs(byCategory(week, 'chose')))
  };
}

/* delta helper: returns { diff, dir } where dir is 'up' | 'down' | 'flat' */
export function delta(now, before) {
  const diff = Math.round((now - before) * 10) / 10;
  return { diff: Math.abs(diff), dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' };
}

/* --- the week ribbon (last 7 days, oldest first) ---------------------- */

export function ribbon(drives) {
  const today = startOfDay(Date.now());
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const from = today - i * DAY_MS;
    const list = inRange(drives, from, from + DAY_MS).sort((a, b) => a.startedAt - b.startedAt);
    days.push({
      ts: from,
      isToday: i === 0,
      letter: DAY_SHORT[new Date(from).getDay()][0],
      segments: list.map(d => ({ ms: d.durationMs || 0, cat: d.category || 'chose' })),
      totalMs: totalMs(list)
    });
  }
  const peak = Math.max(1, ...days.map(d => d.totalMs));
  return { days, peak };
}

/* --- the 24-hour dial -------------------------------------------------- */

export function hourDial(drives) {
  const hours = Array.from({ length: 24 }, () => ({ ms: 0, sent: 0, chose: 0 }));
  drives.forEach(d => {
    const h = new Date(d.startedAt).getHours();
    const ms = d.durationMs || 0;
    hours[h].ms += ms;
    if (d.category === 'sent') hours[h].sent += ms; else hours[h].chose += ms;
  });
  const peak = Math.max(1, ...hours.map(h => h.ms));
  return hours.map((h, i) => ({
    hour: i,
    minutes: formatMinutes(h.ms),
    frac: h.ms / peak,
    cat: h.sent > h.chose ? 'sent' : 'chose'
  }));
}

/* --- tags -------------------------------------------------------------- */

export function tagTotals(drives) {
  const map = new Map();
  drives.forEach(d => (d.tags || []).forEach(t => {
    const cur = map.get(t) || { tag: t, count: 0, ms: 0 };
    cur.count++;
    cur.ms += d.durationMs || 0;
    map.set(t, cur);
  }));
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}

export function topTags(drives, n = 6) {
  const map = new Map();
  drives.forEach(d => (d.tags || []).forEach(t => map.set(t, (map.get(t) || 0) + 1)));
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(e => e[0]);
}

/* --- records ----------------------------------------------------------- */

export function records(drives, places) {
  if (!drives.length) return [];
  const out = [];
  const sortedByDur = [...drives].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
  const longest = sortedByDur[0];
  const shortest = sortedByDur[sortedByDur.length - 1];

  out.push({ k: 'Longest drive', v: fmtDur(longest.durationMs), sub: longest.placeLabel || 'Unnamed stop', cat: longest.category });
  if (drives.length > 1) {
    out.push({ k: 'Shortest drive', v: fmtDur(shortest.durationMs), sub: shortest.placeLabel || 'Unnamed stop', cat: shortest.category });
  }

  const topPlace = [...(places || [])].sort((a, b) => (b.visits || 0) - (a.visits || 0))[0];
  if (topPlace && topPlace.visits > 0) {
    out.push({ k: 'Most visited', v: topPlace.label, sub: `${topPlace.visits} visit${topPlace.visits === 1 ? '' : 's'} · ${fmtDur(topPlace.totalMs || 0)}`, cat: null });
  }

  const perWeekday = Array.from({ length: 7 }, () => 0);
  drives.forEach(d => { perWeekday[new Date(d.startedAt).getDay()] += d.durationMs || 0; });
  const busiestIdx = perWeekday.indexOf(Math.max(...perWeekday));
  if (perWeekday[busiestIdx] > 0) {
    out.push({ k: 'Busiest day', v: DAY_LONG[busiestIdx], sub: fmtDur(perWeekday[busiestIdx]) + ' all up', cat: null });
  }

  const perDay = new Map();
  drives.forEach(d => {
    const k = dayKey(d.startedAt);
    perDay.set(k, (perDay.get(k) || 0) + (d.durationMs || 0));
  });
  const biggest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (biggest) {
    const dt = keyToDate(biggest[0]);
    out.push({ k: 'Biggest day', v: fmtDur(biggest[1]), sub: `${DAY_SHORT[dt.getDay()]} ${dt.getDate()} ${MONTH_SHORT[dt.getMonth()]}`, cat: null });
  }

  const withKm = drives.filter(d => typeof d.distanceKm === 'number' && isFinite(d.distanceKm));
  if (withKm.length) {
    const far = withKm.sort((a, b) => b.distanceKm - a.distanceKm)[0];
    out.push({ k: 'Furthest', v: fmtKm(far.distanceKm, far.routeSource), sub: far.placeLabel || 'Unnamed stop', cat: far.category });
  }
  return out;
}

/* --- the gap nudge ----------------------------------------------------- */

export function daysSinceLastDrive(drives) {
  if (!drives.length) return null;
  const last = Math.max(...drives.map(d => d.startedAt));
  return Math.floor((startOfDay(Date.now()) - startOfDay(last)) / DAY_MS);
}

export function lastDriveWeekday(drives) {
  if (!drives.length) return null;
  const last = Math.max(...drives.map(d => d.startedAt));
  return DAY_LONG[new Date(last).getDay()];
}
