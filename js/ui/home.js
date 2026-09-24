/* HOURS — ui/home.js
   The total, GO, the one-tap errand tiles for a forgotten run, and the last
   few runs. Everything a run needs is on this one screen. */

import * as store from '../store.js';
import * as drive from '../drive.js';
import * as errands from '../errands.js';
import * as S from '../stats.js';
import { el, svg, icon, bigDuration, countUp, toast } from './widgets.js';
import { show } from './screens.js';
import { openQuickLog, openTakeaway, openErrandEditor, openFinish, openEditRun } from './sheets.js';

let lastShown = null;          // the number on screen last time, for the roll-up
let lastRange = null;

export function mount(root) {
  const state = store.get();
  const drives = state.drives;
  const live = store.getLive();
  const range = state.settings.homeRange || 'week';

  /* --- top bar ------------------------------------------------------- */
  const now = new Date();
  root.appendChild(el('div', { class: 'topbar' },
    el('div', { class: 'wordmark' }, el('i'), 'HOURS'),
    el('div', { class: 'when', text: `${S.DAY_SHORT[now.getDay()]} ${S.fmtDate(now)}` })
  ));

  /* --- notices ------------------------------------------------------- */
  if (live && drive.isStale()) root.appendChild(staleCard(live));
  const unnamed = drives.filter(d => !d.errandId && !d.placeLabel && d.origin === 'live')
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (unnamed) root.appendChild(unnamedCard(unnamed));

  /* --- the number ----------------------------------------------------- */
  const sum = S.summary(drives, range);
  const big = bigDuration(lastRange === range && lastShown !== null ? lastShown : sum.ms);
  if (lastRange === range && lastShown !== null && lastShown !== sum.ms) countUp(big, lastShown, sum.ms);
  else if (lastShown === null) countUp(big, 0, sum.ms, 1100);
  lastShown = sum.ms; lastRange = range;

  const seg = el('div', { class: 'seg', role: 'tablist' });
  ['week', 'month', 'all'].forEach(r => seg.appendChild(el('button', {
    class: r === range ? 'on' : '', text: S.RANGES[r].short, role: 'tab',
    onclick: () => { store.setting('homeRange', r); lastShown = null; show('home'); }
  })));

  const km = sum.km.known ? ` · <b>~${S.fmtKm(sum.km.km)}</b> km` : '';
  const meta = el('div', { class: 'hero-meta' });
  meta.innerHTML = `<b>${sum.runs}</b> run${sum.runs === 1 ? '' : 's'}${km}`;

  root.appendChild(el('section', { class: 'hero' },
    el('div', { class: 'hero-label' }, 'Time helping the family ', el('span', { class: 'faint', text: '· ' + S.RANGES[range].label.toLowerCase() })),
    big,
    el('div', { class: 'hero-foot' }, seg, deltaLine(sum, range) || meta),
    sum.prevMs !== null ? el('div', { class: 'hero-meta', style: { marginTop: '10px' } }, meta) : null
  ));

  /* --- GO / out ------------------------------------------------------- */
  if (live && !drive.isStale()) {
    root.appendChild(el('button', { class: 'out-card', onclick: () => show('driving') },
      el('i', { class: 'pulse' }),
      el('div', {}, el('div', { class: 't', text: 'Out on a run' }), el('div', { class: 's', text: `Left at ${S.fmtTime(live.startedAt)}` })),
      el('span', { class: 'go-on', text: 'Open →' })
    ));
  } else if (!live) {
    root.appendChild(goButton());
  }

  /* --- forgot to tap GO ---------------------------------------------- */
  const tiles = el('div', { class: 'tiles' });
  errands.main().forEach(e => tiles.appendChild(tile(e.icon, e.name, `${e.minutes} min`, () => openQuickLog(e))));
  const tk = errands.takeaway();
  tiles.appendChild(tile('food', 'Get takeaway', tk.length ? `${tk.length} place${tk.length === 1 ? '' : 's'}` : 'Add a place', () => openTakeaway()));
  tiles.appendChild(tile('plus', 'Something else', 'New button', () => openErrandEditor(null, { onSaved: openQuickLog }), 'dashed'));

  root.appendChild(el('section', { class: 'section' },
    el('div', { class: 'section-head' }, el('span', { class: 'label', text: 'Forgot to tap GO?' }), el('span', { class: 'hint', text: 'One tap logs it' })),
    tiles
  ));

  /* --- recent -------------------------------------------------------- */
  const recent = store.drivesDesc().slice(0, 4);
  if (recent.length) {
    const list = el('div', { class: 'runs' });
    recent.forEach(d => list.appendChild(runRow(d)));
    root.appendChild(el('section', { class: 'section' },
      el('div', { class: 'section-head' },
        el('span', { class: 'label', text: 'Recent' }),
        el('button', { class: 'link', text: 'All runs →', onclick: () => show('runs') })),
      list
    ));
  }
}

