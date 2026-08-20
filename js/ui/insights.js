/* HOURS — ui/insights.js
   The numbers, honestly. Everything here has to survive 0 drives. */

import * as store from '../store.js';
import * as S from '../stats.js';
import { el, clear, svg, toast, palette, alpha } from './widgets.js';

export function mount(root) {
  const drives = store.get().drives;
  const places = store.get().places;

  root.appendChild(el('div', { class: 'screen-head' }, el('h1', { text: 'STATS' })));

  if (!drives.length) {
    root.appendChild(el('div', { class: 'card' },
      el('h2', { text: 'Nothing yet' }),
      el('p', { class: 'muted tiny', text: 'Log a drive and this page fills up: where your hours go, who they go to, and what time of day you are the family taxi.' })
    ));
    return;
  }

  /* --- the split bar --------------------------------------------- */
  const sentMs = S.totalMs(S.byCategory(drives, 'sent'));
  const choseMs = S.totalMs(S.byCategory(drives, 'chose'));
  const bothMs = Math.max(1, sentMs + choseMs);
  const sentPct = (sentMs / bothMs) * 100;

  const segSent = el('div', { class: 'split-seg sent' }, el('b', { text: S.fmtDur(sentMs) }));
  const segChose = el('div', { class: 'split-seg chose' }, el('b', { text: S.fmtDur(choseMs) }));
  const bar = el('div', { class: 'split-bar' }, segSent, segChose);

  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'label', style: { marginBottom: '10px' } }, 'SENT VS CHOSE, ALL TIME'),
    bar,
    el('div', { class: 'split-legend' },
      el('span', { class: 's', text: `SENT ${Math.round(sentPct)}%` }),
      el('span', { class: 'c', text: `CHOSE ${Math.round(100 - sentPct)}%` })
    )
  ));
  requestAnimationFrame(() => {
    segSent.style.width = sentPct + '%';
    segChose.style.width = (100 - sentPct) + '%';
  });

  /* --- the big honest number -------------------------------------- */
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'big-number' },
      'You have spent ', el('em', { text: S.fmtDur(sentMs) }), ' of your life being sent to the shops.'),
    el('p', { class: 'muted tiny', style: { marginTop: '10px' },
      text: `${S.byCategory(drives, 'sent').length} errand${S.byCategory(drives, 'sent').length === 1 ? '' : 's'} out of ${drives.length} drive${drives.length === 1 ? '' : 's'}.` })
  ));

  /* --- the 24-hour dial ------------------------------------------- */
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'label', style: { marginBottom: '6px' } }, 'WHAT TIME YOU DRIVE'),
    el('div', { class: 'dial-wrap' }, dial(S.hourDial(drives))),
    el('p', { class: 'muted tiny', text: peakLine(S.hourDial(drives)) })
  ));

  /* --- this week vs last ------------------------------------------ */
  const tw = S.weekSummary(drives, S.startOfWeek(Date.now()));
  const lw = S.weekSummary(drives, S.startOfWeek(Date.now()) - 7 * S.DAY_MS);
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'label', style: { marginBottom: '10px' } }, 'THIS WEEK VS LAST'),
    weekRow('Sent', tw.sentMinutes, lw.sentMinutes, 'sent'),
    weekRow('Chose', tw.choseMinutes, lw.choseMinutes, 'chose'),
    weekRow('Drives', tw.drives, lw.drives, null),
    weekRow('Km', tw.km, lw.km, null)
  ));

  /* --- records ----------------------------------------------------- */
  const recs = S.records(drives, places);
  if (recs.length) {
    const box = el('div', { class: 'card' }, el('div', { class: 'label', style: { marginBottom: '12px' } }, 'RECORDS'));
    recs.forEach(r => {
      const d = el('div', { class: 'docket ' + (r.cat || '') });
      d.appendChild(el('div', { class: 'docket-row' },
        el('div', { class: 'docket-place', text: r.k }),
        el('div', { class: 'docket-dur', text: String(r.v) })
      ));
      if (r.sub) d.appendChild(el('div', { class: 'docket-sub' }, el('span', { text: r.sub }), el('span', {})));
      box.appendChild(d);
    });
    root.appendChild(box);
  }

  /* --- top tags ----------------------------------------------------- */
  const tags = S.tagTotals(drives).slice(0, 6);
  if (tags.length) {
    const peak = Math.max(...tags.map(t => t.ms), 1);
    const bars = el('div', { class: 'bars' });
    tags.forEach(t => {
      const fill = el('div', { class: 'bar-fill', style: { width: '0%' } });
      bars.appendChild(el('div', { class: 'bar-row' },
        el('div', { class: 'n', text: '#' + t.tag }),
        el('div', { class: 'bar-track' }, fill),
        el('div', { class: 't', text: S.fmtMins(t.ms) + 'm' })
      ));
      requestAnimationFrame(() => { fill.style.width = Math.max(4, (t.ms / peak) * 100) + '%'; });
    });
    root.appendChild(el('div', { class: 'card' },
      el('div', { class: 'label', style: { marginBottom: '12px' } }, 'TOP TAGS'), bars));
  }

  /* --- the weekly wrap --------------------------------------------- */
  root.appendChild(wrapSection(drives));
}

