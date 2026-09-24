/* HOURS — ui/screens.js
   Mounts one screen at a time into #screens, and owns the bottom tab bar.
   The driving screen is the odd one out: full-bleed, no tab bar. */

import { el, clear, svg } from './widgets.js';
import * as home from './home.js';
import * as proof from './proof.js';
import * as runs from './runs.js';
import * as mapUI from './map.js';
import * as settings from './settings.js';
import * as driving from './driving.js';

const SCREENS = { home, proof, runs, map: mapUI, settings, driving };

const TABS = [
  { id: 'home',     label: 'Home',     icon: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20' },
  { id: 'proof',    label: 'Proof',    icon: 'M4.5 20V13M9.5 20V6M14.5 20v-9M19.5 20V4' },
  { id: 'runs',     label: 'Runs',     icon: 'M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01' },
  { id: 'map',      label: 'Map',      icon: 'M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14' },
  { id: 'settings', label: 'Settings', icon: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5v5M9 14.5v5' }
];

let currentName = null;
let currentMod = null;
let host = null;
let tabbar = null;

export function init() {
  host = document.getElementById('screens');
  tabbar = document.getElementById('tabbar');
  clear(tabbar);
  TABS.forEach(t => {
    const btn = el('button', { data: { tab: t.id }, 'aria-label': t.label },
      svg('svg', { viewBox: '0 0 24 24' },
        svg('path', { d: t.icon, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })),
      el('span', { text: t.label })
    );
    btn.addEventListener('click', () => show(t.id));
    tabbar.appendChild(btn);
  });
}

export function show(name, opts = {}) {
  const mod = SCREENS[name];
  if (!mod) return;
  if (currentMod && currentMod.unmount) currentMod.unmount();
  clear(host);

  currentName = name;
  currentMod = mod;

  const node = el('div', { class: 'screen' + (name === 'driving' || name === 'map' ? ' full' : '') + (opts.quiet ? ' quiet' : '') });
  host.appendChild(node);
  mod.mount(node, opts);

  tabbar.classList.toggle('hidden', name === 'driving');
  [...tabbar.children].forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name !== 'driving' && !opts.quiet) window.scrollTo(0, 0);
}

export function current() { return currentName; }

/* Re-render the screen he is looking at, if the data under it changed. */
export function refresh() {
  if (!currentName || currentName === 'driving') return;
  const y = window.scrollY;
  show(currentName, { quiet: true });
  window.scrollTo(0, y);
}
