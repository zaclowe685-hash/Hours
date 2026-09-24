/* HOURS — ui/sheets.js
   Every bottom sheet that creates or changes a run or an errand:
     openFinish      "32 min — what was it?"  (after I'M BACK)
     openQuickLog    a forgotten run, one tap from an errand tile
     openTakeaway    which takeaway place
     openEditRun     fix a run's errand / time / length, or delete it
     openErrandEditor  add or change a one-tap button */

import * as store from '../store.js';
import * as errands from '../errands.js';
import * as drive from '../drive.js';
import * as S from '../stats.js';
import { getFix } from '../geo.js';
import { el, icon, toast, sheet, ask, stepper, switchEl, fly, ICON_CHOICES, iconSvg, toLocalInput, fromLocalInput } from './widgets.js';

/* --- shared: a grid of errand tiles ----------------------------------- */

function pickGrid({ selected = null, onPick, withNew = true, list = null }) {
  const grid = el('div', { class: 'tiles pick' });
  const items = list || [...errands.main(), ...errands.takeaway()];
  items.forEach(e => grid.appendChild(el('button', {
    class: 'tile' + (e.id === selected ? ' sel' : ''),
    onclick: () => onPick(e)
  },
    icon(e.icon),
    el('div', {}, el('div', { class: 'nm', text: e.name }), el('div', { class: 'mt', text: e.group === 'takeaway' ? 'Takeaway' : `${e.minutes} min` }))
  )));
  if (withNew) grid.appendChild(el('button', {
    class: 'tile dashed',
    onclick: () => onPick(null)
  }, icon('plus'), el('div', {}, el('div', { class: 'nm', text: 'Something else' }), el('div', { class: 'mt', text: 'Add a new one' }))));
  return grid;
}

/* The moment a run lands. */
export function celebrate(d) {
  fly('+' + S.fmtDur(d.durationMs));
  if (navigator.vibrate) navigator.vibrate(18);
  toast(`Logged ${S.fmtDur(d.durationMs)} · ${errands.labelFor(d)}`, {
    action: { label: 'Undo', fn: () => { store.deleteDrive(d.id); toast('Removed.'); } }
  });
}

/* --- after I'M BACK ----------------------------------------------------- */

export function openFinish(d) {
  sheet((panel, close) => {
    panel.appendChild(el('div', { class: 'sheet-hero' },
      el('div', {},
        el('div', { class: 'label', text: `Back · ${S.fmtTime(d.startedAt)} – ${S.fmtTime(d.endedAt)}` }),
        el('h2', { style: { marginTop: '6px' } }, el('span', { class: 'sun-text', text: S.fmtDur(d.durationMs) }), ' — what was it?')
      )
    ));
    panel.appendChild(el('div', { class: 'field' }, pickGrid({
      selected: d.errandId,
      onPick: e => {
        if (!e) {
          close();
          setTimeout(() => openErrandEditor(null, { onSaved: ne => { store.updateDrive(d.id, { errandId: ne.id }); celebrate(store.getDrive(d.id)); } }), 220);
          return;
        }
        store.updateDrive(d.id, { errandId: e.id });
        close();
        celebrate(store.getDrive(d.id));
      }
    })));
    panel.appendChild(el('div', { class: 'foot' },
      el('button', { class: 'text-btn', text: 'Decide later', onclick: close })));
  });
}

/* Under 30 seconds: probably a mis-tap. */
export async function confirmShort(d) {
  const keep = await ask({
    title: `Only ${Math.round(d.durationMs / 1000)} seconds`,
    body: 'That looks like a mis-tap. Keep it anyway?',
    buttons: [
      { label: 'Bin it', value: false, style: 'primary' },
      { label: 'Keep it', value: true, style: 'ghost' }
    ]
  });
  if (keep) { drive.keep(d); openFinish(d); }
}

/* --- a forgotten run ---------------------------------------------------- */

const WHEN = [
  { id: 'now', label: 'Just now', back: 0 },
  { id: '1h',  label: '1 hr ago', back: 60 },
  { id: 'yd',  label: 'Yesterday' },
  { id: 'pick', label: 'Pick…' }
];

