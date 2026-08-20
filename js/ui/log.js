/* HOURS — ui/log.js
   Every drive as a supermarket docket, newest first, under sticky date heads. */

import * as store from '../store.js';
import * as S from '../stats.js';
import * as routines from '../routines.js';
import { el, clear, ask, toast } from './widgets.js';
import { show } from './screens.js';
import { openFinishSheet, openQuickAdd } from './finish.js';
import { miniMap } from './map.js';

let filterCat = 'all';
let filterTag = null;
let expandedId = null;

export function mount(root) {
  const drives = store.drivesDesc();

  root.appendChild(el('div', { class: 'screen-head' },
    el('h1', { text: 'LOG' }),
    el('button', { class: 'text-btn', style: { width: 'auto', margin: 0, padding: 0 }, text: '+ past drive', onclick: () => openQuickAdd() })
  ));

  /* filters */
  const row = el('div', { class: 'filter-row' });
  [['all', 'All', null], ['sent', 'Sent', 'sent'], ['chose', 'Chose', 'chose']].forEach(([id, label, cat]) => {
    row.appendChild(el('button', {
      class: 'filter' + (filterCat === id ? ' on' : ''),
      data: cat ? { cat } : {},
      text: label,
      onclick: () => { filterCat = id; show('log'); }
    }));
  });
  root.appendChild(row);

  const tags = S.tagTotals(drives).slice(0, 8);
  if (tags.length) {
    const trow = el('div', { class: 'filter-row' });
    tags.forEach(t => trow.appendChild(el('button', {
      class: 'tag' + (filterTag === t.tag ? ' on' : ''),
      text: '#' + t.tag,
      onclick: () => { filterTag = filterTag === t.tag ? null : t.tag; show('log'); }
    })));
    root.appendChild(trow);
  }

  /* filter + group */
  const list = drives.filter(d =>
    (filterCat === 'all' || d.category === filterCat) &&
    (!filterTag || (d.tags || []).includes(filterTag)));

  if (!list.length) {
    root.appendChild(el('div', { class: 'empty' },
      drives.length ? 'Nothing matches that filter.' : 'No drives yet. Tap GO when you next get in the car.'));
    return;
  }

  const groups = new Map();
  list.forEach(d => {
    const k = S.dayKey(d.startedAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  });

  groups.forEach((dayDrives, key) => {
    const ts = dayDrives[0].startedAt;
    const mins = S.fmtMins(S.totalMs(dayDrives));
    root.appendChild(el('div', { class: 'date-head' },
      el('span', { text: S.fmtDateHead(ts) }),
      el('span', { class: 'tot', text: `${dayDrives.length} drive${dayDrives.length === 1 ? '' : 's'} · ${mins} min` })
    ));
    dayDrives.forEach(d => root.appendChild(docket(d)));
  });
}

export function unmount() {}

/* --- one docket --------------------------------------------------------- */

export function docket(d, { compact = false } = {}) {
  const cat = d.category || 'chose';
  const node = el('div', { class: 'docket ' + cat });

  const km = S.fmtKm(d.distanceKm, d.routeSource);
  node.appendChild(el('div', { class: 'docket-row' },
    el('div', { class: 'docket-place', text: (d.placeLabel || 'Unnamed stop').toUpperCase() }),
    el('div', { class: 'docket-dur', text: S.fmtDur(d.durationMs) })
  ));
  node.appendChild(el('div', { class: 'docket-sub' },
    el('span', { text: `${S.fmtTime(d.startedAt)} – ${S.fmtTime(d.endedAt)}` }),
    el('span', {}, km ? km : (d.routeSource === 'pending' ? 'route pending' : ''))
  ));
  node.appendChild(el('div', { class: 'docket-sub' },
    el('span', { class: 'docket-cat ' + cat, text: cat === 'sent' ? 'SENT' : 'CHOSE' }),
    el('span', { class: 'docket-tags', text: (d.tags || []).map(t => '#' + t).join(' ') })
  ));

  if (d.origin === 'routine') node.appendChild(el('div', { class: 'auto-stamp', text: 'AUTO' }));

  if (compact) return node;

  /* recent auto drives get a one-tap "didn't go" */
  const age = S.daysSinceLastDrive([d]);
  if (d.origin === 'routine' && age !== null && age <= 1) {
    node.appendChild(el('div', { class: 'docket-actions' },
      el('button', {
        class: 'btn ghost', text: 'Didn’t go',
        onclick: e => {
          e.stopPropagation();
          const gone = routines.didntGo(d.routineId, d.startedAt);
          show('log');
          toast(gone.length > 1 ? 'Wiped. Both legs.' : 'Wiped.', {
            ms: 6000,
            action: { label: 'Undo', fn: () => { store.restoreDrives(gone); show('log'); } }
          });
        }
      })
    ));
  }

  node.addEventListener('click', () => {
    expandedId = expandedId === d.id ? null : d.id;
    show('log');
  });

  if (expandedId === d.id) node.appendChild(expanded(d));
  return node;
}

function expanded(d) {
  const box = el('div', { class: 'docket-expand' });

  if (d.routeGeometry && d.routeGeometry.length > 1) {
    const holder = el('div', { class: 'mini-map' });
    box.appendChild(holder);
    setTimeout(() => miniMap(holder, d), 30);
  }

  box.appendChild(el('div', { class: 'docket-sub', style: { marginTop: '10px' } },
    el('span', { text: 'STARTED' }), el('span', { text: S.fmtTime(d.startedAt) })));
  box.appendChild(el('div', { class: 'docket-sub' },
    el('span', { text: 'ENDED' }), el('span', { text: S.fmtTime(d.endedAt) })));
  if (d.routeSource === 'estimate') {
    box.appendChild(el('div', { class: 'docket-sub' },
      el('span', { text: 'DISTANCE' }), el('span', { text: 'estimated, no road route' })));
  }
  if (d.origin === 'quicklog') {
    box.appendChild(el('div', { class: 'docket-sub' },
      el('span', { text: 'ADDED' }), el('span', { text: 'by hand' })));
  }

  const actions = el('div', { class: 'docket-actions' });
  actions.appendChild(el('button', {
    class: 'btn', text: 'Edit',
    onclick: e => { e.stopPropagation(); openFinishSheet(d.id, { isEdit: true }); }
  }));
  actions.appendChild(el('button', {
    class: 'btn danger', text: 'Delete',
    onclick: async e => {
      e.stopPropagation();
      const yes = await ask({
        title: 'Delete this drive?',
        body: `${d.placeLabel || 'Unnamed stop'} · ${S.fmtDur(d.durationMs)}`,
        buttons: [{ label: 'Delete', value: true, style: 'danger' }, { label: 'Keep it', value: false }]
      });
      if (!yes) return;
      const gone = store.deleteDrive(d.id);
      expandedId = null;
      show('log');
      toast('Deleted.', {
        ms: 6000,
        action: { label: 'Undo', fn: () => { store.restoreDrives([gone]); show('log'); } }
      });
    }
  }));
  box.appendChild(actions);
  return box;
}