export function unmount() {}

/* --- pieces -------------------------------------------------------- */

function weekRow(label, now, before, cat) {
  const d = S.delta(now, before);
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '–';
  const good = cat === 'sent' ? 'down' : 'up';
  const cls = d.dir === 'flat' ? 'flat' : (d.dir === good ? 'good' : 'bad');
  return el('div', { class: 'set-row' },
    el('div', { class: 'k', text: label }),
    el('div', { class: 'row' },
      el('span', { class: 'v', text: String(now) }),
      el('span', { class: 'd ' + cls, text: d.dir === 'flat' ? '–' : `${arrow} ${d.diff}` })
    )
  );
}

function peakLine(hours) {
  const top = [...hours].sort((a, b) => b.minutes - a.minutes)[0];
  if (!top || !top.minutes) return '';
  const h = top.hour;
  const ap = h >= 12 ? 'pm' : 'am';
  const h12 = (h % 12) || 12;
  return `Your busiest hour is ${h12}${ap} — ${top.minutes} minutes of driving, mostly ${top.cat === 'sent' ? 'other people’s errands' : 'your own'}.`;
}

function dial(hours) {
  const P = palette();
  const size = 250, c = size / 2, rMin = 26, rMax = 104;
  const g = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });

  [rMax, (rMax + rMin) / 2].forEach(r =>
    g.appendChild(svg('circle', { cx: c, cy: c, r, fill: 'none', stroke: P.ink3, 'stroke-width': 1 })));

  hours.forEach(h => {
    const ang = (h.hour / 24) * Math.PI * 2 - Math.PI / 2;
    const len = rMin + (rMax - rMin) * h.frac;
    const x1 = c + Math.cos(ang) * rMin, y1 = c + Math.sin(ang) * rMin;
    const x2 = c + Math.cos(ang) * len, y2 = c + Math.sin(ang) * len;
    g.appendChild(svg('line', {
      x1, y1, x2, y2,
      stroke: h.frac === 0 ? P.ink3 : (h.cat === 'sent' ? P.coral : P.teal),
      'stroke-width': 7, 'stroke-linecap': 'round',
      opacity: h.frac === 0 ? 0.5 : 0.9
    }));
  });

  g.appendChild(svg('circle', { cx: c, cy: c, r: 3, fill: P.peach }));
  [[0, '12a'], [6, '6a'], [12, '12p'], [18, '6p']].forEach(([hr, label]) => {
    const ang = (hr / 24) * Math.PI * 2 - Math.PI / 2;
    const x = c + Math.cos(ang) * (rMax + 16), y = c + Math.sin(ang) * (rMax + 16);
    const t = svg('text', {
      x, y, fill: P.dust, 'font-size': 10, 'font-family': 'DM Mono, monospace',
      'text-anchor': 'middle', 'dominant-baseline': 'middle', 'letter-spacing': '.1em'
    });
    t.textContent = label;
    g.appendChild(t);
  });
  return g;
}

/* --- the weekly wrap card + PNG ------------------------------------- */

