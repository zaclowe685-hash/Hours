/* HOURS — ui/driving.js
   Full-bleed live drive. A canvas road scrolls behind a very large clock.

   Battery matters here: this screen is up while he is driving. The canvas is
   capped at 30 fps and the loop stops dead when the page is hidden. The clock
   is never accumulated — it is always Date.now() - startedAt. */

import * as store from '../store.js';
import * as drive from '../drive.js';
import { fmtClock, fmtTime } from '../stats.js';
import { el, holdButton, reduceMotion, palette, alpha } from './widgets.js';
import { show } from './screens.js';
import { endDrive } from './finish.js';

let raf = null, road = null, unsubLive = null, tickTimer = null;
let onVisibility = null;

export function mount(root) {
  const live = store.getLive();
  if (!live) { show('home'); return; }

  const canvas = el('canvas', { id: 'road-canvas' });
  const timer = el('div', { class: 'drive-timer', text: fmtClock(drive.elapsedMs()) });
  const gpsLine = el('span', { text: gpsText(live.geoStatus), class: gpsClass(live.geoStatus) });

  const screen = el('div', { id: 'drive-screen' },
    canvas,
    el('div', { class: 'drive-mid' },
      timer,
      el('div', { class: 'drive-meta' },
        el('span', { text: 'STARTED ' + fmtTime(live.startedAt).toUpperCase() }),
        gpsLine
      )
    ),
    el('div', { class: 'drive-bottom' },
      holdButton({ label: 'HOME', holdMs: 600, onComplete: () => endDrive() }),
      el('div', { class: 'hold-hint', text: 'hold to end' }),
      el('div', { class: 'screen-off-note', text: 'Screen can go off — the clock keeps running.' })
    )
  );
  root.appendChild(screen);

  /* keep the GPS line honest as the fix lands */
  unsubLive = store.on('live', () => {
    const l = store.getLive();
    if (!l) return;
    gpsLine.textContent = gpsText(l.geoStatus);
    gpsLine.className = gpsClass(l.geoStatus);
  });

  road = createRoad(canvas);
  startLoop(timer);

  onVisibility = () => {
    if (document.hidden) {
      stopLoop();
    } else {
      // recompute from the timestamp, never catch a counter up
      timer.textContent = fmtClock(drive.elapsedMs());
      if (road) road.resize();
      startLoop(timer);
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onVisibility);
}

export function unmount() {
  stopLoop();
  if (unsubLive) { unsubLive(); unsubLive = null; }
  if (onVisibility) {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onVisibility);
    onVisibility = null;
  }
  if (road) { road.destroy(); road = null; }
}

function gpsText(status) {
  if (status === 'ok') return 'LOCATION LOCKED';
  if (status === 'pending') return 'FINDING YOU…';
  return 'NO LOCATION';
}
function gpsClass(status) {
  return status === 'ok' ? 'gps-ok' : status === 'pending' ? '' : 'gps-none';
}

/* --- the loop ---------------------------------------------------------- */

function startLoop(timer) {
  stopLoop();
  if (reduceMotion()) {
    if (road) road.drawStatic();
    tickTimer = setInterval(() => { timer.textContent = fmtClock(drive.elapsedMs()); }, 1000);
    return;
  }
  let last = 0;
  let lastSecond = -1;
  const FRAME = 1000 / 30;               // 30 fps cap
  const step = now => {
    raf = requestAnimationFrame(step);
    if (now - last < FRAME) return;
    const dt = last ? Math.min(0.2, (now - last) / 1000) : 0;
    last = now;

    const elapsed = drive.elapsedMs();
    const sec = Math.floor(elapsed / 1000);
    if (sec !== lastSecond) { lastSecond = sec; timer.textContent = fmtClock(elapsed); }
    if (road) road.frame(dt, elapsed, now);
  };
  raf = requestAnimationFrame(step);
}

