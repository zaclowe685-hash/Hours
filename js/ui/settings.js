/* HOURS — ui/settings.js
   Name, home, the one-tap buttons, the iPhone home-screen buttons, backups. */

import * as store from '../store.js';
import * as errands from '../errands.js';
import * as S from '../stats.js';
import { getFix } from '../geo.js';
import { el, icon, toast, ask } from './widgets.js';
import { show } from './screens.js';
import { openErrandEditor } from './sheets.js';

const SITE = 'https://zaclowe685-hash.github.io/Hours/';

export function mount(root) {
  const s = store.get().settings;

  root.appendChild(el('div', { class: 'topbar' }, el('h1', { class: 'title', text: 'Settings' })));

  /* --- you ------------------------------------------------------------ */
  const name = el('input', { type: 'text', value: s.name || '', placeholder: 'Your name', maxlength: '24', autocapitalize: 'words' });
  name.addEventListener('change', () => store.setting('name', name.value.trim()));
  const home = s.homeCoords;
  root.appendChild(group('You',
    el('label', { class: 'item' }, el('div', { class: 'mid' }, el('div', { class: 'nm', text: 'Name' }), el('div', { class: 'ds', text: 'Shown on the Proof screen' })), name),
    el('button', { class: 'item plain', onclick: setHome },
      icon('home'),
      el('div', { class: 'mid' },
        el('div', { class: 'nm', text: 'Home' }),
        el('div', { class: 'ds', text: home ? 'Set — tap to reset it to where you are now' : 'Not set — tap while you’re at home' })),
      el('span', { class: 'end' }, el('i', { class: 'chev' })))
  ));

  /* --- buttons -------------------------------------------------------- */
  const count = new Map();
  store.get().drives.forEach(d => { if (d.errandId) count.set(d.errandId, (count.get(d.errandId) || 0) + 1); });
  const rows = [...errands.main(), ...errands.takeaway()].map(e => {
    const pinned = e.lat !== null && e.lat !== undefined;
    const bits = [`${e.minutes} min`, e.group === 'takeaway' ? 'takeaway' : null, pinned ? (e.routeKm ? `${S.fmtKm(e.routeKm)} km away` : 'pinned') : 'no pin'].filter(Boolean);
    return el('button', { class: 'item plain', onclick: () => openErrandEditor(e) },
      icon(e.icon),
      el('div', { class: 'mid' }, el('div', { class: 'nm', text: e.name }), el('div', { class: 'ds', text: bits.join(' · ') })),
      el('span', { class: 'end' }, `${count.get(e.id) || 0}×`, el('i', { class: 'chev' })));
  });
  rows.push(el('button', { class: 'item plain', onclick: () => openErrandEditor(null) },
    icon('plus'), el('div', { class: 'mid' }, el('div', { class: 'nm', text: 'Add a button' }))));
  root.appendChild(group('Errand buttons', ...rows));
  root.appendChild(el('p', { class: 'help-text', text: 'Pin a place (tap it, then “I’m here now”) and its runs get km and a line on the map.' }));

  /* --- iPhone buttons ------------------------------------------------- */
  root.appendChild(group('iPhone home-screen buttons',
    urlRow('GO', SITE + '?go=1'),
    urlRow('BACK', SITE + '?end=1')
  ));
  const how = el('p', { class: 'help-text' });
  how.innerHTML = 'In the <b>Shortcuts</b> app: <b>+</b> → <b>Open URLs</b> → paste the link → name it → <b>Add to Home Screen</b>. ' +
    'Tap <b>GO</b> as you walk out, <b>BACK</b> when you walk in. Both are safe to double-tap. Never touch the phone while driving.';
  root.appendChild(how);

  /* --- backup --------------------------------------------------------- */
  const file = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  file.addEventListener('change', importFile);
  const backupRows = [
    el('button', { class: 'item plain', onclick: () => download(store.exportJSON(), `hours-${S.dayKey(Date.now())}.json`) },
      el('div', { class: 'mid' }, el('div', { class: 'nm', text: 'Export a backup' }), el('div', { class: 'ds', text: 'Saves every run to a file' }))),
    el('button', { class: 'item plain', onclick: () => file.click() },
      el('div', { class: 'mid' }, el('div', { class: 'nm', text: 'Import a backup' }), el('div', { class: 'ds', text: 'Adds runs from a file' })))
  ];
  if (store.preV2Backup()) backupRows.push(el('button', { class: 'item plain', onclick: () => download(store.preV2Backup(), 'hours-before-update.json') },
    el('div', { class: 'mid' }, el('div', { class: 'nm', text: 'Download the old data' }), el('div', { class: 'ds', text: 'Everything from before this update, gym trips included' }))));
  root.appendChild(group('Backup', ...backupRows, file));

  root.appendChild(el('button', { class: 'btn danger wide', style: { marginTop: '28px' }, text: 'Erase everything', onclick: wipe }));
  root.appendChild(el('div', { class: 'version', text: 'HOURS 2 · YOUR DATA STAYS ON THIS PHONE' }));
}

export function unmount() {}

/* --- pieces ------------------------------------------------------------ */

function group(title, ...children) {
  return el('div', { class: 'group' }, el('span', { class: 'label', text: title }), el('div', { class: 'group-box' }, ...children));
}

function urlRow(label, url) {
  return el('div', { class: 'url' },
    el('span', { class: 'nm sun-text', text: label }),
    el('code', { text: url }),
    el('button', {
      class: 'btn sm ghost', text: 'Copy',
      onclick: async ev => {
        try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Copied'; }
        catch (e) { toast('Couldn’t copy — press and hold the link instead.'); }
      }
    }));
}

async function setHome() {
  toast('Finding you…', { ms: 1500 });
  const fix = await getFix();
  if (!fix.ok) { toast('Location is off for HOURS — turn it on in iPhone Settings.'); return; }
  store.setting('homeCoords', fix.coords);
  errands.resolveRoutes();
  toast('Home set.');
  show('settings');
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = el('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const res = store.importJSON(await f.text(), 'merge');
    toast(`Imported — ${res.drives} runs now.`);
    show('settings');
  } catch (e) {
    toast(e.message || 'That file didn’t work.');
  }
}

async function wipe() {
  const sure = await ask({
    title: 'Erase everything?',
    body: 'Every run and button on this phone is deleted. Export a backup first if you might want it.',
    buttons: [{ label: 'Erase', value: true, style: 'danger' }, { label: 'Keep my data', value: false, style: 'ghost' }]
  });
  if (!sure) return;
  store.wipe();
  errands.seed();
  toast('Erased.');
  show('home');
}