function wrapSection(drives) {
  const weekStart = S.startOfWeek(Date.now());
  const w = S.weekSummary(drives, weekStart);
  const rib = S.ribbon(drives);

  const card = el('div', { class: 'wrap-card' });
  card.appendChild(el('div', {},
    el('div', { class: 'wrap-brand', text: 'HOURS' }),
    el('div', { class: 'wrap-week', text: weekLabel(weekStart) })
  ));

  const strip = el('div', { class: 'ribbon', style: { height: '70px' } });
  rib.days.forEach(day => {
    const col = el('div', { class: 'ribbon-day' });
    if (!day.segments.length) col.appendChild(el('div', { class: 'ribbon-base' }));
    day.segments.forEach(seg =>
      col.appendChild(el('div', { class: 'ribbon-seg ' + seg.cat, style: { height: Math.max(3, Math.round((seg.ms / rib.peak) * 58)) + 'px' } })));
    strip.appendChild(col);
  });

  card.appendChild(el('div', {},
    el('div', { class: 'wrap-big', text: w.minutes + '′' }),
    el('div', { class: 'wrap-line', text: 'MINUTES DRIVEN THIS WEEK' }),
    el('div', { style: { marginTop: '16px' } }, strip)
  ));

  card.appendChild(el('div', {},
    el('div', { class: 'wrap-line', text: `${w.sentMinutes} MIN SENT · ${w.choseMinutes} MIN CHOSE` }),
    el('div', { class: 'wrap-line', text: `${w.drives} DRIVES · ${w.km} KM` })
  ));

  return el('div', { class: 'card' },
    el('div', { class: 'label', style: { marginBottom: '12px' } }, 'THIS WEEK, FOR THE GROUP CHAT'),
    card,
    el('button', {
      class: 'btn primary wide', style: { marginTop: '14px' }, text: 'Save image',
      onclick: () => savePNG(w, rib, weekStart)
    })
  );
}

function weekLabel(weekStart) {
  const a = new Date(weekStart), b = new Date(weekStart + 6 * S.DAY_MS);
  return `${a.getDate()} ${S.MONTH_SHORT[a.getMonth()]} – ${b.getDate()} ${S.MONTH_SHORT[b.getMonth()]}`;
}

/* Drawn by hand on a canvas — no screenshot library. */
function savePNG(w, rib, weekStart) {
  const W = 1080, H = 1920;
  const P = palette();
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const bg = x.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, P.inkWarm);
  bg.addColorStop(0.55, P.ink);
  bg.addColorStop(1, P.inkCool);
  x.fillStyle = bg;
  x.fillRect(0, 0, W, H);

  const glow = x.createRadialGradient(W * 0.3, H * 0.82, 30, W * 0.3, H * 0.82, W * 0.9);
  glow.addColorStop(0, alpha(P.rust, .30));
  glow.addColorStop(1, alpha(P.rust, 0));
  x.fillStyle = glow;
  x.fillRect(0, 0, W, H);

  x.fillStyle = P.peach;
  x.font = '600 96px "Bebas Neue", Impact, sans-serif';
  x.letterSpacing = '28px';
  x.fillText('HOURS', 90, 210);

  x.fillStyle = P.dust;
  x.font = '400 34px "DM Mono", monospace';
  x.letterSpacing = '6px';
  x.fillText(weekLabel(weekStart).toUpperCase(), 92, 268);

  x.fillStyle = P.coral;
  x.font = '400 330px "Bebas Neue", Impact, sans-serif';
  x.letterSpacing = '0px';
  x.fillText(String(w.minutes), 84, 780);

  x.fillStyle = P.bone;
  x.font = '400 44px "DM Mono", monospace';
  x.letterSpacing = '8px';
  x.fillText('MINUTES DRIVEN', 92, 860);

  // the ribbon
  const baseY = 1300, colW = 110, gap = 22, startX = 92, maxH = 330;
  rib.days.forEach((day, i) => {
    let y = baseY;
    const cx = startX + i * (colW + gap);
    if (!day.segments.length) {
      x.fillStyle = P.ink3;
      x.fillRect(cx, baseY - 6, colW, 6);
    }
    day.segments.forEach(seg => {
      const h = Math.max(8, Math.round((seg.ms / rib.peak) * maxH));
      x.fillStyle = seg.cat === 'sent' ? P.coral : P.teal;
      x.fillRect(cx, y - h, colW, h - 4);
      y -= h;
    });
    x.fillStyle = day.isToday ? P.peach : P.dust;
    x.font = '400 30px "DM Mono", monospace';
    x.fillText(day.letter, cx + colW / 2 - 9, baseY + 52);
  });

  x.fillStyle = P.coral;
  x.font = '400 42px "DM Mono", monospace';
  x.letterSpacing = '2px';
  x.fillText(`${w.sentMinutes} MIN SENT`, 92, 1520);
  x.fillStyle = P.teal;
  x.fillText(`${w.choseMinutes} MIN CHOSE`, 92, 1585);
  x.fillStyle = P.dust;
  x.fillText(`${w.drives} DRIVES · ${w.km} KM`, 92, 1650);

  x.fillStyle = P.dust;
  x.font = '400 28px "DM Mono", monospace';
  x.letterSpacing = '10px';
  x.fillText('EVERY DRIVE, LOGGED', 92, 1800);

  c.toBlob(blob => {
    if (!blob) { toast('Could not make the image.'); return; }
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: `hours-week-${S.dayKey(weekStart)}.png` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    toast('Saved to your downloads.');
  }, 'image/png');
}
