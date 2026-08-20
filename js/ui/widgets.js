/* HOURS — ui/widgets.js
   The shared pieces: the mechanical odometer, bottom sheets, toasts, the
   category toggle, the hold-to-end button, tag input, steppers, switches. */

/* --- tiny DOM helper --------------------------------------------------- */

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
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

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export const reduceMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --- the palette, read once from theme.css ------------------------------
   Canvas and SVG cannot use CSS custom properties, so they ask for them
   here rather than repeating hex codes around the app. */

let _pal = null;
export function palette() {
  if (_pal) return _pal;
  const css = getComputedStyle(document.documentElement);
  const g = k => css.getPropertyValue(k).trim();
  _pal = {
    ink: g('--ink'), ink2: g('--ink-2'), ink3: g('--ink-3'),
    coral: g('--coral'), rust: g('--rust'), peach: g('--peach'),
    teal: g('--teal'), bone: g('--bone'), dust: g('--dust'),
    inkWarm: g('--ink-warm'), inkCool: g('--ink-cool'),
    roadFar: g('--road-far'), roadNear: g('--road-near')
  };
  return _pal;
}

/* #RRGGBB -> rgba(...) at the alpha you want */
export function alpha(hex, a) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/* --- the odometer ------------------------------------------------------
   Vertical strips of 0-9 behind a window, each digit rolling 40 ms after the
   one to its right so the number cascades like a real mechanical counter. */

const DIGIT_H_EM = 1.32;   // must match .odo-digit height in app.css

export function odometer({ value = 0, minDigits = 1, className = '' } = {}) {
  const node = el('div', { class: 'odo ' + className });
  let digitCount = 0;

  function build(n) {
    clear(node);
    for (let i = 0; i < n; i++) {
      const strip = el('div', { class: 'odo-strip' });
      for (let d = 0; d <= 9; d++) strip.appendChild(el('span', { text: String(d) }));
      strip.style.transition = reduceMotion()
        ? 'none'
        : `transform 700ms cubic-bezier(.2,.9,.25,1)`;
      node.appendChild(el('div', { class: 'odo-digit' }, strip));
    }
    digitCount = n;
  }

  function set(v, { animate = true } = {}) {
    const str = String(Math.max(0, Math.round(Number(v) || 0))).padStart(minDigits, '0');
    if (str.length !== digitCount) build(str.length);
    [...str].forEach((ch, i) => {
      const strip = node.children[i].firstChild;
      const delay = (str.length - 1 - i) * 40;
      strip.style.transitionDelay = animate ? delay + 'ms' : '0ms';
      strip.style.transform = `translateY(-${Number(ch) * DIGIT_H_EM}em)`;
    });
  }

  build(String(Math.max(0, Math.round(value))).padStart(minDigits, '0').length);
  set(0, { animate: false });

  return { node, set };
}

/* The app's handshake: the big number rolls up from zero on every open. */
export function odometerCountUp(odo, target) {
  requestAnimationFrame(() => requestAnimationFrame(() => odo.set(target)));
}

/* --- toasts ------------------------------------------------------------ */

export function toast(message, { action = null, ms = 3200 } = {}) {
  const host = document.getElementById('toast-host');
  if (!host) return { close() {} };

  let done = false;
  const node = el('div', { class: 'toast' }, el('span', { text: message }));
  let timer;

  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    node.classList.add('out');
    setTimeout(() => node.remove(), 220);
  };

  if (action) {
    node.appendChild(el('button', {
      text: action.label,
      onclick: () => { close(); action.fn(); }
    }));
  }
  host.appendChild(node);
  timer = setTimeout(close, ms);
  return { close };
}

/* --- bottom sheet ------------------------------------------------------ */

let openSheets = 0;

export function sheet(build, { onClose = null, dismissible = true } = {}) {
  const panel = el('div', { class: 'sheet' }, el('div', { class: 'sheet-grip' }));
  const back = el('div', { class: 'sheet-back' }, panel);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    panel.classList.add('closing');
    back.style.animation = 'fade-in 180ms reverse both';
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

/* A yes/no (or several-button) sheet. Resolves with the chosen value. */
export function ask({ title, body = '', buttons }) {
  return new Promise(resolve => {
    sheet((panel, close) => {
      panel.appendChild(el('h2', { text: title }));
      if (body) panel.appendChild(el('p', { class: 'muted tiny', text: body, style: { marginTop: '6px' } }));
      const row = el('div', { class: 'stack', style: { marginTop: '20px' } });
      buttons.forEach(b => row.appendChild(el('button', {
        class: 'btn wide ' + (b.style || ''),
        text: b.label,
        onclick: () => { close(); resolve(b.value); }
      })));
      panel.appendChild(row);
    }, { onClose: () => resolve(null) });
  });
}

/* --- the category toggle ----------------------------------------------- */

export function categoryToggle(initial, onChange) {
  let value = initial || null;
  const halves = {};

  function paint() {
    Object.entries(halves).forEach(([cat, node]) => node.classList.toggle('on', value === cat));
  }

  function half(cat, title, sub) {
    const node = el('button', { class: 'cat-half', data: { cat } },
      el('div', { class: 't', text: title }),
      el('div', { class: 's', text: sub })
    );
    node.addEventListener('click', () => {
      value = cat;
      paint();
      if (onChange) onChange(cat);
    });
    halves[cat] = node;
    return node;
  }

  const node = el('div', { class: 'cat-toggle' },
    half('sent', 'SENT', 'someone asked'),
    half('chose', 'CHOSE', 'yours')
  );
  paint();
  return { node, get value() { return value; }, set(v) { value = v; paint(); } };
}

/* --- hold-to-end button ------------------------------------------------ */

export function holdButton({ label, holdMs = 600, onComplete }) {
  const fill = el('div', { class: 'hold-fill' });
  const node = el('button', { class: 'hold-btn' }, fill, el('span', { text: label }));

  let raf = null, timer = null, startedAt = 0, fired = false;

  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (timer) { clearTimeout(timer); timer = null; }
    fill.style.width = '0%';
  }
  function fire() {
    if (fired) return;
    fired = true;
    stop();
    onComplete();
  }
  /* the ring is painted by rAF, but completion is on a plain timer: ending
     the drive must not depend on animation frames being scheduled */
  function tick() {
    const p = Math.min(1, (Date.now() - startedAt) / holdMs);
    fill.style.width = (p * 100) + '%';
    if (p < 1) raf = requestAnimationFrame(tick);
  }
  function begin(e) {
    e.preventDefault();
    if (fired) return;
    startedAt = Date.now();
    timer = setTimeout(fire, holdMs);
    raf = requestAnimationFrame(tick);
  }

  node.addEventListener('pointerdown', begin);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => node.addEventListener(ev, stop));
  return node;
}

