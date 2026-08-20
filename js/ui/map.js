/* HOURS — ui/map.js
   Every route ever driven, stacked on a warm dark map. Roads he uses often
   build up into a bright web of where he actually goes. */

import * as store from '../store.js';
import * as S from '../stats.js';
import { el, clear, palette } from './widgets.js';

const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const ATTRIB = '© OpenStreetMap contributors © CARTO';
const SYDNEY = [-33.8688, 151.2093];

let map = null;
let filterCat = 'all';
const animated = new Set();     // routes we have already drawn in

export function mount(root) {
  root.classList.add('map-root');
  const holder = el('div', { id: 'leaflet-map' });
  const screen = el('div', { id: 'map-screen' }, holder);

  const controls = el('div', { class: 'map-overlay' });
  [['all', 'All'], ['sent', 'Sent'], ['chose', 'Chose']].forEach(([id, label]) => {
    controls.appendChild(el('button', {
      class: 'filter' + (filterCat === id ? ' on' : ''),
      data: id === 'all' ? {} : { cat: id },
      text: label,
      onclick: () => { filterCat = id; draw(); paintControls(controls); }
    }));
  });
  controls.appendChild(el('button', { class: 'btn ghost', text: 'Fit everything', onclick: () => fit() }));
  screen.appendChild(controls);
  root.appendChild(screen);

  if (typeof L === 'undefined') {
    screen.appendChild(el('div', { class: 'map-empty', text: 'Map library did not load.' }));
    return;
  }

  map = L.map(holder, { zoomControl: false, attributionControl: true }).setView(SYDNEY, 11);
  L.tileLayer(TILES, { attribution: ATTRIB, maxZoom: 19, subdomains: 'abcd' }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  draw();
  setTimeout(() => { if (map) map.invalidateSize(); }, 60);
}

export function unmount() {
  if (map) { map.remove(); map = null; }
}

function paintControls(controls) {
  [...controls.children].forEach(c => {
    if (c.classList.contains('filter')) {
      c.classList.toggle('on', (c.dataset.cat || 'all') === filterCat);
    }
  });
}

let layer = null;

function draw() {
  if (!map) return;
  if (layer) { layer.remove(); }
  layer = L.layerGroup().addTo(map);

  const drives = store.get().drives.filter(d =>
    d.routeGeometry && d.routeGeometry.length > 1 &&
    (filterCat === 'all' || d.category === filterCat));

  drives.forEach(d => {
    const P = palette();
    const colour = d.category === 'sent' ? P.coral : P.teal;
    const line = L.polyline(d.routeGeometry, {
      color: colour,
      weight: 3,
      opacity: 0.3,
      dashArray: d.routeSource === 'estimate' ? '4 7' : null,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(layer);

    // the reward moment: a route he just drove draws itself in
    if (isFresh(d) && !animated.has(d.id) && d.routeSource !== 'estimate') {
      animated.add(d.id);
      drawIn(line);
    }
  });

  const places = store.get().places.filter(p => p.lat !== null && p.lon !== null);
  const PAL = palette();
  places.forEach(p => {
    const r = 6 + Math.min(p.visits || 0, 20) * 0.8;
    L.circleMarker([p.lat, p.lon], {
      radius: r + 4, color: PAL.coral, weight: 1, opacity: 0.5, fillOpacity: 0.08, fillColor: PAL.coral
    }).addTo(layer);
    L.circleMarker([p.lat, p.lon], {
      radius: r, color: PAL.peach, weight: 1, fillColor: PAL.peach, fillOpacity: 0.85
    }).addTo(layer).bindPopup(
      `<div class="pop-title">${escapeHTML(p.label)}</div>` +
      `<div class="pop-sub">${p.visits || 0} visit${(p.visits || 0) === 1 ? '' : 's'} · ${S.fmtDur(p.totalMs || 0)}</div>`
    );
  });

  const home = store.get().settings.homeCoords;
  if (home) {
    L.circleMarker([home.lat, home.lon], {
      radius: 7, color: PAL.rust, weight: 2, fillColor: PAL.rust, fillOpacity: 0.5
    }).addTo(layer).bindPopup('<div class="pop-title">Home</div>');
  }

  const screen = document.getElementById('map-screen');
  const old = screen && screen.querySelector('.map-empty');
  if (old) old.remove();

  if (!drives.length && !places.length) {
    const anyDrives = store.get().drives.length > 0;
    if (screen) screen.appendChild(el('div', {
      class: 'map-empty',
      text: anyDrives
        ? 'Nothing mapped yet. Drives need location switched on.'
        : 'No drives yet. Your city is blank.'
    }));
    centreOnHim();
  } else {
    fit();
  }
}

function isFresh(d) { return Date.now() - (d.updatedAt || d.createdAt || 0) < 5 * 60000; }

/* stroke-dasharray animation over 1.2 s */
function drawIn(line) {
  const path = line._path;
  if (!path || !path.getTotalLength) return;
  const len = path.getTotalLength();
  if (!isFinite(len) || len === 0) return;
  path.style.strokeDasharray = `${len} ${len}`;
  path.style.strokeDashoffset = String(len);
  path.style.opacity = '0.95';
  requestAnimationFrame(() => {
    path.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.2,.9,.25,1), opacity 1.4s ease';
    path.style.strokeDashoffset = '0';
    path.style.opacity = '0.3';
  });
}

function fit() {
  if (!map || !layer) return;
  const bounds = [];
  store.get().drives.forEach(d => {
    if (d.routeGeometry && (filterCat === 'all' || d.category === filterCat)) bounds.push(...d.routeGeometry);
  });
  store.get().places.forEach(p => { if (p.lat !== null) bounds.push([p.lat, p.lon]); });
  if (bounds.length) map.fitBounds(bounds, { padding: [46, 46], maxZoom: 15 });
  else centreOnHim();
}

/* Blank map: put him on it rather than a random city. */
function centreOnHim() {
  if (!map) return;
  const s = store.get().settings;
  if (s.homeCoords) { map.setView([s.homeCoords.lat, s.homeCoords.lon], 13); return; }
  if (s.lastLat !== null && s.lastLat !== undefined) { map.setView([s.lastLat, s.lastLon], 13); return; }
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!map) return;
        store.setting('lastLat', pos.coords.latitude);
        store.setting('lastLon', pos.coords.longitude);
        map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  }
}

/* --- the little map inside an expanded docket ------------------------- */

export function miniMap(holder, drive) {
  if (typeof L === 'undefined' || !drive.routeGeometry || drive.routeGeometry.length < 2) return;
  const m = L.map(holder, {
    zoomControl: false, attributionControl: false,
    dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
    touchZoom: false, boxZoom: false, keyboard: false
  });
  L.tileLayer(TILES, { maxZoom: 19, subdomains: 'abcd' }).addTo(m);
  const P = palette();
  const colour = drive.category === 'sent' ? P.coral : P.teal;
  const line = L.polyline(drive.routeGeometry, {
    color: colour, weight: 3, opacity: 0.9,
    dashArray: drive.routeSource === 'estimate' ? '4 7' : null
  }).addTo(m);
  m.fitBounds(line.getBounds(), { padding: [18, 18] });
  setTimeout(() => m.invalidateSize(), 40);
  return m;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