export function openQuickLog(e) {
  sheet((panel, close) => {
    let minutes = e.minutes;
    let when = 'now';

    panel.appendChild(el('div', { class: 'sheet-hero' },
      icon(e.icon, 'sun'),
      el('div', {}, el('h2', { text: e.name }), el('div', { class: 'lede', text: 'Forgot to tap GO? Log it here.' }))
    ));

    const picker = el('input', { class: 'input', type: 'datetime-local', style: { display: 'none', marginTop: '10px' } });
    const now = Date.now();
    picker.value = toLocalInput(now - minutes * 60000);
    picker.max = toLocalInput(now);

    const chips = el('div', { class: 'chips' });
    const paintChips = () => [...chips.children].forEach(c => c.classList.toggle('on', c.dataset.id === when));
    WHEN.forEach(w => chips.appendChild(el('button', {
      class: 'chip', data: { id: w.id }, text: w.label, type: 'button',
      onclick: () => {
        when = w.id;
        picker.style.display = when === 'pick' ? 'block' : 'none';
        paintChips(); paintBtn();
      }
    })));
    paintChips();

    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'When did you get back?' }), chips, picker));

    const step = stepper({ value: minutes, step: 5, min: 5, max: 360, onChange: v => { minutes = v; paintBtn(); } });
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'Door to door' }), step.node));

    const btn = el('button', { class: 'btn primary wide', onclick: save });
    function paintBtn() { btn.textContent = `Log ${S.fmtDur(minutes * 60000)}`; }
    paintBtn();
    panel.appendChild(el('div', { class: 'foot' }, btn));

    function save() {
      const ms = minutes * 60000;
      let startedAt;
      if (when === 'pick') {
        startedAt = fromLocalInput(picker.value);
        if (startedAt === null) { toast('Pick a time first.'); return; }
      } else if (when === 'yd') {
        // yesterday, finishing at the same time of day as now
        const y = new Date(); y.setDate(y.getDate() - 1);
        startedAt = y.getTime() - ms;
      } else {
        const w = WHEN.find(x => x.id === when);
        startedAt = Date.now() - w.back * 60000 - ms;
      }
      const d = store.addDrive(store.newDrive({
        errandId: e.id, startedAt, endedAt: startedAt + ms, durationMs: ms, origin: 'quick'
      }));
      // teach the button: if he always says 35 for this one, default to 35
      if (minutes !== e.minutes) store.updateErrand(e.id, { minutes });
      close();
      celebrate(d);
    }
  });
}

/* --- takeaway ------------------------------------------------------------ */

export function openTakeaway(onPick = openQuickLog) {
  sheet((panel, close) => {
    panel.appendChild(el('div', { class: 'sheet-hero' },
      icon('food', 'sun'),
      el('div', {}, el('h2', { text: 'Get takeaway' }), el('div', { class: 'lede', text: 'Where from?' }))
    ));
    panel.appendChild(el('div', { class: 'field' }, pickGrid({
      list: errands.takeaway(),
      onPick: e => {
        close();
        if (e) setTimeout(() => onPick(e), 220);
        else setTimeout(() => openErrandEditor(null, { takeaway: true, onSaved: onPick }), 220);
      }
    })));
  });
}

/* --- edit a run -------------------------------------------------------- */

export function openEditRun(d) {
  sheet((panel, close) => {
    let errandId = d.errandId;
    let minutes = Math.max(1, Math.round(d.durationMs / 60000));

    panel.appendChild(el('h2', { text: 'Edit run' }));
    panel.appendChild(el('div', { class: 'lede', text: `${S.fmtDayHead(d.startedAt)} · ${S.fmtTime(d.startedAt)}` }));

    const grid = pickGrid({
      selected: errandId, withNew: false,
      onPick: e => {
        errandId = e.id;
        [...grid.children].forEach((c, i) => c.classList.toggle('sel', allList[i] && allList[i].id === errandId));
      }
    });
    const allList = [...errands.main(), ...errands.takeaway()];
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'What was it' }), grid));

    const start = el('input', { class: 'input', type: 'datetime-local', value: toLocalInput(d.startedAt) });
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'Left home' }), start));

    const step = stepper({ value: minutes, step: 5, min: 1, max: 600, onChange: v => { minutes = v; } });
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'Door to door' }), step.node));

    panel.appendChild(el('div', { class: 'stack foot' },
      el('button', {
        class: 'btn primary wide', text: 'Save',
        onclick: () => {
          const startedAt = fromLocalInput(start.value) ?? d.startedAt;
          const ms = minutes * 60000;
          store.updateDrive(d.id, { errandId, startedAt, endedAt: startedAt + ms, durationMs: ms });
          close();
          toast('Saved.');
        }
      }),
      el('button', {
        class: 'btn danger wide', text: 'Delete run',
        onclick: () => {
          const gone = store.deleteDrive(d.id);
          close();
          toast('Run deleted.', { action: { label: 'Undo', fn: () => store.restoreDrives([gone]) } });
        }
      })
    ));
  });
}

