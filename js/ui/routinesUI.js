/* HOURS — ui/routinesUI.js
   The recurring-drives editor. Opens from Settings. */

import * as store from '../store.js';
import * as routines from '../routines.js';
import * as S from '../stats.js';
import { el, clear, sheet, ask, toast, categoryToggle, tagInput, stepper, toggleSwitch, dayPills } from './widgets.js';
import { show, current } from './screens.js';

export function openRoutines() {
  sheet((panel, close) => {
    const body = el('div', {});
    panel.appendChild(el('h2', { text: 'Routines' }));
    panel.appendChild(el('p', {
      class: 'muted tiny', style: { marginTop: '4px' },
      text: 'Drives you always take. They log themselves — no tapping GO.'
    }));
    panel.appendChild(body);

    function paint() {
      clear(body);
      const list = store.get().routines;
      if (!list.length) {
        body.appendChild(el('div', { class: 'empty', text: 'No routines yet.' }));
      }
      list.forEach(r => body.appendChild(card(r, paint)));
      body.appendChild(el('button', {
        class: 'btn wide', style: { marginTop: '14px' }, text: '+ New routine',
        onclick: () => openRoutineEditor(null, paint)
      }));
      body.appendChild(el('button', {
        class: 'btn ghost wide', style: { marginTop: '10px' }, text: 'Done',
        onclick: () => { close(); if (current()) show(current()); }
      }));
    }
    paint();
  });
}

function card(r, repaint) {
  const node = el('div', { class: 'card' });

  node.appendChild(el('div', { class: 'row between' },
    el('h2', { text: r.name, style: { marginBottom: '0' } }),
    toggleSwitch(r.enabled, on => {
      store.updateRoutine(r.id, { enabled: on });
      toast(on ? 'On.' : 'Paused.');
    })
  ));

  const pills = el('div', { class: 'day-pills', style: { marginTop: '12px' } });
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((letter, i) =>
    pills.appendChild(el('div', {
      class: 'day-pill' + (r.days.includes(i) ? ' on ' + r.category : ''), text: letter
    })));
  node.appendChild(pills);

  node.appendChild(el('div', { class: 'docket-sub', style: { marginTop: '12px' } },
    el('span', { text: routines.describe(r) }), el('span', {})));

  const count = routines.drivesFromRoutine(r.id).length;
  node.appendChild(el('div', { class: 'docket-actions' },
    el('button', { class: 'btn', text: 'Edit', onclick: () => openRoutineEditor(r, repaint) }),
    el('button', {
      class: 'btn danger', text: 'Delete',
      onclick: async () => {
        const alsoDrives = count > 0 ? await ask({
          title: `Delete “${r.name}”?`,
          body: `It has created ${count} drive${count === 1 ? '' : 's'} so far.`,
          buttons: [
            { label: 'Delete the routine only', value: 'keep' },
            { label: `Also delete the ${count} drive${count === 1 ? '' : 's'}`, value: 'all', style: 'danger' },
            { label: 'Cancel', value: null }
          ]
        }) : 'keep';
        if (alsoDrives === null) return;
        routines.deleteRoutine(r.id, alsoDrives === 'all');
        repaint();
        toast('Routine deleted.');
      }
    })
  ));
  return node;
}

export function openRoutineEditor(existing, onDone) {
  const draft = existing ? { ...existing } : {
    name: '', enabled: true, days: [], timeOfDay: '07:00', legMinutes: 10,
    returnTrip: false, returnOffsetMinutes: 60, category: 'chose', tags: [],
    placeLabel: '', placeId: null, lastGeneratedFor: S.dayKey(Date.now())
  };

  sheet((panel, close) => {
    panel.appendChild(el('h2', { text: existing ? 'Edit routine' : 'New routine' }));

    const preview = el('div', { class: 'preview-line' });
    const repaintPreview = () => { preview.textContent = routines.describe(draft); };

    /* name */
    const name = el('input', { class: 'field', type: 'text', placeholder: 'Gym', value: draft.name });
    name.addEventListener('input', () => { draft.name = name.value; });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'NAME' }), name));

    /* days */
    const pills = dayPills({
      days: draft.days, category: draft.category,
      onChange: v => { draft.days = v; repaintPreview(); }
    });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'DAYS' }), pills.node));

    /* time */
    const time = el('input', { class: 'field', type: 'time', value: draft.timeOfDay });
    time.addEventListener('input', () => { draft.timeOfDay = time.value || '07:00'; repaintPreview(); });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'TIME' }), time));

    /* minutes per leg */
    const legs = stepper({
      value: draft.legMinutes, step: 1, min: 1, max: 240,
      format: v => v + ' min', onChange: v => { draft.legMinutes = v; repaintPreview(); }
    });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'MINUTES EACH WAY' }), legs.node));

    /* return trip + offset */
    const offsetWrap = el('div', { class: 'sheet-section', style: { display: draft.returnTrip ? 'block' : 'none' } });
    const offset = stepper({
      value: draft.returnOffsetMinutes, step: 15, min: 5, max: 600,
      format: v => v + ' min later', onChange: v => { draft.returnOffsetMinutes = v; repaintPreview(); }
    });
    offsetWrap.appendChild(el('span', { class: 'label', text: 'HEAD BACK' }));
    offsetWrap.appendChild(offset.node);

    panel.appendChild(el('div', { class: 'sheet-section' },
      el('div', { class: 'row between' },
        el('span', { class: 'label', text: 'RETURN TRIP TOO' }),
        toggleSwitch(draft.returnTrip, on => {
          draft.returnTrip = on;
          offsetWrap.style.display = on ? 'block' : 'none';
          repaintPreview();
        })
      )
    ));
    panel.appendChild(offsetWrap);

    /* category */
    const cat = categoryToggle(draft.category, v => {
      draft.category = v;
      pills.setCategory(v);
      repaintPreview();
    });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'WHAT IS IT' }), cat.node));

    /* place */
    const place = el('input', { class: 'field', type: 'text', placeholder: 'The gym', value: draft.placeLabel });
    place.addEventListener('input', () => { draft.placeLabel = place.value; });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'PLACE NAME' }), place));

    /* tags */
    const tags = tagInput({
      initial: draft.tags, suggestions: S.topTags(store.get().drives, 6),
      onChange: v => { draft.tags = v; }
    });
    panel.appendChild(el('div', { class: 'sheet-section' }, el('span', { class: 'label', text: 'TAGS' }), tags.node));

    repaintPreview();
    panel.appendChild(el('div', { class: 'sheet-section' }, preview));

    panel.appendChild(el('button', {
      class: 'btn primary wide', style: { marginTop: '18px' }, text: existing ? 'Save changes' : 'Create routine',
      onclick: () => {
        tags.commitTyped();
        draft.tags = tags.value;
        draft.name = (name.value || '').trim() || 'Routine';
        draft.placeLabel = (place.value || '').trim() || draft.name;
        if (!draft.days.length) { toast('Pick at least one day.'); return; }

        if (existing) {
          // editing does not rewrite drives it already made
          store.updateRoutine(existing.id, {
            name: draft.name, days: draft.days, timeOfDay: draft.timeOfDay,
            legMinutes: draft.legMinutes, returnTrip: draft.returnTrip,
            returnOffsetMinutes: draft.returnOffsetMinutes, category: draft.category,
            tags: draft.tags, placeLabel: draft.placeLabel
          });
        } else {
          store.addRoutine(draft);
        }
        close();
        if (onDone) onDone();
        toast(existing ? 'Routine saved.' : 'Routine created.');
      }
    }));
  });
}