export function unmount() {}

/* --- pieces --------------------------------------------------------- */

function deltaLine(sum, range) {
  if (sum.prevMs === null) return null;
  const diff = sum.ms - sum.prevMs;
  const word = range === 'week' ? 'last week' : 'last month';
  if (Math.abs(diff) < 60000) return el('span', { class: 'delta', text: `Same as ${word} so far` });
  const up = diff > 0;
  return el('span', { class: 'delta ' + (up ? 'up' : 'down') },
    el('span', { class: 'arr', text: up ? '▲' : '▼' }),
    `${S.fmtDur(Math.abs(diff))} ${up ? 'more' : 'less'} than ${word}`);
}

function goButton() {
  const ticks = svg('svg', { class: 'bezel', viewBox: '0 0 236 236', 'aria-hidden': 'true' });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const major = i % 5 === 0;
    const r1 = 116, r2 = major ? 106 : 110;
    ticks.appendChild(svg('line', {
      class: major ? 'major' : null,
      x1: 118 + Math.sin(a) * r1, y1: 118 - Math.cos(a) * r1,
      x2: 118 + Math.sin(a) * r2, y2: 118 - Math.cos(a) * r2
    }));
  }
  return el('div', { class: 'go-zone' },
    el('button', {
      class: 'go', 'aria-label': 'GO — start a run',
      onclick: () => {
        drive.start();
        if (navigator.vibrate) navigator.vibrate(12);
        show('driving');
      }
    },
      ticks,
      el('span', { class: 'ring' }),
      el('span', { class: 'core' }, el('b', { text: 'GO' }), el('span', { text: 'Tap as you leave' }))
    )
  );
}

function tile(ic, name, meta, onclick, extra = '') {
  return el('button', { class: 'tile ' + extra, onclick },
    icon(ic),
    el('div', {}, el('div', { class: 'nm', text: name }), el('div', { class: 'mt', text: meta }))
  );
}

export function runRow(d, { showDay = true } = {}) {
  const tag = d.origin === 'quick' || d.origin === 'backfill' ? el('span', { class: 'tag', text: 'ADDED' }) : null;
  const when = showDay ? `${S.fmtDayHead(d.startedAt)} · ${S.fmtTime(d.startedAt)}` : `${S.fmtTime(d.startedAt)} – ${S.fmtTime(d.endedAt)}`;
  return el('button', { class: 'run', onclick: () => openEditRun(d) },
    icon(errands.iconFor(d)),
    el('div', { class: 'mid' },
      el('div', { class: 'nm' }, errands.labelFor(d), tag),
      el('div', { class: 'tm', text: when })
    ),
    el('div', { class: 'dur', text: S.fmtDur(d.durationMs) })
  );
}

function unnamedCard(d) {
  return el('div', { class: 'notice' },
    icon('pin', 'sun'),
    el('div', { class: 'txt' },
      el('h3', { text: `${S.fmtDur(d.durationMs)} run — what was it?` }),
      el('p', { text: `${S.fmtDayHead(d.startedAt)}, back at ${S.fmtTime(d.endedAt)}` })),
    el('button', { class: 'btn sm', text: 'Name it', onclick: () => openFinish(d) })
  );
}

/* GO was tapped more than 6 hours ago and I'M BACK never came. */
function staleCard(live) {
  let mins = 30;
  const e = live.errandId && store.getErrand(live.errandId);
  if (e) mins = e.minutes;
  return el('div', { class: 'notice', style: { flexDirection: 'column', alignItems: 'stretch' } },
    el('div', { class: 'txt' },
      el('h3', { text: 'Forgot to tap I’m back?' }),
      el('p', { text: `You tapped GO ${S.fmtDayHead(live.startedAt).toLowerCase()} at ${S.fmtTime(live.startedAt)}. How long were you out?` })),
    el('div', { class: 'row' },
      ...[20, 30, 45, 60].map(m => el('button', {
        class: 'btn sm' + (m === mins ? ' primary' : ''), text: `${m}m`,
        onclick: () => { const d = drive.recoverWith(m * 60000); show('home'); if (d && !d.errandId) openFinish(d); else toast('Logged.'); }
      })),
      el('button', { class: 'btn sm ghost', text: 'Bin it', onclick: () => { drive.binLive(); show('home'); } })
    )
  );
}
