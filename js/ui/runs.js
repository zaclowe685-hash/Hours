/* HOURS — ui/runs.js
   Every run, newest first, grouped by day. Tap one to fix it or delete it. */

import * as store from '../store.js';
import * as errands from '../errands.js';
import * as S from '../stats.js';
import { el, sheet, icon } from './widgets.js';
import { runRow } from './home.js';
import { openQuickLog, openTakeaway } from './sheets.js';

export function mount(root) {
  const drives = store.drivesDesc();

  root.appendChild(el('div', { class: 'topbar' },
    el('div', {}, el('h1', { class: 'title', text: 'Runs' })),
    el('button', { class: 'btn sm', text: '+ Add', onclick: addRun })
  ));
  root.appendChild(el('div', { class: 'sub', style: { marginTop: '-10px', marginBottom: '8px' },
    text: drives.length ? `${drives.length} run${drives.length === 1 ? '' : 's'} · ${S.fmtDur(S.totalMs(drives))} altogether` : '' }));

  if (!drives.length) {
    root.appendChild(el('div', { class: 'empty' },
      el('span', { class: 'serif', text: 'No runs yet.' }),
      'Tap GO on Home next time you head out.'));
    return;
  }

  let day = null, list = null;
  drives.forEach(d => {
    const k = S.dayKey(d.startedAt);
    if (k !== day) {
      day = k;
      const same = drives.filter(x => S.dayKey(x.startedAt) === k);
      root.appendChild(el('div', { class: 'day-head' },
        el('span', { class: 'label', text: S.fmtDayHead(d.startedAt) }),
        el('span', { class: 'tot', text: S.fmtDur(S.totalMs(same)) })));
      list = el('div', { class: 'runs' });
      root.appendChild(list);
    }
    list.appendChild(runRow(d, { showDay: false }));
  });
}

export function unmount() {}

/* the + Add button: pick the errand, then the usual quick-log sheet */
function addRun() {
  sheet((panel, close) => {
    panel.appendChild(el('h2', { text: 'Add a run' }));
    panel.appendChild(el('div', { class: 'lede', text: 'Which one?' }));
    const grid = el('div', { class: 'tiles pick field' });
    errands.main().forEach(e => grid.appendChild(el('button', {
      class: 'tile', onclick: () => { close(); setTimeout(() => openQuickLog(e), 220); }
    }, icon(e.icon), el('div', { class: 'nm', text: e.name }))));
    grid.appendChild(el('button', {
      class: 'tile', onclick: () => { close(); setTimeout(() => openTakeaway(), 220); }
    }, icon('food'), el('div', { class: 'nm', text: 'Get takeaway' })));
    panel.appendChild(grid);
  });
}