function stopLoop() {
  if (raf) { cancelAnimationFrame(raf); raf = null; }
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

/* --- the road ----------------------------------------------------------
   Real perspective: dashes live at a distance z and are projected to screen.
   z = 0 is the bottom edge, z -> infinity is the horizon, so dashes get both
   shorter and narrower as they recede. */

function createRoad(canvas) {
  const ctx = canvas.getContext('2d');
  const P = palette();
  let W = 0, H = 0, dpr = 1, horizon = 0;
  let offset = 0;

  const CAM = 3.2;            // projection constant
  const SPACING = 5.5;        // world units between dash starts
  const DASH_LEN = 2.6;       // world units of painted dash
  const FAR = 260;            // furthest dash we bother drawing

  const noise = makeNoise();

  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    horizon = H * 0.17;
  }

  const project = z => horizon + (H - horizon) * (CAM / (CAM + z));
  const scaleAt = z => CAM / (CAM + z);

  function paint(elapsedMs, now) {
    ctx.clearRect(0, 0, W, H);

    // sky above the horizon: the sunset we are driving into
    const sky = ctx.createLinearGradient(0, 0, 0, horizon + 40);
    sky.addColorStop(0, P.ink);
    sky.addColorStop(0.62, alpha(P.rust, .26));
    sky.addColorStop(1, alpha(P.rust, .05));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon + 42);

    // the road surface, a trapezoid narrowing to the horizon
    const halfNear = W * 0.72, halfFar = halfNear * scaleAt(FAR);
    const yFar = project(FAR);
    ctx.beginPath();
    ctx.moveTo(W / 2 - halfNear, H);
    ctx.lineTo(W / 2 + halfNear, H);
    ctx.lineTo(W / 2 + halfFar, yFar);
    ctx.lineTo(W / 2 - halfFar, yFar);
    ctx.closePath();
    const surf = ctx.createLinearGradient(0, yFar, 0, H);
    surf.addColorStop(0, P.roadFar);
    surf.addColorStop(1, P.roadNear);
    ctx.fillStyle = surf;
    ctx.fill();

    // a little tarmac grain
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.06;
    for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) ctx.drawImage(noise, x, y);
    ctx.restore();

    // centre-line dashes
    ctx.fillStyle = P.peach;
    const start = offset % SPACING;
    for (let z = -start; z < FAR; z += SPACING) {
      const zA = z, zB = z + DASH_LEN;
      if (zB < 0) continue;
      const yA = project(Math.max(0, zA)), yB = project(zB);
      const wA = Math.max(0.4, 9 * scaleAt(Math.max(0, zA)));
      const wB = Math.max(0.3, 9 * scaleAt(zB));
      ctx.globalAlpha = Math.max(0.12, Math.min(0.85, scaleAt(zA) * 1.5));
      ctx.beginPath();
      ctx.moveTo(W / 2 - wA, yA);
      ctx.lineTo(W / 2 + wA, yA);
      ctx.lineTo(W / 2 + wB, yB);
      ctx.lineTo(W / 2 - wB, yB);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // horizon glow band
    const glow = ctx.createLinearGradient(0, horizon - 60, 0, horizon + 24);
    glow.addColorStop(0, alpha(P.rust, 0));
    glow.addColorStop(0.7, alpha(P.rust, .34));
    glow.addColorStop(1, alpha(P.rust, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, horizon - 60, W, 90);

    // headlight spill down each edge, breathing slowly
    const pulse = 0.5 + 0.5 * Math.sin((now || 0) / 2600);
    const a = 0.10 + 0.06 * pulse;
    [0, 1].forEach(side => {
      const g = ctx.createLinearGradient(side ? W : 0, 0, side ? W - 90 : 90, 0);
      g.addColorStop(0, alpha(P.coral, a));
      g.addColorStop(1, alpha(P.coral, 0));
      ctx.fillStyle = g;
      ctx.fillRect(side ? W - 90 : 0, horizon, 90, H - horizon);
    });
  }

  function frame(dt, elapsedMs, now) {
    // px/s at the bottom of the screen, converted into world units
    const mins = elapsedMs / 60000;
    const pxPerSec = 120 + Math.min(mins, 40) * 9;
    const worldPerSec = pxPerSec * CAM / Math.max(1, (H - horizon));
    offset += worldPerSec * dt;
    paint(elapsedMs, now);
  }

  function drawStatic() { paint(0, 0); }

  const onResize = () => { resize(); paint(0, 0); };
  window.addEventListener('resize', onResize);

  resize();
  paint(0, 0);

  return {
    frame, drawStatic, resize,
    destroy() { window.removeEventListener('resize', onResize); }
  };
}

/* one 128px tile of static monochrome noise, drawn once */
function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 120 + Math.random() * 135;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
