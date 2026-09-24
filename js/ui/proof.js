/* HOURS — ui/proof.js
   The screen you hand across the table. One sentence with the total, four
   numbers, every day helped on a calendar, week by week, and where the time
   went. Built to be read by someone who has never seen the app. */

import * as store from '../store.js';
import * as errands from '../errands.js';
import * as S from '../stats.js';
import { el, icon, bigDuration, countUp } from './widgets.js';
import { show } from './screens.js';

const PROOF_RANGES = [['all', 'All time'], ['month', 'This month'], ['week', 'This week']];

export function mount(root) {
  const state = store.get();
  const all = state.drives;
  const range = state.settings.proofRange || 'all';
  const b = S.rangeBounds(range);
  const drives = S.inRange(all, b.from, b.to);
  const name = (state.settings.name || '').trim() || 'I';

  root.appendChild(el('div', { class: 'topbar' },
    el('div', { class: 'wordmark' }, el('i'), 'HOURS'),
    el('div', { class: 'when', text: 'The proof' })
  ));

  if (!all.length) {
    root.appendChild(el('div', { class: 'empty' },
      el('span', { class: 'serif', text: 'Nothing to prove yet.' }),
      'Tap GO on your next run and it shows up here.'));
    return;
  }

  /* --- the sentence ------------------------------------------------- */
  const first = S.firstRunAt(drives);
  const since = range === 'all' ? `since ${S.fmtDate(first)}` : range === 'month' ? 'this month' : 'this week';
  const big = bigDuration(0);
  countUp(big, 0, S.totalMs(drives), 1300);

  const seg = el('div', { class: 'seg', style: { marginTop: '20px' } });
  PROOF_RANGES.forEach(([id, label]) => seg.appendChild(el('button', {
    class: id === range ? 'on' : '', text: label,
    onclick: () => { store.setting('proofRange', id); show('proof'); }
  })));

  root.appendChild(el('section', { class: 'proof-hero' },
    el('div', { class: 'serif' }, el('b', { text: name === 'I' ? 'I have' : name }), name === 'I' ? ' spent' : ' has spent'),
    big,
    el('div', { class: 'serif after', text: `helping the family ${since}.` }),
    seg
  ));

  /* --- four numbers ------------------------------------------------- */
  const km = S.totalKm(drives);
  const long = S.longest(drives);
  const pw = range === 'week' ? null : S.perWeek(drives);
  root.appendChild(el('div', { class: 'stat-grid' },
    stat(String(drives.length), '', drives.length === 1 ? 'run' : 'runs'),
    stat(String(S.daysHelped(drives)), '', 'days helped'),
    pw !== null ? statDur(pw, 'a week, on average') : statDur(S.totalMs(drives) / Math.max(1, drives.length), 'per run, on average'),
    km.known ? stat('~' + S.fmtKm(km.km), 'km', 'driven for them') : statDur(long ? long.durationMs : 0, 'longest run')
  ));

  /* --- calendar ------------------------------------------------------ */
  root.appendChild(heatCard(all));

  /* --- week by week -------------------------------------------------- */
  root.appendChild(weeksCard(all));

  /* --- where it went ------------------------------------------------- */
  const split = S.byErrand(drives);
  if (split.length) {
    const top = split[0].ms || 1;
    const card = el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('h3', { text: 'Where the time went' }), el('span', { class: 'faint', text: S.RANGES[range].label })));
    split.forEach((r, i) => {
      const e = r.errandId && store.getErrand(r.errandId);
      card.appendChild(el('div', { class: 'split-row' },
        icon(e ? e.icon : 'pin'),
        el('div', {},
          el('div', { class: 'nm' }, r.name, el('span', { text: `${r.runs}×` })),
          el('div', { class: 'track' }, el('i', { style: { width: Math.max(4, (r.ms / top) * 100) + '%', animationDelay: (i * 70) + 'ms' } }))),
        el('div', { class: 'v', text: S.fmtDur(r.ms) })
      ));
    });
    root.appendChild(card);
  }

  root.appendChild(el('p', { class: 'serif fineprint', text: 'Every run is timed from walking out the door to walking back in.' }));
}

export function unmount() {}

/* --- pieces ------------------------------------------------------------ */

