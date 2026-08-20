/* HOURS — ui/finish.js
   The sheet that rises when a drive ends, the same sheet in edit mode, and
   quick-add for a drive he forgot. Everything on it is optional: the drive is
   already saved before the sheet appears. */

import * as store from '../store.js';
import * as drive from '../drive.js';
import * as S from '../stats.js';
import { renameStop, suggest, placeByLabel } from '../places.js';
import { el, clear, sheet, ask, toast, categoryToggle, tagInput, stepper } from './widgets.js';
import { show, current } from './screens.js';

const PRESETS = [5, 10, 15, 20, 30, 45, 60];

/* --- ending a drive ----------------------------------------------------- */

export async function endDrive() {
  const res = drive.finish();
  if (!res) return;

  if (res.short) {
    const secs = Math.round(res.drive.durationMs / 1000);
    const keep = await ask({
      title: `That was ${secs} second${secs === 1 ? '' : 's'}.`,
      body: 'Looks like a misfire.',
      buttons: [
        { label: 'Bin it', value: false, style: 'danger' },
        { label: 'Log it anyway', value: true }
      ]
    });
    if (!keep) { show('home'); return; }
    drive.commit(res.drive);
  }
  openFinishSheet(res.drive.id);
}

/* --- the finish sheet ---------------------------------------------------- */

export function openFinishSheet(driveId, { isEdit = false } = {}) {
  const d = store.getDrive(driveId);
  if (!d) return;

  let category = d.category || null;
  let tags = [...(d.tags || [])];
  let placeTouched = false;
  let durationMs = d.durationMs;
  let unsub = null;

  sheet((panel, close) => {
    /* hero: duration + distance */
    const durLine = el('div', { class: 'finish-dur', text: S.fmtDur(durationMs) });
    const distLine = el('div', { class: 'finish-dist' });
    panel.appendChild(el('div', { class: 'finish-hero' },
      el('div', { class: 'label', text: isEdit ? 'EDITING' : 'DRIVE DONE' }),
      durLine, distLine
    ));

    function paintDistance() {
      const fresh = store.getDrive(driveId);
      clear(distLine);
      if (!fresh) return;
      if (fresh.routeSource === 'pending') {
        distLine.appendChild(el('span', { class: 'shimmer', text: 'measuring the route…' }));
      } else if (typeof fresh.distanceKm === 'number') {
        const km = S.fmtKm(fresh.distanceKm, fresh.routeSource);
        distLine.textContent = fresh.routeSource === 'estimate'
          ? `${km} · rough estimate, no route`
          : `${km} · likely road route`;
      } else if (fresh.from && fresh.to && drive.stayedLocal(fresh)) {
        distLine.textContent = 'Round trip — stayed local';
      } else if (!fresh.from && !fresh.to) {
        distLine.textContent = 'No location on this one';
      } else {
        distLine.textContent = '';
      }
    }
    paintDistance();

    /* category */
    const cat = categoryToggle(category, v => { category = v; });
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'WHAT WAS IT' }), cat.node));

    /* place */
    const placeField = el('input', {
      class: 'field', type: 'text', placeholder: 'Where did you go?',
      value: d.placeLabel || ''
    });
    placeField.addEventListener('input', () => { placeTouched = true; });
    const placeHint = el('div', { class: 'tiny muted', style: { marginTop: '7px' } });
    if (!d.placeLabel) {
      placeHint.appendChild(el('span', { class: 'shimmer', text: 'finding you…' }));
    }
    if (store.get().settings.geoDenied) {
      clear(placeHint);
      placeHint.textContent = 'No location — name the place yourself.';
    }
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'WHERE' }), placeField, placeHint));

    /* duration stepper, edit mode only */
    let durStep = null;
    if (isEdit) {
      durStep = stepper({
        value: Math.max(1, Math.round(durationMs / 60000)), step: 1, min: 1, max: 600,
        format: v => S.fmtDur(v * 60000),
        onChange: v => { durationMs = v * 60000; durLine.textContent = S.fmtDur(durationMs); }
      });
      panel.appendChild(el('div', { class: 'sheet-section' },
        el('span', { class: 'label', text: 'HOW LONG' }), durStep.node));
    }

    /* tags */
    const tagsUI = tagInput({
      initial: tags,
      suggestions: S.topTags(store.get().drives, 6),
      onChange: v => { tags = v; }
    });
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'TAGS' }), tagsUI.node));

    /* save */
    panel.appendChild(el('button', {
      class: 'btn primary wide', style: { marginTop: '22px' }, text: 'Save',
      onclick: () => {
        tagsUI.commitTyped();
        const label = placeField.value.trim();
        const patch = { category, tags: tagsUI.value };
        if (isEdit) { patch.durationMs = durationMs; patch.endedAt = d.startedAt + durationMs; }
        store.updateDrive(driveId, patch);
        if (category) store.setting('lastCategory', category);

        if (label && label !== (store.getDrive(driveId).placeLabel || '')) {
          renameStop(driveId, label);
          if (!store.get().settings.seenNameTip) {
            store.setting('seenNameTip', true);
            setTimeout(() => toast('Named it? I’ll recognise it next time.', { ms: 4200 }), 700);
          }
        }
        close();
        const fresh = store.getDrive(driveId);
        if (!isEdit) show('home');
        else show(current() || 'log');
        toast(`Logged. ${S.fmtDur(fresh.durationMs)}.`);
      }
    }));

    /* background jobs land -> update the sheet in place */
    unsub = store.on('drives', () => {
      const fresh = store.getDrive(driveId);
      if (!fresh) return;
      paintDistance();
      if (!placeTouched && fresh.placeLabel && placeField.value !== fresh.placeLabel) {
        placeField.value = fresh.placeLabel;
        clear(placeHint);
      }
    });
  }, { onClose: () => { if (unsub) unsub(); } });
}

