/* HOURS — ui/driving.js
   Out on a run. A stopwatch dial whose ticks fill with the seconds, the
   clock (always now − startedAt, so it's right after any lock or reload),
   and one huge I'M BACK button. Nothing here needs touching while driving. */

import * as store from '../store.js';
import * as drive from '../drive.js';
import * as errands from '../errands.js';
import * as S from '../stats.js';
import { el, svg, ask, sheet } from './widgets.js';
import { show } from './screens.js';
import { openFinish, confirmShort, celebrate } from './sheets.js';

let timer = null;

export function mount(root) {
  const live = store.getLive();
  if (!live) { show('home'); return; }

  /* --- the dial ----------------------------------------------------- */
  const dialSvg = svg('svg', { viewBox: '0 0 300 300', 'aria-hidden': 'true' },
    svg('defs', {},
      svg('linearGradient', { id: 'sunStroke', x1: '0', y1: '0', x2: '300', y2: '300', gradientUnits: 'userSpaceOnUse' },
        svg('stop', { offset: '0', style: 'stop-color:var(--sun-1)' }),
        svg('stop', { offset: '.4', style: 'stop-color:var(--sun-2)' }),
        svg('stop', { offset: '.75', style: 'stop-color:var(--sun-3)' }),
        svg('stop', { offset: '1', style: 'stop-color:var(--sun-4)' }))));
  const ticks = [];
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r1 = 146, r2 = i % 5 === 0 ? 128 : 134;
    const t = svg('line', {
      x1: 150 + Math.sin(a) * r1, y1: 150 - Math.cos(a) * r1,
      x2: 150 + Math.sin(a) * r2, y2: 150 - Math.cos(a) * r2
    });
    ticks.push(t);
    dialSvg.appendChild(t);
  }
  const clock = el('div', { class: 'clock' });
  const dial = el('div', { class: 'dial' }, dialSvg,
    el('div', { class: 'readout' }, clock, el('div', { class: 'since', text: `Left home at ${S.fmtTime(live.startedAt)}` })));

  /* --- what it's for (optional, before you drive off) --------------- */
  const forChip = el('button', { class: 'for-chip', onclick: pickFor });
  const paintFor = () => {
    const cur = store.getLive();
    const e = cur && cur.errandId && store.getErrand(cur.errandId);
    forChip.replaceChildren(e ? 'For ' : 'What’s it for? ', el('b', { text: e ? e.name : 'Choose later' }));
  };
  paintFor();

  root.appendChild(el('div', { class: 'drive' },
    el('div', { class: 'drive-top' },
      el('span', { class: 'live-pill' }, el('i'), 'OUT ON A RUN'),
      el('button', { class: 'text-btn', text: 'Cancel', onclick: cancel })
    ),
    el('div', { class: 'drive-mid' }, dial, forChip),
    el('div', { class: 'drive-hint', text: 'Lock your phone and drive. The clock keeps going.' }),
    el('button', { class: 'back-btn', text: 'I’M BACK', onclick: back })
  ));

  function tick() {
    const ms = drive.elapsedMs();
    clock.textContent = S.fmtClock(ms);
    const sec = Math.floor(ms / 1000) % 60;
    ticks.forEach((t, i) => t.classList.toggle('on', i <= sec));
  }
  tick();
  timer = setInterval(tick, 250);

  function pickFor() {
    sheet((panel, close) => {
      panel.appendChild(el('h2', { text: 'What’s this run for?' }));
      panel.appendChild(el('div', { class: 'lede', text: 'Optional — you can pick when you’re back.' }));
      const grid = el('div', { class: 'tiles pick field' });
      [...errands.main(), ...errands.takeaway()].forEach(e => grid.appendChild(el('button', {
        class: 'tile' + (store.getLive() && store.getLive().errandId === e.id ? ' sel' : ''),
        onclick: () => { store.patchLive({ errandId: e.id }); paintFor(); close(); }
      }, el('div', { class: 'nm', text: e.name }))));
      panel.appendChild(grid);
    });
  }
}

export function unmount() {
  clearInterval(timer);
  timer = null;
}

export function back() {
  const res = drive.finish();
  show('home');
  if (!res) return;
  if (res.short) { confirmShort(res.drive); return; }
  if (res.drive.errandId) celebrate(res.drive);
  else openFinish(res.drive);
}

async function cancel() {
  const sure = await ask({
    title: 'Cancel this run?',
    body: 'Nothing gets logged.',
    buttons: [
      { label: 'Cancel run', value: true, style: 'danger' },
      { label: 'Keep timing', value: false, style: 'ghost' }
    ]
  });
  if (sure) { drive.binLive(); show('home'); }
}