/* --- tag input ---------------------------------------------------------- */
/* space or enter turns what he typed into a chip. */

export function tagInput({ initial = [], suggestions = [], onChange = null } = {}) {
  let tags = [...initial];
  const live = el('div', { class: 'tag-chips' });
  const sugg = el('div', { class: 'tag-chips' });
  const input = el('input', {
    class: 'field',
    type: 'text',
    placeholder: 'woolies, brother, beach…',
    autocapitalize: 'none',
    autocorrect: 'off'
  });

  function fire() { if (onChange) onChange([...tags]); }

  function add(raw) {
    const t = String(raw).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!t || tags.includes(t)) return;
    tags.push(t);
    paint();
    fire();
  }
  function remove(t) {
    tags = tags.filter(x => x !== t);
    paint();
    fire();
  }

  function paint() {
    clear(live);
    tags.forEach(t => live.appendChild(el('button', {
      class: 'tag live', onclick: () => remove(t)
    }, '#' + t, el('b', { text: '✕' }))));

    clear(sugg);
    suggestions.filter(s => !tags.includes(s)).slice(0, 6).forEach(s =>
      sugg.appendChild(el('button', { class: 'tag', text: '#' + s, onclick: () => add(s) }))
    );
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
      e.preventDefault();
      add(input.value);
      input.value = '';
    } else if (e.key === 'Backspace' && !input.value && tags.length) {
      remove(tags[tags.length - 1]);
    }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) { add(input.value); input.value = ''; } });

  paint();
  const node = el('div', {}, input, live, sugg);
  return { node, get value() { return [...tags]; }, commitTyped() { if (input.value.trim()) { add(input.value); input.value = ''; } } };
}

/* --- stepper ------------------------------------------------------------ */

export function stepper({ value = 10, step = 5, min = 1, max = 600, format = v => v + ' min', onChange = null } = {}) {
  let v = value;
  const out = el('div', { class: 'val', text: format(v) });
  function set(nv) {
    v = Math.min(max, Math.max(min, nv));
    out.textContent = format(v);
    if (onChange) onChange(v);
  }
  const node = el('div', { class: 'stepper' },
    el('button', { text: '−', onclick: () => set(v - step) }),
    out,
    el('button', { text: '+', onclick: () => set(v + step) })
  );
  return { node, get value() { return v; }, set };
}

/* --- switch -------------------------------------------------------------- */

export function toggleSwitch(on, onChange) {
  const node = el('button', { class: 'switch' + (on ? ' on' : ''), 'aria-pressed': String(!!on) });
  node.addEventListener('click', () => {
    const next = !node.classList.contains('on');
    node.classList.toggle('on', next);
    node.setAttribute('aria-pressed', String(next));
    onChange(next);
  });
  return node;
}

/* --- day-of-week pills ---------------------------------------------------- */

const PILL_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function dayPills({ days = [], category = 'chose', onChange }) {
  let value = [...days];
  const node = el('div', { class: 'day-pills' });
  const nodes = [];

  function paint() {
    nodes.forEach((p, i) => {
      p.className = 'day-pill' + (value.includes(i) ? ' on ' + category : '');
    });
  }
  for (let i = 0; i < 7; i++) {
    const p = el('button', { class: 'day-pill', text: PILL_LETTERS[i] });
    p.addEventListener('click', () => {
      value = value.includes(i) ? value.filter(d => d !== i) : [...value, i].sort();
      paint();
      onChange([...value]);
    });
    nodes.push(p);
    node.appendChild(p);
  }
  paint();
  return { node, get value() { return [...value]; }, setCategory(c) { category = c; paint(); } };
}

/* --- svg helper ----------------------------------------------------------- */

export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => { if (v !== null && v !== undefined) node.setAttribute(k, v); });
  children.flat().forEach(c => c && node.appendChild(c));
  return node;
}
