/* HOURS — main.js
   Boot, the ?go=1 / ?end=1 home-screen buttons, and what must happen every
   time the app comes back to life: recompute the clock from its timestamp. */

import * as store from './store.js';
import * as drive from './drive.js';
import * as errands from './errands.js';
import * as screens from './ui/screens.js';
import { el, sheet } from './ui/widgets.js';
import { back } from './ui/driving.js';

function boot() {
  store.load();
  errands.seed();                        // the one-tap buttons, first time only
  errands.backfill();                    // the Sept 2026 runs that were never logged
  screens.init();
  store.setting('lastOpened', Date.now());

  const params = new URLSearchParams(location.search);
  const wantsGo = params.has('go');
  const wantsEnd = params.has('end');
  if (wantsGo || wantsEnd || params.has('src')) {
    history.replaceState(null, '', location.pathname);   // a refresh must not re-fire it
  }

  /* --- the home-screen buttons -------------------------------------- */
  if (wantsGo) {
    if (!store.getLive()) drive.start();                 // a double tap is harmless
    screens.show('driving');
  } else if (wantsEnd && store.getLive()) {
    back();                                              // same as tapping I'M BACK
  } else if (store.getLive() && !drive.isStale()) {
    screens.show('driving');                             // reopened mid-run
  } else {
    screens.show('home');
  }

  if (!store.get().settings.seenV2 && !wantsGo && !wantsEnd) whatsNew();

  errands.resolveRoutes();

  // any change to runs or buttons re-draws the screen underneath (not the
  // live clock or the map, which look after themselves)
  let pending = null;
  const redraw = () => {
    clearTimeout(pending);
    pending = setTimeout(() => {
      const now = screens.current();
      if (now && now !== 'driving' && now !== 'map') screens.refresh();
    }, 30);
  };
  store.on('drives', redraw);
  store.on('errands', redraw);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const now = screens.current();
    if (now && now !== 'driving' && now !== 'map') screens.refresh();
  });
  window.addEventListener('online', () => errands.resolveRoutes());

  /* The service worker lets the app open with no signal. Not on localhost,
     where it would serve stale code while building. */
  const localDev = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(location.hostname);
  if ('serviceWorker' in navigator && !localDev) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  window.HOURS = { store, drive, errands, screens };   // a handle for the console
}

/* One time only: what changed in HOURS 2. */
function whatsNew() {
  const s = store.get();
  const added = s.drives.filter(d => d.origin === 'backfill').length;
  sheet((panel, close) => {
    panel.appendChild(el('div', { class: 'label', text: 'HOURS 2' }));
    panel.appendChild(el('h2', { style: { marginTop: '8px' } }, 'Now it only counts ', el('span', { class: 'sun-text', text: 'time helping the family.' })));
    const list = el('div', { class: 'stack field' },
      point('Tap GO as you walk out, I’M BACK when you walk in. Shopping and waiting count too.'),
      point('Forgot? One tap on an errand button logs it with its usual time.'),
      added ? point(`${added} runs from the last two weeks have been added for you.`) : null,
      point('Personal drives and the gym are gone. The old data is still downloadable in Settings.'),
      point('Show the family the Proof tab.')
    );
    panel.appendChild(list);
    panel.appendChild(el('div', { class: 'foot' }, el('button', { class: 'btn primary wide', text: 'Let’s go', onclick: close })));
  }, { onClose: () => store.setting('seenV2', true) });
}
function point(text) {
  return el('div', { style: { display: 'flex', gap: '12px', color: 'var(--tx-2)' } },
    el('span', { class: 'sun-text', style: { fontWeight: '800' }, text: '—' }), el('span', { text }));
}

boot();
