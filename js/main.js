/* HOURS — main.js
   Boot, the atmosphere layer, the ?go=1 / ?end=1 widget hooks, and the two
   things that must happen every time the app comes back to life: recompute
   the clock from its timestamp, and let the routines catch up. */

import * as store from './store.js';
import * as drive from './drive.js';
import * as routines from './routines.js';
import * as screens from './ui/screens.js';
import { el, sheet, toast } from './ui/widgets.js';
import { endDrive } from './ui/finish.js';

const CATCHUP_EVERY_MS = 60000;

function boot() {
  store.load();
  paintGrain();
  screens.init();

  const first = store.get().settings.firstRun;
  if (first) {
    routines.seed();                    // one routine: Gym, Wed + Fri, 6:30am
    store.setting('firstRun', false);
  }
  store.setting('lastOpened', Date.now());

  const caught = routines.catchUp();
  if (caught.capped) {
    setTimeout(() => toast('Only filled in the last two weeks.', { ms: 5000 }), 1200);
  }

  const params = new URLSearchParams(location.search);
  const wantsGo = params.has('go');
  const wantsEnd = params.has('end');
  if (wantsGo || wantsEnd || params.has('src')) {
    history.replaceState(null, '', location.pathname);   // a refresh must not re-fire it
  }

  /* --- the widget hooks --------------------------------------------- */
  if (wantsGo) {
    if (!store.getLive()) drive.start();                 // a double tap is harmless
    screens.show('driving');
  } else if (wantsEnd && store.getLive()) {
    screens.show('home');
    endDrive();
  } else if (store.getLive() && !drive.isStale()) {
    screens.show('driving');                             // reopened mid-drive: normal
  } else {
    screens.show('home');
  }

  if (!store.get().settings.seenTour && !wantsGo && !wantsEnd) showTour();

  drive.retryPendingRoutes();

  setInterval(() => {
    const before = store.get().drives.length;
    routines.catchUp();
    if (store.get().drives.length !== before && screens.current() === 'home') screens.refresh();
  }, CATCHUP_EVERY_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    routines.catchUp();
    drive.retryPendingRoutes();
    const now = screens.current();
    if (now && now !== 'driving' && now !== 'map') screens.refresh();
  });

  window.addEventListener('online', () => drive.retryPendingRoutes());

  /* The service worker is what makes the app open with no signal — but its
     cache-first shell would also serve stale code while building locally, so
     it is only registered on the real site, never on localhost or the LAN. */
  const localDev = /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.|10\.)/.test(location.hostname);
  if ('serviceWorker' in navigator && !localDev) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  // a small handle for poking at it in the console
  window.HOURS = { store, drive, routines, screens };
}

/* --- film grain: one canvas of static noise, tiled ------------------- */

function paintGrain() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const node = document.getElementById('grain');
  if (node) node.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
}

/* --- first-run tour --------------------------------------------------- */

const TOUR = [
  { n: '1', h: 'Tap GO when you get in', p: 'One tap as you sit down. That is the whole app.' },
  { n: '2', h: 'Lock your phone', p: 'The clock keeps running with the screen off. It is a stored time, not a ticking counter — it cannot drift and it cannot be lost.' },
  { n: '3', h: 'Tap HOME when you are back', p: 'Hold the red button for a moment, say whether you were sent or you chose it, and it is logged.' }
];

function showTour() {
  let i = 0;
  const back = el('div', { class: 'tour-back' });
  const card = el('div', { class: 'tour-card' });
  back.appendChild(card);

  function paint() {
    card.replaceChildren();
    const step = TOUR[i];
    const dots = el('div', { class: 'tour-dots' });
    TOUR.forEach((_, k) => dots.appendChild(el('i', { class: k === i ? 'on' : '' })));
    card.appendChild(el('div', { class: 'n', text: step.n }));
    card.appendChild(el('h2', { text: step.h }));
    card.appendChild(el('p', { text: step.p }));
    card.appendChild(dots);
    card.appendChild(el('button', {
      class: 'btn primary wide',
      text: i === TOUR.length - 1 ? 'Got it' : 'Next',
      onclick: () => { i++; if (i >= TOUR.length) done(); else paint(); }
    }));
    card.appendChild(el('button', { class: 'text-btn', text: 'Skip', onclick: done }));
  }
  function done() {
    store.setting('seenTour', true);
    back.remove();
  }
  paint();
  document.body.appendChild(back);
}

/* everything above is declared before this runs */
boot();
