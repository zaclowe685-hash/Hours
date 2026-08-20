/* HOURS — ui/screens.js
   Mounts one screen at a time into #screens, and owns the bottom tab bar.
   The driving screen is the odd one out: full-bleed, no tab bar. */

import { el, clear, svg } from './widgets.js';
import * as home from './home.js';
import * as log from './log.js';
import * as mapUI from './map.js';
import * as insights from './insights.js';
import * as settings from './settings.js';
import * as driving from './driving.js';

const SCREENS = { home, log, map: mapUI, insights, settings, driving };

const TABS = [
  { id: 'home',     label: 'Home',     icon: 'M3 11.2 12 4l9 7.2V20a1 1 0 0 1-1 1h-5v-6.2H9V21H4a1 1 0 0 1-1-1z' },
  { id: 'log',      label: 'Log',      icon: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6' },
  { id: 'map',      label: 'Map',      icon: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14' },
  { id: 'insights', label: 'Stats',    icon: 'M4 20V12M9.3 20V5M14.7 20v-6M20 20V9' },
  { id: 'settings', label: 'Setup',    icon: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6' }
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

  const node = el('div', { class: 'screen' + (name === 'driving' || name === 'map' ? ' full' : '') });
  host.appendChild(node);
  mod.mount(node, opts);

  tabbar.classList.toggle('hidden', name === 'driving');
  [...tabbar.children].forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name !== 'driving') window.scrollTo(0, 0);
}

export function current() { return currentName; }

/* Re-render the screen he is looking at, if the data under it changed. */
export function refresh() {
  if (currentName && currentName !== 'driving') show(currentName);
}
