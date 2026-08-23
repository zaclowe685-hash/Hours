/* HOURS — ui/home.js
   The odometer, the GO button, the week ribbon, this week's numbers, and the
   handful of nudges that stop him abandoning the app. */

import * as store from '../store.js';
import * as drive from '../drive.js';
import * as S from '../stats.js';
import * as routines from '../routines.js';
import { getFix } from '../geo.js';
import { el, clear, odometer, odometerCountUp, toast, ask, reduceMotion } from './widgets.js';
import { show } from './screens.js';
import { openQuickAdd } from './finish.js';

let odo = null;

export function mount(root) {
  const state = store.get();
  const drives = state.drives;
  const live = store.getLive();

  /* --- notices ------------------------------------------------------- */
  if (live && drive.isStale()) root.appendChild(recoveryCard(live));
  if (!state.settings.homeCoords) root.appendChild(homeSetupCard());
  const routineNote = routineNotice();
  if (routineNote) root.appendChild(routineNote);
  const nudge = gapNudge(drives);
  if (nudge) root.appendChild(nudge);

  /* --- odometer ------------------------------------------------------ */
  const mins = S.sentMinutes(drives);
  odo = odometer({ value: mins, minDigits: 1, className: 'odo-hero' });
  root.appendChild(el('div', { class: 'home-top' },
    odo.node,
    el('div', { class: 'odo-label' },
      el('div', { text: 'minutes spent on other people’s errands' })
    )
  ));
  odometerCountUp(odo, mins);

  /* --- GO / STOP ----------------------------------------------------- */
  root.appendChild(live && !drive.isStale() ? stopButton() : goButton());

  /* --- week ribbon --------------------------------------------------- */
  const rib = S.ribbon(drives);
  const strip = el('div', { class: 'ribbon' });
  const labels = el('div', { class: 'ribbon-labels' });
  rib.days.forEach(day => {
    const col = el('div', { class: 'ribbon-day' + (day.isToday ? ' today' : '') });
    if (!day.segments.length) {
      col.appendChild(el('div', { class: 'ribbon-base' }));
    } else {
      day.segments.forEach(seg => {
        const h = Math.max(3, Math.round((seg.ms / rib.peak) * 78));
        col.appendChild(el('div', { class: 'ribbon-seg ' + seg.cat, style: { height: h + 'px' } }));
      });
    }
    strip.appendChild(col);
    labels.appendChild(el('span', { class: day.isToday ? 'today' : '', text: day.letter }));
  });
  root.appendChild(el('div', { class: 'card' },
    el('div', { class: 'label', style: { marginBottom: '10px' } }, 'YOUR LAST 7 DAYS'),
    strip, labels
  ));

  /* --- this week's chips --------------------------------------------- */
  const thisWeek = S.weekSummary(drives, S.startOfWeek(Date.now()));
  const lastWeek = S.weekSummary(drives, S.startOfWeek(Date.now()) - 7 * S.DAY_MS);

  root.appendChild(el('div', { class: 'chips3' },
    chip(thisWeek.sentMinutes, 'mins sent', S.delta(thisWeek.sentMinutes, lastWeek.sentMinutes), 'down', 'min'),
    chip(thisWeek.drives, 'drives', S.delta(thisWeek.drives, lastWeek.drives), 'up', ''),
    chip(thisWeek.km, 'km', S.delta(thisWeek.km, lastWeek.km), 'up', '')
  ));

  root.appendChild(el('button', {
    class: 'text-btn',
    text: '+ Log a past drive',
    onclick: () => openQuickAdd()
  }));
}

export function unmount() { odo = null; }

/* --- pieces ------------------------------------------------------------ */

function chip(value, key, d, goodDir, unit) {
  const cls = d.dir === 'flat' ? 'flat' : (d.dir === goodDir ? 'good' : 'bad');
  const arrow = d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '–';
  const text = d.dir === 'flat' ? 'same as last week' : `${arrow} ${d.diff}${unit ? ' ' + unit : ''}`;
  return el('div', { class: 'chip-stat' },
    el('div', { class: 'v', text: String(value) }),
    el('div', { class: 'k', text: key }),
    el('div', { class: 'd ' + cls, text })
  );
}

function goButton() {
  const wrap = el('div', { class: 'go-wrap' });
  const btn = el('button', { class: 'go-btn', 'aria-label': 'Start a drive' },
    el('div', { class: 'go-word', text: 'GO' })
  );
  wrap.appendChild(el('div', { class: 'go-well' }));
  wrap.appendChild(el('div', { class: 'go-ring' }));
  wrap.appendChild(btn);

  btn.addEventListener('pointerdown', () => wrap.classList.add('pressed'));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
    btn.addEventListener(ev, () => wrap.classList.remove('pressed')));

  btn.addEventListener('click', () => {
    if (!reduceMotion()) {
      const ring = el('div', { class: 'go-commit' });
      wrap.appendChild(ring);
      setTimeout(() => ring.remove(), 520);
    }
    drive.start();
    show('driving');
  });
  return wrap;
}

function stopButton() {
  const wrap = el('div', { class: 'go-wrap stop' });
  const timer = el('div', { class: 'go-sub', text: S.fmtClock(drive.elapsedMs()) });
  const btn = el('button', { class: 'go-btn stop', 'aria-label': 'Back to the drive' },
    el('div', {}, el('div', { class: 'go-word', text: 'STOP' }), timer)
  );
  wrap.appendChild(el('div', { class: 'go-well' }));
  wrap.appendChild(el('div', { class: 'go-ring' }));
  wrap.appendChild(btn);

  const tick = setInterval(() => {
    if (!document.body.contains(timer)) { clearInterval(tick); return; }
    timer.textContent = S.fmtClock(drive.elapsedMs());
  }, 1000);

  btn.addEventListener('click', () => show('driving'));
  return wrap;
}

