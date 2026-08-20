/* HOURS — ui/settings.js */

import * as store from '../store.js';
import * as S from '../stats.js';
import { getFix } from '../geo.js';
import { el, clear, sheet, ask, toast } from './widgets.js';
import { show } from './screens.js';
import { openRoutines } from './routinesUI.js';

export const APP_VERSION = '1.0.0';
export const LIVE_URL = 'https://zaclowe685-hash.github.io/Hours/';

function liveBase() {
  // on the real site, use the address he is actually on
  if (location.protocol.startsWith('http') && !/^(localhost|127|192\.168|10\.)/.test(location.hostname)) {
    return location.origin + location.pathname.replace(/index\.html$/, '');
  }
  return LIVE_URL;
}

export function mount(root) {
  root.appendChild(el('div', { class: 'screen-head' }, el('h1', { text: 'SETUP' })));

  /* --- put it on your phone (the important one) --------------------- */
  const url = liveBase();
  const guide = el('div', { class: 'card' },
    el('h2', { text: 'Put it on your phone' }),
    el('p', { class: 'muted tiny', text: 'This is the whole point — one tap from your home screen, no app to open.' })
  );

  const urlRow = el('div', { class: 'row', style: { marginTop: '14px', gap: '8px' } },
    el('code', { class: 'url', text: url }),
    el('button', {
      class: 'btn', text: 'Copy',
      onclick: async () => {
        try { await navigator.clipboard.writeText(url); toast('Copied.'); }
        catch (e) { toast('Copy it by hand: ' + url, { ms: 6000 }); }
      }
    })
  );
  guide.appendChild(urlRow);

  const steps = el('ol', { class: 'guide', style: { marginTop: '18px' } });
  [
    ['Open that link in <b>Safari</b> on your iPhone, tap the Share button, then <b>Add to Home Screen</b>. That gives you the app itself.'],
    ['Make the one-tap GO widget: <b>Shortcuts</b> app → <b>+</b> → Add Action → <b>Open URL</b> → paste <code>' + url + '?go=1</code> → name it <b>GO</b> → pick a coral icon → <b>Add to Home Screen</b>.'],
    ['Do the same again with <code>' + url + '?end=1</code> and call it <b>HOME</b>. Two widgets side by side is the fastest version of this app: tap GO getting in, tap HOME getting out.'],
    ['Put them where your thumb already is: long-press the home screen → <b>+</b> → <b>Shortcuts</b> widget. They can also go on the <b>Lock Screen</b>, or on <b>Back Tap</b> (Settings → Accessibility → Touch → Back Tap → Double Tap → Shortcuts → GO).']
  ].forEach(([html]) => steps.appendChild(el('li', { html })));
  guide.appendChild(steps);
  root.appendChild(guide);

  /* --- home location ------------------------------------------------ */
  const home = store.get().settings.homeCoords;
  root.appendChild(el('div', { class: 'card' },
    el('h2', { text: 'Home location' }),
    el('p', { class: 'muted tiny', text: home ? 'Set. Drives that end here are logged as round trips.' : 'Not set yet. Tap the button while you are at home.' }),
    el('div', { class: 'row', style: { marginTop: '12px' } },
      el('button', {
        class: 'btn primary', text: home ? 'Reset to where I am now' : 'I am home now',
        onclick: async () => {
          const fix = await getFix();
          if (fix.ok) { store.setting('homeCoords', fix.coords); toast('Home saved.'); show('settings'); }
          else toast(fix.status === 'denied' ? 'No location permission.' : 'Could not find you.');
        }
      }),
      home && el('button', {
        class: 'btn ghost', text: 'Forget it',
        onclick: () => { store.setting('homeCoords', null); show('settings'); toast('Forgotten.'); }
      })
    )
  ));

  /* --- routines ------------------------------------------------------ */
  const rs = store.get().routines;
  const active = rs.filter(r => r.enabled).length;
  root.appendChild(el('div', { class: 'card' },
    el('h2', { text: 'Routines' }),
    el('p', { class: 'muted tiny', text: `${rs.length} routine${rs.length === 1 ? '' : 's'}, ${active} running. Drives you always take, logged for you.` }),
    el('button', { class: 'btn wide', style: { marginTop: '12px' }, text: 'Open routines', onclick: () => openRoutines() })
  ));

  /* --- data ----------------------------------------------------------- */
  const s = store.get();
  root.appendChild(el('div', { class: 'card' },
    el('h2', { text: 'Your data' }),
    el('p', { class: 'muted tiny', text: `${s.drives.length} drives · ${s.places.length} places · saved on this device only.` }),
    el('div', { class: 'row', style: { marginTop: '12px', gap: '8px' } },
      el('button', { class: 'btn', text: 'Export', onclick: exportData }),
      el('button', { class: 'btn', text: 'Import', onclick: importData })
    )
  ));

  /* --- danger zone ---------------------------------------------------- */
  root.appendChild(el('div', { class: 'card' },
    el('h2', { text: 'Danger zone' }),
    el('p', { class: 'muted tiny', text: 'Deletes every drive, place and routine on this device. There is no undo.' }),
    el('button', { class: 'btn danger wide', style: { marginTop: '12px' }, text: 'Delete all data', onclick: deleteEverything })
  ));

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'set-row' }, el('span', { class: 'k', text: 'Version' }), el('span', { class: 'v', text: APP_VERSION })),
    el('div', { class: 'set-row' }, el('span', { class: 'k', text: 'Read me' }),
      el('a', { class: 'v', href: 'README.md', target: '_blank', text: 'README.md →' })),
    el('div', { class: 'set-row' }, el('span', { class: 'k', text: 'Routes by' }), el('span', { class: 'v', text: 'OSRM · OpenStreetMap · CARTO' }))
  ));
}

export function unmount() {}

/* --- export / import ---------------------------------------------------- */

function exportData() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `hours-backup-${S.dayKey(Date.now())}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Backup saved to your downloads.');
}

function importData() {
  const input = el('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    const text = await file.text();

    const mode = await ask({
      title: 'Import backup',
      body: 'Replace everything on this device, or merge the two together?',
      buttons: [
        { label: 'Merge with what I have', value: 'merge' },
        { label: 'Replace everything', value: 'replace', style: 'danger' },
        { label: 'Cancel', value: null }
      ]
    });
    if (!mode) return;

    try {
      const res = store.importJSON(text, mode);
      show('settings');
      toast(`Imported. ${res.drives} drives.`);
    } catch (e) {
      toast(e.message || 'That file would not import.', { ms: 5000 });
    }
  });
  input.click();
}

function deleteEverything() {
  sheet((panel, close) => {
    panel.appendChild(el('h2', { text: 'Delete everything?' }));
    panel.appendChild(el('p', { class: 'muted tiny', style: { marginTop: '6px' }, text: 'Type DELETE to confirm. This cannot be undone — export a backup first if you are not sure.' }));
    const field = el('input', { class: 'field', type: 'text', placeholder: 'DELETE', style: { marginTop: '14px' }, autocapitalize: 'characters' });
    const go = el('button', { class: 'btn danger wide', style: { marginTop: '14px' }, text: 'Delete all data', disabled: true });
    field.addEventListener('input', () => { go.disabled = field.value.trim().toUpperCase() !== 'DELETE'; });
    go.addEventListener('click', () => {
      store.wipe();
      close();
      show('home');
      toast('All gone.');
    });
    panel.appendChild(field);
    panel.appendChild(go);
    panel.appendChild(el('button', { class: 'btn ghost wide', style: { marginTop: '10px' }, text: 'Cancel', onclick: close }));
  });
}
