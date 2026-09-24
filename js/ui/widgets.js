/* HOURS — ui/widgets.js
   The shared pieces: DOM helpers, icons, the big sunset number, bottom
   sheets, toasts, the minutes stepper. */

import { hm } from '../stats.js';

/* --- tiny DOM helpers ------------------------------------------------- */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k === 'data' && typeof v === 'object') Object.entries(v).forEach(([dk, dv]) => node.dataset[dk] = dv);
    else node.setAttribute(k, v);
  }
  children.flat().forEach(c => {
    if (c === null || c === undefined || c === false) return;
    node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
  children.flat().forEach(c => c && node.appendChild(c));
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Canvas / SVG / Leaflet can't read CSS variables, so they ask here. */
let _pal = null;
export function palette() {
  if (_pal) return _pal;
  const css = getComputedStyle(document.documentElement);
  const g = k => css.getPropertyValue(k).trim();
  _pal = {
    bg: g('--bg'), s1: g('--s1'), s2: g('--s2'), line2: g('--line-2'),
    tx: g('--tx'), tx2: g('--tx-2'), tx3: g('--tx-3'),
    sun1: g('--sun-1'), sun2: g('--sun-2'), sun3: g('--sun-3'), sun4: g('--sun-4')
  };
  return _pal;
}

/* --- icons (24x24 strokes) -------------------------------------------- */

const ICONS = {
  bag:   'M5.5 8.5h13l-1 11.5h-11zM9 8.5V7a3 3 0 0 1 6 0v1.5',
  cart:  'M3 4h2.2l2.3 10.5h10l2-7.5H6.4M9.5 19.2h.01M16.5 19.2h.01',
  food:  'M4.5 11h15M5.5 11a6.5 6.5 0 0 1 13 0M4 14.5h16M5.5 14.5v.8A3.2 3.2 0 0 0 8.7 18.5h6.6a3.2 3.2 0 0 0 3.2-3.2v-.8',
  pin:   'M12 21s-6.5-5.8-6.5-11A6.5 6.5 0 0 1 18.5 10c0 5.2-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z',
  plus:  'M12 5v14M5 12h14',
  car:   'M5 16.5V12l2-5h10l2 5v4.5M5 16.5h14M5 16.5V19h2.5v-2.5M16.5 16.5V19H19v-2.5M7.5 13.5h.01M16.5 13.5h.01M4 11h2M18 11h2',
  pick:  'M4 17.5h10.5M14.5 17.5l3-3M14.5 17.5l3 3M8 6.5a2.5 2.5 0 1 0 0 .01M4.5 14c.5-2.5 1.8-4 3.5-4s3 1.5 3.5 4',
  home:  'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6 6 18'
};
export const ICON_CHOICES = ['bag', 'cart', 'food', 'pick', 'home', 'pin'];

export function iconSvg(name) {
  return svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
    svg('path', { d: ICONS[name] || ICONS.pin }));
}
export function icon(name, cls = '') {
  return el('span', { class: 'ico ' + cls }, iconSvg(name));
}

/* --- the big sunset number: "4h 40m" ---------------------------------- */

export function bigDuration(ms, cls = '') {
  const node = el('div', { class: 'big ' + cls });
  paintDuration(node, ms);
  return node;
}
export function paintDuration(node, ms) {
  const { h, m } = hm(ms);
  clear(node);
  if (h) node.append(el('span', { class: 'n', text: String(h) }), el('span', { class: 'u', text: 'h' }));
  node.append(el('span', { class: 'n', text: String(m) }), el('span', { class: 'u', text: 'm' }));
}
/* Rolls the number from `from` to `to`, easing out. */
export function countUp(node, from, to, ms = 900) {
  if (reduceMotion() || from === to) { paintDuration(node, to); return; }
  const t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    paintDuration(node, from + (to - from) * e);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* "+32m" floats up from a point — the moment a run lands. */
export function fly(text, x = innerWidth / 2, y = innerHeight * 0.3) {
  const node = el('div', { class: 'fly', text, style: { left: x + 'px', top: y + 'px' } });
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 1200);
}

/* --- toasts ------------------------------------------------------------ */

export function toast(message, { action = null, ms = 3400 } = {}) {
  const host = document.getElementById('toast-host');
  if (!host) return { close() {} };
  let done = false, timer;
  const node = el('div', { class: 'toast' }, el('span', { text: message }));
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  };
  if (action) node.appendChild(el('button', { text: action.label, onclick: () => { close(); action.fn(); } }));
  host.appendChild(node);
  timer = setTimeout(close, ms);
  return { close };
}

/* --- bottom sheet ------------------------------------------------------ */

let openSheets = 0;

export function sheet(build, { onClose = null, dismissible = true } = {}) {
  const panel = el('div', { class: 'sheet', role: 'dialog' }, el('div', { class: 'sheet-grip' }));
  const back = el('div', { class: 'sheet-back' }, panel);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    panel.classList.add('closing');
    back.style.animation = 'fade-in 200ms reverse both';
    setTimeout(() => {
      back.remove();
      openSheets = Math.max(0, openSheets - 1);
      if (!openSheets) document.body.style.overflow = '';
      if (onClose) onClose();
    }, 200);
  }

  back.addEventListener('click', e => { if (e.target === back && dismissible) close(); });
  build(panel, close);
  document.body.appendChild(back);
  openSheets++;
  document.body.style.overflow = 'hidden';
  return { close, panel };
}

/* A several-button question. Resolves with the chosen value (null if dismissed). */
export function ask({ title, body = '', buttons }) {
  return new Promise(resolve => {
    let answered = false;
    sheet((panel, close) => {
      panel.appendChild(el('h2', { text: title }));
      if (body) panel.appendChild(el('p', { class: 'lede', text: body }));
      const row = el('div', { class: 'stack foot' });
      buttons.forEach(b => row.appendChild(el('button', {
        class: 'btn wide ' + (b.style || ''),
        text: b.label,
        onclick: () => { answered = true; close(); resolve(b.value); }
      })));
      panel.appendChild(row);
    }, { onClose: () => { if (!answered) resolve(null); } });
  });
}

/* --- stepper: − 30 min + ----------------------------------------------- */

export function stepper({ value = 30, step = 5, min = 1, max = 600, onChange = null } = {}) {
  let v = value;
  const val = el('div', { class: 'val' });
  const paint = () => {
    const { h, m } = hm(v * 60000);
    clear(val);
    if (h) val.append(String(h), el('small', { text: 'h' }), ' ');
    if (m || !h) val.append(String(m), el('small', { text: 'min' }));
  };
  const set = n => {
    v = Math.max(min, Math.min(max, n));
    paint();
    if (onChange) onChange(v);
  };
  const node = el('div', { class: 'stepper' },
    el('button', { type: 'button', 'aria-label': 'Less', text: '−', onclick: () => set(v - step) }),
    val,
    el('button', { type: 'button', 'aria-label': 'More', text: '+', onclick: () => set(v + step) })
  );
  paint();
  return { node, get: () => v, set };
}

export function switchEl(on, onChange) {
  const b = el('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), type: 'button' });
  b.addEventListener('click', () => {
    on = !on;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    onChange(on);
  });
  return b;
}

/* <input type=datetime-local> wants "YYYY-MM-DDTHH:MM" in local time */
export function toLocalInput(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(s) {
  const t = new Date(s).getTime();
  return isNaN(t) ? null : t;
}