/* The forgotten drive. Friendly, one tap to fix, never an error. */
function recoveryCard(live) {
  const when = `${S.fmtTime(live.startedAt)} on ${S.DAY_LONG[new Date(live.startedAt).getDay()]}`;
  const card = el('div', { class: 'notice warn' },
    el('h3', { text: 'Unfinished drive' }),
    el('p', { text: `You started a drive at ${when} and never finished it.` })
  );
  const row = el('div', { class: 'row' });

  row.appendChild(el('button', {
    class: 'btn primary', text: 'Finish it now',
    onclick: () => {
      const d = drive.recoverWith(null);
      show('home');
      toast(`Logged. ${S.fmtDur(d.durationMs)}.`);
    }
  }));
  row.appendChild(el('button', {
    class: 'btn', text: 'Set the time myself',
    onclick: () => durationPicker(live)
  }));
  row.appendChild(el('button', {
    class: 'btn ghost', text: 'Bin it',
    onclick: async () => {
      const yes = await ask({
        title: 'Bin that drive?',
        body: 'It will not be logged at all.',
        buttons: [{ label: 'Bin it', value: true, style: 'danger' }, { label: 'Keep it', value: false }]
      });
      if (yes) { drive.binLive(); show('home'); toast('Binned.'); }
    }
  }));
  card.appendChild(row);
  return card;
}

function durationPicker(live) {
  import('./widgets.js').then(({ sheet, stepper, el: E }) => {
    sheet((panel, close) => {
      panel.appendChild(E('h2', { text: 'How long was it?' }));
      panel.appendChild(E('p', { class: 'muted tiny', text: `Started ${S.fmtTime(live.startedAt)}.`, style: { marginTop: '6px' } }));
      const st = stepper({ value: 20, step: 5, min: 1, max: 600, format: v => S.fmtDur(v * 60000) });
      panel.appendChild(E('div', { class: 'sheet-section' }, st.node));
      panel.appendChild(E('button', {
        class: 'btn primary wide', text: 'Log it', style: { marginTop: '18px' },
        onclick: () => {
          const d = drive.recoverWith(st.value * 60000);
          close();
          show('home');
          toast(`Logged. ${S.fmtDur(d.durationMs)}.`);
        }
      }));
    });
  });
}

function homeSetupCard() {
  const card = el('div', { class: 'notice' },
    el('h3', { text: 'Where is home?' }),
    el('p', { text: 'Tap this while you are at home, so I can tell when you have got back.' })
  );
  card.appendChild(el('div', { class: 'row' },
    el('button', {
      class: 'btn primary', text: 'I am home now',
      onclick: async () => {
        const fix = await getFix();
        if (fix.ok) {
          store.setting('homeCoords', fix.coords);
          toast('Home saved.');
          show('home');
        } else {
          toast(fix.status === 'denied' ? 'No location permission.' : 'Could not find you.');
        }
      }
    })
  ));
  return card;
}

/* "Logged your gym run — 7 min each way." Once a day, dismissible. */
function routineNotice() {
  const today = S.dayKey(Date.now());
  if (store.get().settings.routineNoticeOn === today) return null;

  const todays = store.get().drives.filter(d =>
    d.origin === 'routine' && S.dayKey(d.startedAt) === today);
  if (!todays.length) return null;

  const routineId = todays[0].routineId;
  const r = store.get().routines.find(x => x.id === routineId);
  const name = (r && r.name) || todays[0].placeLabel || 'routine';
  const legs = todays.filter(d => d.routineId === routineId);
  const mins = legs[0] ? S.formatMins(legs[0].durationMs) : 0;

  const line = el('div', { class: 'line-nudge' });
  line.appendChild(el('span', {}, `Logged your ${name.toLowerCase()} — ${mins} min${legs.length > 1 ? ' each way' : ''}.`));
  const right = el('div', { class: 'row' });
  right.appendChild(el('button', {
    text: 'Didn’t go',
    onclick: () => {
      const gone = routines.didntGo(routineId, Date.now());
      store.setting('routineNoticeOn', today);
      show('home');
      toast(gone.length > 1 ? 'Wiped. Both legs.' : 'Wiped.', {
        action: { label: 'Undo', fn: () => { store.restoreDrives(gone); show('home'); } }, ms: 6000
      });
    }
  }));
  right.appendChild(el('button', {
    class: 'x-dismiss', text: '✕',
    onclick: () => { store.setting('routineNoticeOn', today); line.remove(); }
  }));
  line.appendChild(right);
  return line;
}

/* Nothing logged in a while? Offer quick-add. Once a day, dismissible. */
function gapNudge(drives) {
  const today = S.dayKey(Date.now());
  if (store.get().settings.nudgeDismissedOn === today) return null;
  if (drives.length < 3) return null;
  const gap = S.daysSinceLastDrive(drives);
  if (gap === null || gap <= 4) return null;

  const line = el('div', { class: 'line-nudge' });
  line.appendChild(el('span', { text: `Nothing logged since ${S.lastDriveWeekday(drives)}. Missed a few?` }));
  const right = el('div', { class: 'row' });
  right.appendChild(el('button', { text: 'Add them', onclick: () => openQuickAdd() }));
  right.appendChild(el('button', {
    class: 'x-dismiss', text: '✕',
    onclick: () => { store.setting('nudgeDismissedOn', today); line.remove(); }
  }));
  line.appendChild(right);
  return line;
}
