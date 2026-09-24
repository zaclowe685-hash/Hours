/* HOURS — ui/map.js
   Home, every pinned errand (bigger the more runs), and the road route from
   home to each — the lines are home→errand routes from OSRM, since GO and
   I'M BACK are both tapped at home. Old v1 drives keep their own lines. */

import * as store from '../store.js';
import * as errands from '../errands.js';
import * as S from '../stats.js';
import { el, palette } from './widgets.js';
import { show } from './screens.js';

// Esri's dark canvas: free, no key (CARTO's dark tiles now demand one)
const TILES = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const LABELS = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
const ATTRIB = 'Esri · © OpenStreetMap';
const NORTHERN_BEACHES = [-33.75, 151.26];

let map = null;
let offRoutes = null;

export function mount(root) {
  const holder = el('div', { id: 'leaflet-map' });
  const screen = el('div', { id: 'map-screen' }, holder);
  root.appendChild(screen);

  screen.appendChild(el('div', { class: 'map-top' }, el('h1', { text: 'Map' })));

  const km = S.totalKm(store.get().drives);
  const pinned = errands.all().filter(e => e.lat !== null && e.lat !== undefined).length;
  const home = store.get().settings.homeCoords;
  screen.appendChild(el('div', { class: 'map-card' },
    home
      ? el('div', {},
          el('div', { class: 'v' }, km.known ? '~' + S.fmtKm(km.km) : '0', el('small', { text: 'km' })),
          el('div', { class: 'k', text: `driven for the family · ${pinned} place${pinned === 1 ? '' : 's'}` }))
      : el('div', {},
          el('div', { style: { fontWeight: '700' }, text: 'Home isn’t set yet' }),
          el('div', { class: 'k', text: 'It sets itself the next time you tap GO.' })),
    home ? null : el('button', { class: 'btn sm', text: 'Settings', onclick: () => show('settings') })
  ));

  if (typeof L === 'undefined') {
    holder.appendChild(el('div', { class: 'empty', text: 'The map needs a connection.' }));
    return;
  }

  map = L.map(holder, { zoomControl: false, attributionControl: true }).setView(NORTHERN_BEACHES, 12);
  L.tileLayer(TILES, { attribution: ATTRIB, maxZoom: 16 }).addTo(map);
  const labels = map.createPane('labels');          // place names above the land, under the routes
  labels.style.zIndex = 350;
  labels.style.pointerEvents = 'none';
  L.tileLayer(LABELS, { maxZoom: 16, pane: 'labels' }).addTo(map);
  draw();
  offRoutes = store.on('routes', draw);
  errands.resolveRoutes();
  setTimeout(() => { if (map) map.invalidateSize(); }, 60);
}

export function unmount() {
  if (offRoutes) { offRoutes(); offRoutes = null; }
  if (map) { map.remove(); map = null; }
}

let layer = null;

function draw() {
  if (!map) return;
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  const P = palette();
  const drives = store.get().drives;
  const home = store.get().settings.homeCoords;
  const bounds = [];

  // runs per errand, for pin size and line weight
  const count = new Map();
  drives.forEach(d => { if (d.errandId) count.set(d.errandId, (count.get(d.errandId) || 0) + 1); });

  // old v1 lines, faint
  drives.forEach(d => {
    if (!d.errandId && d.routeGeometry && d.routeGeometry.length > 1) {
      L.polyline(d.routeGeometry, { color: P.sun3, weight: 2, opacity: .35, lineCap: 'round' }).addTo(layer);
      bounds.push(...d.routeGeometry);
    }
  });

  errands.all().forEach(e => {
    if (e.lat === null || e.lat === undefined) return;
    const n = count.get(e.id) || 0;
    if (e.routeGeom && e.routeGeom.length > 1) {
      // a soft under-glow line plus the bright one
      L.polyline(e.routeGeom, { color: P.sun4, weight: 8 + Math.min(n, 10), opacity: .12, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
      L.polyline(e.routeGeom, { color: P.sun2, weight: 2.5 + Math.min(n, 8) * 0.25, opacity: .95, lineCap: 'round', lineJoin: 'round' }).addTo(layer);
      bounds.push(...e.routeGeom);
    }
    const r = 7 + Math.min(n, 12) * 0.9;
    L.circleMarker([e.lat, e.lon], { radius: r + 5, color: P.sun2, weight: 1, opacity: .5, fillOpacity: 0 }).addTo(layer);
    L.circleMarker([e.lat, e.lon], { radius: r, color: P.bg, weight: 2, fillColor: P.sun1, fillOpacity: 1 })
      .addTo(layer)
      .bindPopup(`<div class="pop-title">${esc(e.name)}</div><div class="pop-sub">${n} run${n === 1 ? '' : 's'}${e.routeKm ? ` · ${S.fmtKm(e.routeKm)} km each way` : ''}</div>`);
    bounds.push([e.lat, e.lon]);
  });

  if (home) {
    L.circleMarker([home.lat, home.lon], { radius: 9, color: P.bg, weight: 3, fillColor: P.tx, fillOpacity: 1 })
      .addTo(layer).bindPopup('<div class="pop-title">Home</div>');
    bounds.push([home.lat, home.lon]);
  }

  if (bounds.length > 1) map.fitBounds(bounds, { paddingTopLeft: [40, 80], paddingBottomRight: [40, 120], maxZoom: 15 });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