/* --- quick-add: a drive he forgot --------------------------------------- */

export function openQuickAdd() {
  let category = store.get().settings.lastCategory || null;
  let minutes = 15;
  let tags = [];

  sheet((panel, close) => {
    panel.appendChild(el('h2', { text: 'Log a past drive' }));
    panel.appendChild(el('p', { class: 'muted tiny', text: 'Three taps. No GPS, no route — just the time.', style: { marginTop: '4px' } }));

    const cat = categoryToggle(category, v => { category = v; });
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'WHAT WAS IT' }), cat.node));

    /* duration: preset chips + a stepper */
    const step = stepper({
      value: minutes, step: 5, min: 1, max: 600,
      format: v => S.fmtDur(v * 60000),
      onChange: v => { minutes = v; paintPresets(); }
    });
    const presets = el('div', { class: 'tag-chips' });
    function paintPresets() {
      clear(presets);
      PRESETS.forEach(p => presets.appendChild(el('button', {
        class: 'tag' + (p === minutes ? ' on' : ''), text: p + ' min',
        onclick: () => { minutes = p; step.set(p); }
      })));
    }
    paintPresets();
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'HOW LONG' }), step.node, presets));

    /* place with autocomplete off saved places */
    const placeField = el('input', { class: 'field', type: 'text', placeholder: 'Where did you go?' });
    const acWrap = el('div', { class: 'tag-chips' });
    placeField.addEventListener('input', () => {
      clear(acWrap);
      suggest(placeField.value, 4).forEach(p => acWrap.appendChild(el('button', {
        class: 'tag', text: p.label,
        onclick: () => { placeField.value = p.label; clear(acWrap); }
      })));
    });
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'WHERE' }), placeField, acWrap));

    /* when — defaults to an hour ago */
    const when = el('input', { class: 'field', type: 'datetime-local', value: localISO(Date.now() - 3600000) });
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'WHEN' }), when));

    const tagsUI = tagInput({
      initial: [], suggestions: S.topTags(store.get().drives, 6),
      onChange: v => { tags = v; }
    });
    panel.appendChild(el('div', { class: 'sheet-section' },
      el('span', { class: 'label', text: 'TAGS' }), tagsUI.node));

    panel.appendChild(el('button', {
      class: 'btn primary wide', style: { marginTop: '22px' }, text: 'Log it',
      onclick: () => {
        tagsUI.commitTyped();
        const startedAt = when.value ? new Date(when.value).getTime() : Date.now() - 3600000;
        const durationMs = minutes * 60000;
        const label = placeField.value.trim();
        const known = label ? placeByLabel(label) : null;

        const d = store.newDrive({
          category,
          tags: tagsUI.value,
          startedAt,
          endedAt: startedAt + durationMs,
          durationMs,
          placeId: known ? known.id : null,
          placeLabel: label || null,
          routeSource: 'none',
          origin: 'quicklog'
        });
        store.addDrive(d);
        if (known) store.updatePlace(known.id, {
          visits: (known.visits || 0) + 1,
          totalMs: (known.totalMs || 0) + durationMs
        });
        if (category) store.setting('lastCategory', category);
        close();
        show(current() === 'log' ? 'log' : 'home');
        toast(`Logged. ${S.fmtDur(durationMs)}.`);
      }
    }));
  });
}

function localISO(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