function stat(v, unit, k) {
  return el('div', { class: 'stat' },
    el('div', { class: 'v' }, v, unit ? el('small', { text: unit }) : null),
    el('div', { class: 'k', text: k }));
}
function statDur(ms, k) {
  const { h, m } = S.hm(ms);
  const v = el('div', { class: 'v' });
  if (h) v.append(String(h), el('small', { text: 'h' }), ' ');
  v.append(String(m), el('small', { text: 'm' }));
  return el('div', { class: 'stat' }, v, el('div', { class: 'k', text: k }));
}

function level(ms) {
  if (!ms) return '';
  const m = ms / 60000;
  if (m < 25) return 'l1';
  if (m < 40) return 'l2';
  if (m < 60) return 'l3';
  return 'l4';
}

/* Young data gets a tighter window (bigger squares) that grows to 12 weeks. */
function weeksOfData(all) {
  const first = S.firstRunAt(all);
  return first === null ? 0 : Math.ceil((Date.now() - S.startOfWeek(first)) / (7 * S.DAY_MS));
}

function heatCard(all) {
  const COLS = Math.min(12, Math.max(8, weeksOfData(all) + 2));
  const grid = S.heat(all, COLS);
  const say = el('span', { class: 'say', text: 'Tap a day' });
  const helped = grid.flat().filter(c => c.runs).length;

  const cols = el('div', { class: 'cols' });
  let lastMonth = -1, picked = null, n = 0;
  grid.forEach(col => {
    const m = new Date(col[0].ts).getMonth();
    const c = el('div', { class: 'col' },
      el('span', { class: 'mon', text: m !== lastMonth ? S.MONTH_SHORT[m] : '' }));
    lastMonth = m;
    col.forEach(cell => {
      const node = el('button', {
        class: 'cell ' + level(cell.ms) + (cell.future ? ' future' : '') + (cell.today ? ' today' : '') + (cell.runs ? ' pop' : ''),
        style: cell.runs ? { animationDelay: (n++ * 25) + 'ms' } : null,
        'aria-label': S.fmtDayHead(cell.ts),
        onclick: () => {
          if (cell.future) return;
          if (picked) picked.classList.remove('picked');
          picked = node; node.classList.add('picked');
          if (!cell.runs) { say.textContent = `${S.fmtDayHead(cell.ts)} · no runs`; return; }
          const names = all.filter(d => S.dayKey(d.startedAt) === S.dayKey(cell.ts)).map(errands.labelFor);
          say.textContent = `${S.fmtDayHead(cell.ts)} · ${S.fmtDur(cell.ms)} · ${[...new Set(names)].join(', ')}`;
        }
      });
      c.appendChild(node);
    });
    cols.appendChild(c);
  });

  const days = el('div', { class: 'days' }, el('span'), ...['M', '', 'W', '', 'F', '', 'S'].map(t => el('span', { text: t })));
  const legend = el('div', { class: 'legend' }, 'less',
    ...['', 'l1', 'l2', 'l3', 'l4'].map(l => el('i', { class: 'cell ' + l })), 'more');

  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Every day I helped' }), el('span', { class: 'faint', text: `${helped} day${helped === 1 ? '' : 's'} · last ${COLS} weeks` })),
    el('div', { class: 'heat' }, days, cols),
    el('div', { class: 'heat-foot' }, say, legend)
  );
}

function weeksCard(all) {
  const wk = S.weeks(all, Math.min(8, Math.max(4, weeksOfData(all) + 1)));
  const peak = Math.max(...wk.map(w => w.ms), 1);
  const bars = el('div', { class: 'bars' });
  wk.forEach((w, i) => {
    const h = w.ms ? Math.max(4, (w.ms / peak) * 100) : 0;
    bars.appendChild(el('div', { class: 'bar' + (w.isNow ? ' now' : '') },
      el('span', { class: 'val', text: w.ms ? S.fmtDur(w.ms) : '' }),
      el('i', { class: 'fill' + (w.ms ? '' : ' zero'), style: { height: w.ms ? `max(6px, calc(${h}% - 40px))` : '3px', animationDelay: (i * 50) + 'ms' } }),
      el('span', { class: 'wk', text: w.isNow ? 'Now' : S.fmtDate(w.from) })
    ));
  });
  const streak = S.weekStreak(all);
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Week by week' }),
      el('span', { class: 'faint', text: streak > 1 ? `${streak} weeks in a row` : `Last ${wk.length} weeks` })),
    bars
  );
}
