/* HOURS — stats.js
   Every number the app shows, as pure functions of the drives array.
   Nothing here touches the DOM or storage. */

import { kmFor, labelFor } from './errands.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* --- dates ------------------------------------------------------------ */

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function addDays(ts, n) {           // DST-safe: walks the calendar, not ms
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
export function startOfWeek(ts) {           // Monday
  const d = new Date(startOfDay(ts));
  const back = (d.getDay() + 6) % 7;
  return addDays(d.getTime(), -back);
}
export function startOfMonth(ts) {
  const d = new Date(startOfDay(ts));
  d.setDate(1);
  return d.getTime();
}
export function dayKey(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* --- formatting ------------------------------------------------------- */

/* { h, m } rounded to the minute */
export function hm(ms) {
  const mins = Math.round(Math.max(0, ms) / 60000);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}
export function fmtDur(ms) {
  const { h, m } = hm(ms);
  if (!h) return m + 'm';
  return m ? `${h}h ${m}m` : `${h}h`;
}
export function fmtDurLong(ms) {
  const { h, m } = hm(ms);
  const hs = h ? `${h} hour${h === 1 ? '' : 's'}` : '';
  const ms_ = m || !h ? `${m} minute${m === 1 ? '' : 's'}` : '';
  return [hs, ms_].filter(Boolean).join(' ');
}
export function fmtClock(ms) {              // the live stopwatch
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
export function fmtTime(ts) {
  const d = new Date(ts);
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')}${ap}`;
}
export function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
export function fmtDayHead(ts, now = Date.now()) {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(ts);
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}
export function fmtKm(km) {
  if (km === null || km === undefined) return '—';
  return km >= 100 ? String(Math.round(km)) : (Math.round(km * 10) / 10).toString();
}

/* --- basic sums ------------------------------------------------------- */

export function inRange(drives, from, to = Infinity) {
  return drives.filter(d => d.startedAt >= from && d.startedAt < to);
}
export function totalMs(drives) {
  return drives.reduce((s, d) => s + (d.durationMs || 0), 0);
}
export function totalKm(drives) {
  let km = 0, known = 0;
  drives.forEach(d => { const k = kmFor(d); if (k !== null) { km += k; known++; } });
  return { km, known, all: drives.length };
}

/* --- ranges ----------------------------------------------------------- */

export const RANGES = {
  week:  { label: 'This week',  short: 'Week' },
  month: { label: 'This month', short: 'Month' },
  all:   { label: 'All time',   short: 'All time' }
};

/* { from, to, prevFrom, prevTo } — prev is the same span one period back,
   cut at the same point (Wednesday-so-far vs last Wednesday-so-far). */
export function rangeBounds(range, now = Date.now()) {
  if (range === 'week') {
    const from = startOfWeek(now);
    const prevFrom = addDays(from, -7);
    return { from, to: Infinity, prevFrom, prevTo: prevFrom + (now - from) };
  }
  if (range === 'month') {
    const from = startOfMonth(now);
    const p = new Date(from); p.setMonth(p.getMonth() - 1);
    const prevFrom = p.getTime();
    return { from, to: Infinity, prevFrom, prevTo: Math.min(from, prevFrom + (now - from)) };
  }
  return { from: 0, to: Infinity, prevFrom: null, prevTo: null };
}

export function summary(drives, range, now = Date.now()) {
  const b = rangeBounds(range, now);
  const these = inRange(drives, b.from, b.to);
  const out = {
    ms: totalMs(these),
    runs: these.length,
    km: totalKm(these),
    prevMs: null
  };
  if (b.prevFrom !== null) out.prevMs = totalMs(inRange(drives, b.prevFrom, b.prevTo));
  return out;
}

/* --- the proof -------------------------------------------------------- */

export function firstRunAt(drives) {
  return drives.length ? Math.min(...drives.map(d => d.startedAt)) : null;
}

/* Average per week since the first run (at least one week, so two runs on
   day one don't read as "14 hours a week"). */
export function perWeek(drives, now = Date.now()) {
  const first = firstRunAt(drives);
  if (first === null) return 0;
  const weeks = Math.max(1, (now - startOfDay(first)) / (7 * DAY_MS));
  return totalMs(drives) / weeks;
}

export function longest(drives) {
  return drives.reduce((best, d) => (!best || d.durationMs > best.durationMs) ? d : best, null);
}

/* Days with at least one run, and the gap-free streak of weeks. */
export function daysHelped(drives) {
  return new Set(drives.map(d => dayKey(d.startedAt))).size;
}
export function weekStreak(drives, now = Date.now()) {
  const weeks = new Set(drives.map(d => startOfWeek(d.startedAt)));
  let w = startOfWeek(now), n = 0;
  if (!weeks.has(w)) w = addDays(w, -7);         // this week isn't over yet
  while (weeks.has(w)) { n++; w = addDays(w, -7); }
  return n;
}

/* Last n weeks, oldest first: [{ from, ms, runs, isNow }] */
export function weeks(drives, n = 8, now = Date.now()) {
  const thisWeek = startOfWeek(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = addDays(thisWeek, -7 * i);
    const to = addDays(from, 7);
    const these = inRange(drives, from, to);
    out.push({ from, ms: totalMs(these), runs: these.length, isNow: i === 0 });
  }
  return out;
}

/* A calendar grid: `cols` weeks wide, Monday on top. Each cell
   { ts, ms, runs, future }. Columns oldest first. */
export function heat(drives, cols = 12, now = Date.now()) {
  const byDay = new Map();
  drives.forEach(d => {
    const k = dayKey(d.startedAt);
    const c = byDay.get(k) || { ms: 0, runs: 0 };
    c.ms += d.durationMs || 0; c.runs++;
    byDay.set(k, c);
  });
  const today = startOfDay(now);
  const start = addDays(startOfWeek(now), -7 * (cols - 1));
  const grid = [];
  for (let c = 0; c < cols; c++) {
    const col = [];
    for (let r = 0; r < 7; r++) {
      const ts = addDays(start, c * 7 + r);
      const hit = byDay.get(dayKey(ts)) || { ms: 0, runs: 0 };
      col.push({ ts, ms: hit.ms, runs: hit.runs, future: ts > today, today: ts === today });
    }
    grid.push(col);
  }
  return grid;
}

/* Where the time went: [{ key, name, ms, runs }] biggest first. */
export function byErrand(drives) {
  const map = new Map();
  drives.forEach(d => {
    const name = labelFor(d);
    const key = d.errandId || 'label:' + name;
    const row = map.get(key) || { key, errandId: d.errandId, name, ms: 0, runs: 0 };
    row.ms += d.durationMs || 0; row.runs++;
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => b.ms - a.ms);
}