/* --- add / change a one-tap button ------------------------------------- */

export function openErrandEditor(existing, { takeaway = false, onSaved = null } = {}) {
  sheet((panel, close) => {
    const e = existing || { name: '', minutes: 30, group: takeaway ? 'takeaway' : null, icon: takeaway ? 'food' : 'bag', lat: null, lon: null };
    let draft = { name: e.name, minutes: e.minutes, group: e.group, icon: e.icon };

    panel.appendChild(el('h2', { text: existing ? 'Edit button' : 'New errand' }));
    panel.appendChild(el('div', { class: 'lede', text: existing ? 'Changes apply to every run with this button.' : 'It becomes a one-tap button on Home.' }));

    const name = el('input', { class: 'input', type: 'text', placeholder: 'e.g. Pick up from training', value: draft.name, maxlength: '40', autocapitalize: 'words' });
    name.addEventListener('input', () => { draft.name = name.value; });
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'Name' }), name));

    const step = stepper({ value: draft.minutes, step: 5, min: 5, max: 360, onChange: v => { draft.minutes = v; } });
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'Usual time, door to door' }), step.node));

    const icons = el('div', { class: 'icon-row' });
    const paintIcons = () => [...icons.children].forEach(c => c.classList.toggle('sel', c.dataset.icon === draft.icon));
    ICON_CHOICES.forEach(ic => icons.appendChild(el('button', {
      type: 'button', class: 'tile', data: { icon: ic },
      onclick: () => { draft.icon = ic; paintIcons(); }
    }, el('span', { class: 'ico' }, iconSvg(ic)))));
    paintIcons();
    panel.appendChild(el('div', { class: 'field' }, el('span', { class: 'label', text: 'Icon' }), icons));

    panel.appendChild(el('div', { class: 'field switch-row' },
      el('div', {}, el('div', { style: { fontWeight: '600' }, text: 'Takeaway place' }), el('div', { class: 'faint tiny', text: 'Lives under the Get takeaway button' })),
      switchEl(draft.group === 'takeaway', on => { draft.group = on ? 'takeaway' : null; })
    ));

    // location powers the map and the km
    if (existing) {
      const locText = el('div', { class: 'faint tiny' });
      const paintLoc = () => {
        const cur = store.getErrand(existing.id);
        locText.textContent = cur && cur.lat !== null && cur.lat !== undefined
          ? (cur.routeKm ? `Pinned · ${S.fmtKm(cur.routeKm)} km from home` : 'Pinned on the map')
          : 'Not pinned — no km or map line yet';
      };
      paintLoc();
      panel.appendChild(el('div', { class: 'field' },
        el('span', { class: 'label', text: 'Location' }), locText,
        el('div', { class: 'row2', style: { marginTop: '10px' } },
          el('button', {
            class: 'btn sm ghost', text: "I'm here now",
            onclick: async ev => {
              ev.target.textContent = 'Finding you…';
              const fix = await getFix();
              ev.target.textContent = "I'm here now";
              if (!fix.ok) { toast('Location is off for HOURS.'); return; }
              errands.setLocation(existing.id, fix.coords);
              paintLoc();
              toast('Pinned.');
            }
          }),
          el('button', { class: 'btn sm ghost', text: 'Clear pin', onclick: () => { errands.setLocation(existing.id, null); paintLoc(); } })
        )));
    }

    const foot = el('div', { class: 'stack foot' },
      el('button', {
        class: 'btn primary wide', text: existing ? 'Save' : 'Add button',
        onclick: () => {
          const nm = draft.name.trim();
          if (!nm) { name.focus(); toast('Give it a name.'); return; }
          const saved = existing
            ? store.updateErrand(existing.id, { ...draft, name: nm })
            : store.addErrand({ ...draft, name: nm });
          close();
          if (onSaved) setTimeout(() => onSaved(saved), 220);
        }
      })
    );
    if (existing) foot.appendChild(el('button', {
      class: 'btn danger wide', text: 'Delete button',
      onclick: async () => {
        close();
        const sure = await ask({
          title: `Delete “${existing.name}”?`,
          body: 'Its runs stay counted — they just keep the name as text.',
          buttons: [{ label: 'Delete', value: true, style: 'danger' }, { label: 'Keep it', value: false, style: 'ghost' }]
        });
        if (sure) { store.deleteErrand(existing.id); toast('Button deleted.'); }
      }
    }));
    panel.appendChild(foot);
  });
}
