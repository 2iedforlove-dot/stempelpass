import { Sync, deriveKeys, newCode, normCode } from './sync.js';
import { KATEGORIEN, BANGKOK } from './vorlagen.js';
import { icon, PFADE } from './icons.js';
import { sound, haptik, tonAn, tonSetzen } from './feedback.js';

const maplibregl = window.maplibregl;
const pmtiles = window.pmtiles;
const basemaps = window.basemaps;

// Offline-Karte: Ausschnitt aus Protomaps (OpenStreetMap), Bangkok bis Ayutthaya
const REGION = { datei: 'karte/bangkok.pmtiles', name: 'bangkok.pmtiles', bbox: [99.85, 13.45, 100.75, 14.45], mb: 64 };
const KARTEN_CACHE = 'sp-karte';
const FARBEN = ['#ff6b3d', '#32b47a', '#8e6cf0', '#3b8cff', '#ff4f8b', '#e3a21a', '#19a7c4'];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (p) => new URL(p, location.href).href;
const zufall = (n = 10) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b & 31]).join('');
const istIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const istApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// ---------- Speicher ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const ich = LS.get('sp.ich', null) || { id: zufall(8), name: '', farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)] };
LS.set('sp.ich', ich);

const trips = new Map(); // id -> { code, keys, data }
let aktuell = LS.get('sp.aktuell', null);
const ui = { ansicht: 'liste', ortId: null, filter: 'alle', snap: 'mitte' };
let pos = null; // {lat, lng, genau}

const speicherTimer = new Map();
function speichern(id, sofort) {
  clearTimeout(speicherTimer.get(id));
  const tun = () => { const t = trips.get(id); if (t) LS.set('sp.trip.' + id, t.data); };
  if (sofort) tun(); else speicherTimer.set(id, setTimeout(tun, 300));
}
addEventListener('pagehide', () => trips.forEach((_, id) => speichern(id, true)));

function tripListeSpeichern() {
  LS.set('sp.trips', [...trips.values()].map((t) => t.code));
  LS.set('sp.aktuell', aktuell);
}

async function tripLaden(code) {
  const keys = await deriveKeys(code);
  if (trips.has(keys.id)) return keys.id;
  const data = LS.get('sp.trip.' + keys.id, null) || { records: {}, synced: {} };
  trips.set(keys.id, { code, keys, data });
  return keys.id;
}

// ---------- Datensätze ----------
function schreiben(tripId, key, v) {
  const t = trips.get(tripId);
  if (!t) return;
  const alt = t.data.records[key];
  const zeit = Math.max(Date.now(), alt ? alt.t + 1 : 0);
  t.data.records[key] = { v, t: zeit, by: ich.id, ca: alt ? alt.ca : 0 };
  speichern(tripId);
  sync.publish(tripId, key);
  neuZeichnen();
}

function ansicht(tripId) {
  const t = trips.get(tripId);
  if (!t) return null;
  const r = t.data.records;
  const meta = r.meta ? r.meta.v : null;
  const orte = [];
  const leute = [];
  for (const [k, rec] of Object.entries(r)) {
    if (k.startsWith('p:') && rec.v && !rec.v.weg) {
      const id = k.slice(2);
      const c = r['c:' + id];
      orte.push({ id, ...rec.v, check: c && c.v && c.v.ok ? c.v : null });
    } else if (k.startsWith('m:') && rec.v) {
      leute.push({ id: k.slice(2), ...rec.v });
    }
  }
  orte.sort((a, b) => (a.o ?? 1e9) - (b.o ?? 1e9) || String(a.n).localeCompare(b.n));
  orte.forEach((o, i) => { o.nr = i + 1; });
  const erledigt = orte.filter((o) => o.check).length;
  const ausstehend = Object.entries(r).filter(([k, rec]) => (t.data.synced[k] || 0) < rec.t).length;
  return { t, meta, orte, leute, erledigt, ausstehend };
}

function name(v, id) {
  if (id === ich.id) return 'dir';
  const m = v.leute.find((l) => l.id === id);
  return m ? m.n : 'jemandem';
}

// ---------- Sync ----------
const sync = new Sync({
  getTrips: () => trips,
  onRemote: (tripId) => { speichern(tripId); if (tripId === aktuell) neuZeichnen(); else syncAnzeige(); },
  onAck: (tripId) => { speichern(tripId); syncAnzeige(); },
  onStatus: () => syncAnzeige(),
});

// ---------- Hilfen ----------
function abstand(a, b) {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const entfernung = (o) => (!pos || o.lat == null ? null : abstand(pos, o));
const meter = (m) => m == null ? '' : m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toLocaleString('de-AT', { maximumFractionDigits: m < 10000 ? 1 : 0 }) + ' km';
const wann = (ms) => {
  const d = new Date(ms), heute = new Date();
  const uhr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === heute.toDateString()) return 'heute ' + uhr;
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + uhr;
};
const kat = (k) => KATEGORIEN[k] ? { ...KATEGORIEN[k], id: k } : { ...KATEGORIEN.sonst, id: 'sonst' };
const katIcon = (k, g = 22) => icon(kat(k).id, g);
const pfeilRechts = () => icon('zurueck', 18, 2.4).replace('class="ic"', 'class="ic" style="transform:rotate(180deg)"');

function toast(text, aktion, fn, dauer = 3200) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${aktion ? `<button>${esc(aktion)}</button>` : ''}`;
  if (aktion) el.querySelector('button').onclick = () => { el.classList.remove('zeigen'); fn(); };
  el.classList.add('zeigen');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('zeigen'), dauer);
}

// Runde Scheibe mit umlaufender Schrift (wie der Lautsprecher in der Vorlage)
let scheibenNr = 0;
function scheibe({ text, inhalt, klasse = '', attr = '' }) {
  const id = 'rk' + ++scheibenNr;
  const t = (text + ' • ').repeat(Math.max(1, Math.ceil(36 / (text.length + 3))));
  return `<button class="scheibe ${klasse}" ${attr}>
    <svg class="ring-text" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="${id}" d="M50,50 m-40.5,0 a40.5,40.5 0 1,1 81,0 a40.5,40.5 0 1,1 -81,0"/></defs>
      <text><textPath href="#${id}" textLength="252" lengthAdjust="spacing">${esc(t.toUpperCase())}</textPath></text></svg>
    <span class="mitte">${inhalt}</span>
  </button>`;
}

// ---------- Karte ----------
const protokoll = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protokoll.tile);
let offlineKarte = false;

async function kartenQuelle() {
  try {
    const c = await caches.open(KARTEN_CACHE);
    const r = await c.match(abs(REGION.datei));
    if (r) {
      const blob = await r.blob();
      protokoll.add(new pmtiles.PMTiles(new pmtiles.FileSource(new File([blob], REGION.name))));
      offlineKarte = true;
      return 'pmtiles://' + REGION.name;
    }
  } catch (e) { console.warn('Offline-Karte nicht lesbar', e); }
  return 'pmtiles://' + abs(REGION.datei);
}

function kartenStil(url) {
  // Graphit-Karte passend zum Glas-Design
  const f = basemaps.namedFlavor('dark');
  Object.assign(f, {
    background: '#161618', earth: '#1c1c1f', water: '#0f1418', park_a: '#1c2320', park_b: '#1f2a24',
    wood_a: '#1c2320', wood_b: '#1f2a24', scrub_a: '#1d2220', scrub_b: '#1f2623', buildings: '#252528',
    other: '#2a2a2e', minor_a: '#2c2c30', minor_b: '#2c2c30', minor_service: '#28282c', major: '#36363b', highway: '#45403b',
    bridges_major: '#36363b', bridges_highway: '#45403b', city_label: '#a1a1a8', subplace_label: '#6f6f77',
    roads_label_major: '#77777f', roads_label_minor: '#5f5f66', roads_label_major_halo: '#161618', roads_label_minor_halo: '#161618',
    city_label_halo: '#161618', subplace_label_halo: '#161618', ocean_label: '#4a5a66',
  });
  // Ohne die bunten Karten-POIs: nur eure Orte sollen auffallen
  const schichten = basemaps.layers('protomaps', f, { lang: 'en' }).filter((l) => l.id !== 'background' && l.id !== 'pois');
  return {
    version: 8,
    glyphs: abs('karte/fonts/') + '{fontstack}/{range}.pbf',
    sprite: abs('karte/sprites/dark'),
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' },
      protomaps: { type: 'vector', url, attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    layers: [
      { id: 'grund', type: 'background', paint: { 'background-color': '#161618' } },
      { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-saturation': -1, 'raster-brightness-max': 0.35, 'raster-contrast': 0.1 } },
      ...schichten,
    ],
  };
}

const imGebiet = (lng, lat) => lng > REGION.bbox[0] && lng < REGION.bbox[2] && lat > REGION.bbox[1] && lat < REGION.bbox[3];

let map;
let karteBereit = false;

async function karteStarten() {
  map = new maplibregl.Map({
    container: 'map',
    style: kartenStil(await kartenQuelle()),
    center: [100.53, 13.74], zoom: 11.3, minZoom: 3, maxZoom: 18.5,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.on('moveend', osmUmschalten);
  map.on('load', () => { osmUmschalten(); ebenenAnlegen(); karteBereit = true; neuZeichnen(); });
  map.on('click', (e) => {
    if (auswahlAktiv || Date.now() - langGedrueckt < 800) return;
    const id = pinBei(e.point);
    if (id) { sound.tick(); haptik('leicht'); detailOeffnen(id, true); } else if (ui.ansicht === 'detail') zurListe();
  });
  map.on('mousemove', (e) => { map.getCanvas().style.cursor = pinBei(e.point) ? 'pointer' : ''; });
  map.on('contextmenu', (e) => {
    const id = pinBei(e.point);
    if (id) { langGedrueckt = Date.now(); ortMenue(id); } else langDruck(e.lngLat);
  });
  langDruckErkennen();
}

function osmUmschalten() {
  if (!map.getLayer('osm')) return;
  const c = map.getCenter();
  const sichtbar = !imGebiet(c.lng, c.lat) || map.getZoom() < 7;
  map.setLayoutProperty('osm', 'visibility', sichtbar && navigator.onLine ? 'visible' : 'none');
}

// Pins sind eine Kartenebene (WebGL) statt HTML-Elemente: dadurch kleben sie fest an der Karte und wackeln nicht
function ebenenAnlegen() {
  map.addSource('orte', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource('ich', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'ich-hof', type: 'circle', source: 'ich', paint: { 'circle-radius': 18, 'circle-color': '#3b8cff', 'circle-opacity': 0.16, 'circle-pitch-alignment': 'map' } });
  map.addLayer({ id: 'ich-punkt', type: 'circle', source: 'ich', paint: { 'circle-radius': 7, 'circle-color': '#3b8cff', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
  map.addLayer({
    id: 'orte-namen', type: 'symbol', source: 'orte', minzoom: 13.5,
    layout: {
      'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.35],
      'text-max-width': 9, 'text-optional': true, 'symbol-sort-key': ['-', 10, ['get', 'sort']],
    },
    paint: { 'text-color': '#f5f5f7', 'text-halo-color': 'rgba(10,10,12,.9)', 'text-halo-width': 1.6, 'text-opacity': ['get', 'deckkraft'] },
  });
  map.addLayer({
    id: 'orte', type: 'symbol', source: 'orte',
    layout: {
      'icon-image': ['get', 'bild'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
      'symbol-sort-key': ['get', 'sort'], 'symbol-z-order': 'source',
    },
    paint: { 'icon-opacity': ['get', 'deckkraft'] },
  });
}

// Ein Pin-Bild pro Zustand (Kategorie, gestempelt, Nummer, aktiv), auf ein Canvas gezeichnet
function pinBild(o, aktiv) {
  const name = `pin-${kat(o.k).id}-${o.check ? 1 : 0}-${o.nr}-${aktiv ? 1 : 0}`;
  if (map.hasImage(name)) return name;
  const s = aktiv ? 1.22 : 1, pr = 2;
  const W = 52 * s, H = 56 * s;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * pr); cv.height = Math.ceil(H * pr);
  const c = cv.getContext('2d');
  c.scale(pr * s, pr * s);
  const cx = 23, cy = 24, r = 18.5;
  // Körper: Kreis mit kleiner Spitze
  c.save();
  c.shadowColor = 'rgba(0,0,0,.55)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.beginPath();
  c.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 2.38);
  c.lineTo(cx, 54);
  c.closePath();
  if (o.check) {
    const g = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, '#ff8a4c'); g.addColorStop(0.5, '#ff5d1f'); g.addColorStop(1, '#e8420c');
    c.fillStyle = g;
  } else c.fillStyle = '#f4f4f6';
  c.fill();
  c.restore();
  if (aktiv) { c.lineWidth = 3; c.strokeStyle = o.check ? '#ffffff' : '#ff5d1f'; c.stroke(); }
  // Kategorie-Icon
  c.save();
  c.translate(cx - 9.5, cy - 9.5); c.scale(19 / 24, 19 / 24);
  c.strokeStyle = o.check ? '#ffffff' : '#17171a';
  c.lineWidth = 2.2; c.lineCap = 'round'; c.lineJoin = 'round';
  c.stroke(new Path2D(PFADE[kat(o.k).id]));
  c.restore();
  // Abzeichen: Nummer bzw. Haken
  const bx = 40, by = 9;
  c.beginPath(); c.arc(bx, by, 8.5, 0, Math.PI * 2);
  c.fillStyle = o.check ? '#ffffff' : '#17171a'; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = o.check ? '#ff5d1f' : '#f4f4f6'; c.stroke();
  if (o.check) {
    c.save(); c.translate(bx - 5.5, by - 5.5); c.scale(11 / 24, 11 / 24);
    c.strokeStyle = '#ff5d1f'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke(new Path2D(PFADE.haken)); c.restore();
  } else {
    c.fillStyle = '#ffffff'; c.font = `700 ${o.nr > 99 ? 7 : 9.5}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(o.nr), bx, by + 0.5);
  }
  map.addImage(name, c.getImageData(0, 0, cv.width, cv.height), { pixelRatio: pr });
  return name;
}

function pinsZeichnen(v) {
  if (!karteBereit) return;
  const features = [];
  for (const o of v ? v.orte : []) {
    if (o.lat == null) continue;
    const aktiv = ui.ansicht === 'detail' && ui.ortId === o.id;
    const gefiltert = (ui.filter === 'offen' && o.check) || (ui.filter === 'erledigt' && !o.check);
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [o.lng, o.lat] },
      properties: { id: o.id, name: o.n, bild: pinBild(o, aktiv), sort: aktiv ? 3 : o.check ? 1 : 2, deckkraft: gefiltert ? 0.3 : 1 },
    });
  }
  map.getSource('orte').setData({ type: 'FeatureCollection', features });
}

function pinBei(p) {
  if (!karteBereit) return null;
  const f = map.queryRenderedFeatures([[p.x - 12, p.y - 12], [p.x + 12, p.y + 12]], { layers: ['orte'] });
  if (!f.length) return null;
  f.sort((a, b) => b.properties.sort - a.properties.sort);
  return f[0].properties.id;
}

function ichZeichnen() {
  if (!karteBereit || !pos) return;
  map.getSource('ich').setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [pos.lng, pos.lat] }, properties: {} });
}

function langDruckErkennen() {
  const el = map.getCanvasContainer();
  let timer = null, start = null;
  const ab = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return ab();
    const t = e.touches[0];
    start = { x: t.clientX, y: t.clientY };
    ab();
    timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const p = { x: start.x - r.left, y: start.y - r.top };
      const id = pinBei(p);
      langGedrueckt = Date.now();
      if (id) { haptik('mittel'); sound.tick(); ortMenue(id); } else langDruck(map.unproject([p.x, p.y]), true);
    }, 520);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) ab(); }, { passive: true });
  el.addEventListener('touchend', ab);
  el.addEventListener('touchcancel', ab);
}

function langDruck(lngLat, schonGeprueft) {
  if (!aktuell || $('#modal').hidden === false || (!schonGeprueft && Date.now() - langGedrueckt < 1200)) return;
  haptik('mittel');
  ortEditor({ lat: lngLat.lat, lng: lngLat.lng });
}

function allesZeigen(sanft = true) {
  const v = ansicht(aktuell);
  let mitOrt = v ? v.orte.filter((o) => o.lat != null) : [];
  if (!mitOrt.length) return;
  // Auf den Kern zoomen: Ausflugsziele weit weg (Ayutthaya …) erst beim Herauszoomen
  const mitte = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const kern = { lat: mitte(mitOrt.map((o) => o.lat)), lng: mitte(mitOrt.map((o) => o.lng)) };
  const nah = mitOrt.filter((o) => Math.hypot(o.lat - kern.lat, (o.lng - kern.lng) * Math.cos(kern.lat * Math.PI / 180)) < 0.15);
  if (nah.length >= mitOrt.length / 2) mitOrt = nah;
  const b = new maplibregl.LngLatBounds();
  mitOrt.forEach((o) => b.extend([o.lng, o.lat]));
  // fitBounds rechnet den bestehenden Kartenrand dazu, darum vorher zurücksetzen
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(b, { padding: polster(50), maxZoom: 15, duration: sanft ? 900 : 0 });
}

function polster(extra = 30) {
  const breit = innerWidth >= 760;
  return { top: 80 + extra, bottom: breit ? extra : sichtbarHoehe() + extra, left: breit ? 442 + extra : extra, right: extra + 40 };
}

// ---------- Standort ----------
let ortungId = null;
function ortungStarten(zentrieren) {
  if (!('geolocation' in navigator)) return toast('Standort wird nicht unterstützt');
  $('#ortungKnopf').classList.add('an');
  let erstes = true;
  if (ortungId == null) {
    ortungId = navigator.geolocation.watchPosition((p) => {
      pos = { lat: p.coords.latitude, lng: p.coords.longitude, genau: p.coords.accuracy };
      ichZeichnen();
      if (zentrieren && erstes) map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 14), padding: polster(), duration: 800 });
      erstes = false;
      sheetZeichnenGedrosselt();
    }, (e) => {
      $('#ortungKnopf').classList.remove('an');
      ortungId = null;
      if (e.code === 1) toast('Standort-Freigabe fehlt – in den Einstellungen erlauben');
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  } else if (pos && zentrieren) {
    map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 14), padding: polster(), duration: 800 });
  }
}
let sheetDrossel = 0;
function sheetZeichnenGedrosselt() { if (Date.now() - sheetDrossel > 8000) { sheetDrossel = Date.now(); neuZeichnen(); } }

// ---------- Sheet ----------
const sheet = $('#sheet');
function snapY(s) {
  const H = innerHeight;
  if (s === 'zu') return H - 150;
  if (s === 'voll') return Math.max(64, H * 0.09);
  return Math.round(H * 0.48);
}
function sichtbarHoehe() { return innerHeight - snapY(ui.snap); }

function sheetSetzen(s, mitKarte = true) {
  ui.snap = s;
  sheet.classList.add('gleitet');
  sheet.style.transform = `translateY(${snapY(s)}px)`;
  document.documentElement.style.setProperty('--sichtbar', sichtbarHoehe() + 'px');
  document.documentElement.style.setProperty('--attrib-unten', innerWidth >= 760 ? '0px' : sichtbarHoehe() + 'px');
  if (mitKarte && map && innerWidth < 760) map.easeTo({ padding: { top: 0, bottom: Math.min(sichtbarHoehe(), innerHeight * 0.6), left: 0, right: 0 }, duration: 450 });
}

function sheetZiehen() {
  let startY = 0, startT = 0, y0 = 0, zuletzt = [];
  sheet.addEventListener('pointerdown', (e) => {
    const griff = e.target.closest('.griff-zone');
    if (!griff || innerWidth >= 760 || e.target.closest('button, input, a')) return;
    startY = e.clientY; startT = performance.now(); y0 = snapY(ui.snap); zuletzt = [[startT, startY]];
    sheet.classList.remove('gleitet');
    griff.setPointerCapture(e.pointerId);
    const bewegen = (ev) => {
      const y = Math.max(snapY('voll') - 20, Math.min(innerHeight - 90, y0 + ev.clientY - startY));
      sheet.style.transform = `translateY(${y}px)`;
      zuletzt.push([performance.now(), ev.clientY]); if (zuletzt.length > 5) zuletzt.shift();
    };
    const los = (ev) => {
      griff.removeEventListener('pointermove', bewegen);
      griff.removeEventListener('pointerup', los);
      griff.removeEventListener('pointercancel', los);
      const dy = ev.clientY - startY;
      if (Math.abs(dy) < 6) {
        if (e.target.closest('.griff')) { sound.tick(); return sheetSetzen(ui.snap === 'zu' ? 'mitte' : ui.snap === 'mitte' ? 'voll' : 'mitte'); }
        return sheetSetzen(ui.snap, false);
      }
      const [t1, y1] = zuletzt[0];
      const tempo = (ev.clientY - y1) / Math.max(1, performance.now() - t1);
      const ziel = y0 + dy + tempo * 220;
      let best = 'voll';
      for (const s of ['voll', 'mitte', 'zu']) if (Math.abs(snapY(s) - ziel) < Math.abs(snapY(best) - ziel)) best = s;
      if (best !== ui.snap) { haptik('leicht'); sound.tick(); }
      sheetSetzen(best);
    };
    griff.addEventListener('pointermove', bewegen);
    griff.addEventListener('pointerup', los);
    griff.addEventListener('pointercancel', los);
  });
  addEventListener('resize', () => sheetSetzen(ui.snap, false));
}

// ---------- Zeichnen ----------
let zeichnenGeplant = false;
function neuZeichnen() {
  if (zeichnenGeplant) return;
  zeichnenGeplant = true;
  requestAnimationFrame(() => { zeichnenGeplant = false; allesZeichnen(); });
}

function allesZeichnen() {
  const v = ansicht(aktuell);
  $('#tripName').textContent = v ? (v.meta ? v.meta.n : 'Trip wird geladen…') : 'Stempelpass';
  $('#tripEmo').textContent = v && v.meta ? v.meta.e || '🗺️' : '🗺️';
  document.title = v && v.meta ? v.meta.n + ' · Stempelpass' : 'Stempelpass';
  if (map) pinsZeichnen(v);
  sheetZeichnen(v);
  syncAnzeige();
  fremdeStempelMelden(v);
}

// Wenn jemand anderes etwas abstempelt: kurz Bescheid geben
const bekannteStempel = new Map(); // tripId -> Set
function fremdeStempelMelden(v) {
  if (!v || !v.meta) return;
  const jetzt = new Set(v.orte.filter((o) => o.check).map((o) => o.id));
  const vorher = bekannteStempel.get(aktuell);
  bekannteStempel.set(aktuell, jetzt);
  if (!vorher) return;
  const neu = v.orte.filter((o) => o.check && !vorher.has(o.id) && o.check.by !== ich.id);
  if (neu.length && neu.length <= 2) {
    const o = neu[neu.length - 1];
    toast(`${name(v, o.check.by)} hat „${o.n}“ gestempelt`);
    sound.plopp(); haptik('leicht');
  }
}

function syncAnzeige() {
  const el = $('#syncKnopf');
  const v = ansicht(aktuell);
  const offen = v ? v.ausstehend : 0;
  const live = sync.online > 0;
  el.classList.toggle('live', live && !offen);
  el.classList.toggle('wartet', offen > 0);
  el.querySelector('span').textContent = live ? (offen ? 'Sync …' : 'Live') : offen ? `Offline · ${offen}` : 'Offline';
}

function segmente(v) {
  const n = v.orte.length;
  const liste = [['alle', 'raster', 'Alle', n], ['offen', 'kreis', 'Offen', n - v.erledigt], ['erledigt', 'kreisHaken', 'Erledigt', v.erledigt], ['naehe', 'navi', 'Nähe', null]];
  const i = Math.max(0, liste.findIndex((s) => s[0] === ui.filter));
  return `<div class="segmente" style="--n:4;--i:${i}"><span class="schieber"></span>
    ${liste.map(([id, ic, txt, z]) => `<button class="${ui.filter === id ? 'an' : ''}" data-filter="${id}">${icon(ic, 15, 2.2)}${txt}${z != null ? ` <span class="zahl">${z}</span>` : ''}</button>`).join('')}
  </div>`;
}

function kacheln() {
  const offline = offlineKarte
    ? `<button class="kachel akzent" data-aktion="offline">${icon('wolkeOk')}Offline ✓</button>`
    : laedt
      ? `<button class="kachel" data-aktion="offline" style="--f:${ladeAnteil}">${icon('wolke')}${Math.round(ladeAnteil * 100)} %<span class="fortschritt"><i></i></span></button>`
      : `<button class="kachel" data-aktion="offline">${icon('wolke')}Offline<span class="punkt"></span></button>`;
  return `<div class="kacheln">
    <button class="kachel akzent" data-aktion="hinzu">${icon('plus')}Hinzufügen</button>
    <button class="kachel" data-aktion="einladen">${icon('leute')}Einladen</button>
    ${offline}
    <button class="kachel" data-aktion="alle">${icon('karte')}Übersicht</button>
  </div>`;
}

function sheetZeichnen(v) {
  const box = $('#sheetInhalt');
  if (!v) { box.innerHTML = ''; return; }
  if (ui.ansicht === 'detail') {
    const o = v.orte.find((x) => x.id === ui.ortId);
    if (o) return detailZeichnen(v, o, box);
    ui.ansicht = 'liste';
  }
  const scroll = box.querySelector('.scroll');
  const merk = scroll ? scroll.scrollTop : 0;
  const n = v.orte.length;
  let liste = v.orte;
  if (ui.filter === 'offen') liste = liste.filter((o) => !o.check);
  if (ui.filter === 'erledigt') liste = liste.filter((o) => o.check).sort((a, b) => b.check.at - a.check.at);
  if (ui.filter === 'naehe') liste = [...liste].filter((o) => o.lat != null).sort((a, b) => entfernung(a) - entfernung(b));

  const leute = v.leute.slice(0, 6).map((l) => `<span style="background:${esc(l.c || '#888')}" title="${esc(l.n)}">${esc((l.n || '?').slice(0, 1).toUpperCase())}</span>`).join('');
  const karten = liste.map((o) => {
    const d = entfernung(o);
    const unten = o.check
      ? `<p class="von">${name(v, o.check.by) === 'dir' ? 'Von dir' : 'Von ' + esc(name(v, o.check.by))} · ${esc(wann(o.check.at))}</p>`
      : `<p>${esc(kat(o.k).name)}${d != null ? ' · ' + meter(d) : ''}</p>`;
    return `<article class="ort ${o.check ? 'erledigt' : ''}" data-id="${esc(o.id)}">
      <div class="ort-ico">${katIcon(o.k)}<span class="nr">${o.nr}</span></div>
      <div class="ort-text"><h3>${esc(o.n)}${o.lat == null ? '<span class="ohne-ort">ohne Ort</span>' : ''}</h3>${unten}</div>
      <button class="stempel" data-stempel="${esc(o.id)}" aria-label="${o.check ? 'Stempel entfernen' : 'Abstempeln'}">${icon('haken', 22, 2.6)}</button>
    </article>`;
  }).join('');

  const leer = !v.meta
    ? `<div class="leer-hinweis">${icon('sync', 30)}Trip wird von den anderen Handys geladen …<br><span class="klein">Dafür braucht es kurz Internet.</span></div>`
    : !n ? `<div class="leer-hinweis">${icon('sonst', 30)}Noch keine Orte – füg den ersten hinzu!</div>`
      : !liste.length ? `<div class="leer-hinweis">${ui.filter === 'naehe' ? 'Erlaube den Standort, dann stehen hier die nächsten Orte zuerst.' : ui.filter === 'offen' ? icon('pokal', 30) + 'Alles gestempelt!' : 'Noch nichts gestempelt.'}</div>` : '';

  box.innerHTML = `
    <div class="griff-zone">
      <div class="griff"></div>
      <div class="kopf-zeile">
        <div class="titel">
          <div class="eyebrow">Stempelpass</div>
          <h1>${esc(v.meta ? v.meta.n : '…')}</h1>
          <div class="unterzeile"><span>${v.erledigt} von ${n} gestempelt</span>${leute ? `<span class="leute">${leute}</span>` : ''}</div>
        </div>
        <div class="ring" style="--p:${n ? v.erledigt / n : 0}"><span>${v.erledigt}<small>/${n}</small></span></div>
      </div>
      ${segmente(v)}
    </div>
    <div class="scroll">
      ${v.meta ? kacheln() : ''}
      ${karten}${leer}
      ${n ? '<p class="lang-tipp">Lange auf einen Ort drücken zum Löschen oder Bearbeiten</p>' : ''}
    </div>`;
  const s = box.querySelector('.scroll');
  if (s) s.scrollTop = merk;
}

function detailZeichnen(v, o, box) {
  const d = entfernung(o);
  const wer = o.check ? name(v, o.check.by) : '';
  const ringText = `${v.meta ? v.meta.n : 'Stempelpass'} • Nr ${String(o.nr).padStart(2, '0')} • ${o.n.slice(0, 22)}`;
  box.innerHTML = `
    <div class="griff-zone">
      <div class="griff"></div>
      <div class="detail-oben">
        <button class="kreisknopf" data-aktion="liste" aria-label="Zurück">${icon('zurueck', 20, 2.2)}</button>
        <div class="mitte">${esc(kat(o.k).name)} · Nr. ${o.nr}</div>
        <button class="kreisknopf" data-aktion="menue" aria-label="Mehr">${icon('mehr', 20, 2.4)}</button>
      </div>
    </div>
    <div class="scroll">
      <div class="scheibe-box">
        ${scheibe({ text: ringText, inhalt: o.check ? icon('haken', 40, 2.6) : katIcon(o.k, 40), klasse: o.check ? 'gestempelt' : '', attr: `data-stempel="${esc(o.id)}" aria-label="${o.check ? 'Stempel entfernen' : 'Abstempeln'}"` })}
        <div class="scheibe-hinweis">${o.check ? `Gestempelt von ${esc(wer)} · ${esc(wann(o.check.at))}` : 'Auf die Scheibe tippen zum Abstempeln'}</div>
      </div>
      <h2 class="detail-name">${esc(o.n)}</h2>
      <div class="chips-zeile">
        <span class="chip-klein">${katIcon(o.k, 14)}${esc(kat(o.k).name)}</span>
        ${d != null ? `<span class="chip-klein">${icon('navi', 14)}${meter(d)}</span>` : ''}
        ${o.lat == null ? '<span class="chip-klein">Ohne festen Ort</span>' : ''}
        ${o.check ? `<span class="chip-klein orange">${icon('haken', 14, 2.6)}Erledigt</span>` : ''}
      </div>
      ${o.lat != null ? `<div class="zeile" style="margin-bottom:10px">
        <a class="knopf orange" href="${routeLink(o)}" target="_blank" rel="noopener">${icon('navi', 19)} Route</a>
        <button class="knopf" data-aktion="zentrieren">${icon('karte', 19)} Karte</button>
      </div>` : ''}
      ${o.notiz ? `<div class="karte-box"><div class="eyebrow">Notiz</div><p class="notiz">${esc(o.notiz)}</p></div>` : ''}
    </div>`;
}

function routeLink(o) {
  return istIOS
    ? `https://maps.apple.com/?daddr=${o.lat},${o.lng}&q=${encodeURIComponent(o.n)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
}

function detailOeffnen(id, vonKarte) {
  ui.ansicht = 'detail';
  ui.ortId = id;
  if (ui.snap === 'zu' || (vonKarte && ui.snap === 'voll')) sheetSetzen('mitte', false);
  allesZeichnen();
  const v = ansicht(aktuell);
  const o = v && v.orte.find((x) => x.id === id);
  if (o && o.lat != null) map.easeTo({ center: [o.lng, o.lat], zoom: Math.max(map.getZoom(), 14.5), padding: polster(), duration: 700 });
}

function zurListe() {
  ui.ansicht = 'liste';
  ui.ortId = null;
  allesZeichnen();
}

// ---------- Abstempeln ----------
function stempeln(id) {
  const v = ansicht(aktuell);
  const o = v.orte.find((x) => x.id === id);
  if (!o) return;
  if (o.check) {
    const alt = o.check;
    schreiben(aktuell, 'c:' + id, { ok: false, by: ich.id, at: Date.now() });
    sound.weg(); haptik('weg');
    toast(`Stempel bei „${o.n}“ entfernt`, 'Rückgängig', () => { schreiben(aktuell, 'c:' + id, alt); sound.zurueck(); haptik('leicht'); }, 4500);
    return;
  }
  const vorher = v.erledigt;
  schreiben(aktuell, 'c:' + id, { ok: true, by: ich.id, at: Date.now() });
  sound.stempel(); haptik('stempel');
  // Nach dem Neuzeichnen die Animation auf dem frischen Element abspielen
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll(`[data-stempel="${CSS.escape(id)}"]`).forEach((el) => {
      el.classList.add('knall');
      el.closest('.ort')?.classList.add('wackeln');
    });
  }));
  setTimeout(() => stempelErfolg(id, vorher), 480);
}

function stempelErfolg(id, vorher) {
  const v = ansicht(aktuell);
  const o = v.orte.find((x) => x.id === id);
  if (!o) return;
  const n = v.orte.length, e = v.erledigt;
  const marke = [[1, 'Alles gestempelt!', 'pokal'], [0.75, 'Fast geschafft!', 'funken'], [0.5, 'Halbzeit!', 'funken'], [0.25, 'Guter Start!', 'funken']]
    .find(([anteil]) => vorher / n < anteil && e / n >= anteil);
  const fertig = e === n && n > 1;
  // Vorschlag: nächster offener Ort in der Nähe
  const von = o.lat != null ? o : pos;
  const offen = v.orte.filter((x) => !x.check && x.lat != null);
  const naechster = von && offen.length ? offen.map((x) => [x, abstand(von, x)]).sort((a, b) => a[1] - b[1])[0] : null;
  erfolg({
    icon: marke ? marke[2] : 'haken',
    titel: marke ? marke[1] : 'Gestempelt!',
    text: fertig ? `Alle ${n} Orte von „${v.meta.n}“ – was für eine Reise!` : `${esc(o.n)} · ${e} von ${n} geschafft, noch ${n - e} offen.`,
    fortschritt: { von: vorher / n, auf: e / n, links: `${e} gestempelt`, rechts: `${Math.round((e / n) * 100)} %` },
    vorschlag: !fertig && naechster ? { o: naechster[0], weit: naechster[1] } : null,
    knopf: 'Weiter',
    feiern: !!marke,
  });
}

function konfetti() {
  const box = $('#konfetti');
  const farben = ['#ff5d1f', '#ff8a4c', '#ffffff', '#ffd2b8', '#3a3a40'];
  box.innerHTML = Array.from({ length: 70 }, () => {
    const x = Math.random() * 100, dx = (Math.random() - 0.5) * 240;
    return `<span style="left:${x}vw;background:${farben[Math.floor(Math.random() * farben.length)]};--x:${dx}px;--r:${Math.random() * 900 - 450}deg;--d:${2.2 + Math.random() * 1.6}s;animation-delay:${Math.random() * 0.5}s"></span>`;
  }).join('');
  setTimeout(() => { box.innerHTML = ''; }, 4500);
}

// Erfolgs-Screen im Stil der Vorlage
function erfolg({ icon: ic = 'haken', titel, text, fortschritt, vorschlag, knopf = 'Weiter', aktion, zweit, zweitAktion, feiern }) {
  const alt = $('#erfolg'); if (alt) alt.remove();
  const el = document.createElement('div');
  el.className = 'erfolg'; el.id = 'erfolg';
  el.innerHTML = `
    <div class="erfolg-hg"></div>
    <div class="erfolg-karte" role="dialog" aria-modal="true">
      <div class="erfolg-ico">${icon(ic, 44, 2.4)}</div>
      <h2>${esc(titel)}</h2>
      <p class="unter">${text}</p>
      ${fortschritt ? `<div class="erfolg-balken" style="--von:${fortschritt.von};--auf:${fortschritt.auf}"><i></i></div>
        <div class="erfolg-zahlen"><span>${esc(fortschritt.links)}</span><span>${esc(fortschritt.rechts)}</span></div>` : ''}
      ${vorschlag ? `<button class="vorschlag" data-naechster="${esc(vorschlag.o.id)}" style="width:100%">
        <div class="eyebrow">Als Nächstes in der Nähe</div>
        <div class="vorschlag-zeile"><span class="t-ico">${katIcon(vorschlag.o.k, 20)}</span>
          <span style="flex:1;min-width:0"><b>${esc(vorschlag.o.n)}</b><small>${meter(vorschlag.weit)} entfernt</small></span>${pfeilRechts()}</div>
      </button>` : ''}
      <button class="knopf orange voll mit-ico" data-weiter><span class="ico-kreis">${icon(ic === 'pokal' ? 'pokal' : 'haken', 20, 2.4)}</span>${esc(knopf)}<span class="pfeil-rechts">${pfeilRechts()}</span></button>
      ${zweit ? `<button class="knopf leise voll" data-zweit style="margin-top:8px">${esc(zweit)}</button>` : ''}
    </div>`;
  document.body.appendChild(el);
  const zu = (fn) => { el.classList.add('weg'); setTimeout(() => el.remove(), 260); sound.tick(); if (fn) setTimeout(fn, 120); };
  el.querySelector('[data-weiter]').onclick = () => zu(aktion);
  el.querySelector('.erfolg-hg').onclick = () => zu();
  const z = el.querySelector('[data-zweit]'); if (z) z.onclick = () => zu(zweitAktion);
  const n = el.querySelector('[data-naechster]'); if (n) n.onclick = () => zu(() => detailOeffnen(n.dataset.naechster, true));
  if (feiern) { setTimeout(() => { sound.erfolg(); haptik('erfolg'); konfetti(); }, 150); }
}

// Klicks im Sheet
sheet.addEventListener('click', (e) => {
  const st = e.target.closest('[data-stempel]');
  if (st) { e.stopPropagation(); return stempeln(st.dataset.stempel); }
  const f = e.target.closest('[data-filter]');
  if (f) {
    if (ui.filter !== f.dataset.filter) { sound.tick(); haptik('leicht'); }
    ui.filter = f.dataset.filter;
    if (ui.filter === 'naehe' && !pos) ortungStarten(false);
    return allesZeichnen();
  }
  const a = e.target.closest('[data-aktion]');
  if (a) {
    const was = a.dataset.aktion;
    sound.tick();
    if (was === 'liste') return zurListe();
    if (was === 'hinzu') return hinzufuegenDialog();
    if (was === 'einladen') return einladenDialog();
    if (was === 'offline') return offlineKarte ? syncDialog() : karteHerunterladen();
    if (was === 'alle') { if (ui.snap === 'voll') sheetSetzen('mitte', false); return allesZeigen(); }
    if (was === 'menue') return ortMenue(ui.ortId);
    if (was === 'zentrieren') { const v = ansicht(aktuell); const o = v.orte.find((x) => x.id === ui.ortId); if (o) { if (ui.snap === 'voll') sheetSetzen('mitte', false); map.flyTo({ center: [o.lng, o.lat], zoom: 16, padding: polster(), duration: 900 }); } return; }
    return;
  }
  const karte = e.target.closest('.ort');
  if (karte) { sound.tick(); detailOeffnen(karte.dataset.id); }
});

// ---------- Modal ----------
let modalZu = null;
function modal(html, nachher) {
  const m = $('#modal');
  const k = $('#modalKarte');
  m.classList.remove('weg');
  k.innerHTML = `<button class="modal-zu" data-zu aria-label="Schließen">${icon('x', 18, 2.2)}</button>` + html;
  if (m.hidden) sound.auf();
  m.hidden = false;
  k.scrollTop = 0;
  modalZu = null;
  if (nachher) nachher(k);
  return k;
}
function modalSchliessen() {
  const m = $('#modal');
  if (m.hidden) return;
  m.classList.add('weg');
  setTimeout(() => { m.hidden = true; m.classList.remove('weg'); $('#modalKarte').innerHTML = ''; }, 240);
  if (modalZu) { const f = modalZu; modalZu = null; f(); }
}
$('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-zu]') && !$('#modalKarte').dataset.pflicht) modalSchliessen(); });

// ---------- Trips anlegen / beitreten ----------
async function tripAnlegen(nameText, emoji, vorlage) {
  const code = newCode();
  const id = await tripLaden(code);
  aktuell = id;
  tripListeSpeichern();
  sync.watch(id, trips.get(id).keys);
  schreiben(id, 'meta', { n: nameText, e: emoji || '🗺️', seit: Date.now() });
  mitgliedEintragen(id);
  if (vorlage) {
    vorlage.orte.forEach(([n, k, lat, lng, notiz], i) => {
      schreiben(id, 'p:' + zufall(8), { n, k, lat, lng, notiz, o: i });
    });
  }
  speichern(id, true);
  ui.ansicht = 'liste'; ui.filter = 'alle';
  allesZeichnen();
  setTimeout(() => allesZeigen(), 50);
  return id;
}

async function tripBeitreten(code) {
  const id = await tripLaden(code);
  const neu = !trips.get(id).data.records.meta;
  aktuell = id;
  tripListeSpeichern();
  sync.watch(id, trips.get(id).keys);
  mitgliedEintragen(id);
  speichern(id, true);
  ui.ansicht = 'liste'; ui.filter = 'alle';
  allesZeichnen();
  // Sobald Orte da sind: Karte ausrichten und begrüßen
  let n = 0;
  const warten = setInterval(() => {
    const v = ansicht(id);
    if ((v && v.meta && v.orte.length) || ++n > 60) {
      clearInterval(warten);
      if (!v || !v.orte.length) return;
      allesZeigen();
      if (neu) {
        sound.erfolg(); haptik('erfolg');
        erfolg({
          icon: 'leute', titel: 'Willkommen im Trip!',
          text: `„${esc(v.meta.n)}“ · ${v.orte.length} Orte · dabei: ${esc(v.leute.map((l) => l.n).join(', '))}`,
          knopf: offlineKarte ? 'Los geht’s' : `Karte offline speichern · ${REGION.mb} MB`,
          aktion: offlineKarte ? null : karteHerunterladen,
          zweit: offlineKarte ? null : 'Später',
        });
      }
    }
  }, 500);
  return id;
}

function mitgliedEintragen(id) {
  const t = trips.get(id);
  const alt = t && t.data.records['m:' + ich.id];
  if (!alt || alt.v.n !== ich.name || alt.v.c !== ich.farbe) schreiben(id, 'm:' + ich.id, { n: ich.name, c: ich.farbe });
}

function tripWechseln(id) {
  aktuell = id;
  tripListeSpeichern();
  ui.ansicht = 'liste'; ui.ortId = null; ui.filter = 'alle';
  allesZeichnen();
  allesZeigen();
}

function tripEntfernen(id) {
  sync.unwatch(id);
  trips.delete(id);
  LS.del('sp.trip.' + id);
  if (aktuell === id) aktuell = trips.size ? [...trips.keys()][0] : null;
  tripListeSpeichern();
  if (!aktuell) { allesZeichnen(); return willkommen(); }
  tripWechseln(aktuell);
}

// ---------- Dialoge ----------
function willkommen(einladung) {
  const k = modal(`
    <div class="willkommen">
      ${scheibe({ text: 'Stempelpass • Reisen • Abstempeln', inhalt: icon('haken', 30, 2.6), klasse: 'logo-scheibe gestempelt', attr: 'tabindex="-1" aria-hidden="true"' })}
      <h2>${einladung ? 'Du bist eingeladen!' : 'Stempelpass'}</h2>
      <p class="lead">${einladung ? 'Tritt dem Trip bei – dann seht ihr alle dieselbe Karte und dieselben Stempel.' : 'Eure Reiseziele auf einer Karte. Gemeinsam abstempeln – auch offline.'}</p>
      <label class="feld"><span>Wie heißt du?</span><input class="eingabe" id="wName" autocomplete="given-name" placeholder="z. B. Mama, Papa, Adam" value="${esc(ich.name)}"></label>
      ${einladung ? `
        <button class="knopf voll orange" id="wBeitreten">Trip beitreten</button>
      ` : `
        <button class="knopf voll orange mit-ico" id="wBangkok"><span class="ico-kreis" style="font-size:19px">🇹🇭</span>Bangkok-Trip anlegen<span class="pfeil-rechts">${pfeilRechts()}</span></button>
        <p class="klein" style="margin:8px 0 0">Mit allen 19 Zielen von eurem Zettel und eurem Hotel</p>
        <div class="oder">oder</div>
        <button class="knopf voll" id="wCode">${icon('code', 20)} Ich habe einen Einladungscode</button>
        <button class="knopf voll leise" id="wLeer" style="margin-top:8px">${icon('plus', 20)} Leeren Trip anlegen</button>
        ${istIOS && !istApp ? `<div class="ios-hinweis"><b>Tipp fürs iPhone:</b> Unten auf <b>Teilen</b> und dann <b>„Zum Home-Bildschirm“</b>. Danach die App vom Home-Bildschirm öffnen und dort den Code eingeben.</div>` : ''}
      `}
    </div>`);
  k.dataset.pflicht = '1';
  k.querySelector('.modal-zu').hidden = true;
  const nameNehmen = () => {
    const n = k.querySelector('#wName').value.trim();
    if (!n) { k.querySelector('#wName').focus(); toast('Bitte gib deinen Namen ein'); haptik('weg'); return false; }
    ich.name = n.slice(0, 24); LS.set('sp.ich', ich);
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
    return true;
  };
  const fertig = () => { delete k.dataset.pflicht; modalSchliessen(); };
  if (einladung) {
    k.querySelector('#wBeitreten').onclick = async () => { if (!nameNehmen()) return; fertig(); await tripBeitreten(einladung); toast('Beigetreten – lade Orte …'); };
  } else {
    k.querySelector('#wBangkok').onclick = async () => {
      if (!nameNehmen()) return;
      fertig();
      await tripAnlegen(BANGKOK.name, BANGKOK.emoji, BANGKOK);
      setTimeout(() => {
        sound.erfolg(); haptik('erfolg');
        erfolg({
          icon: 'funken', titel: 'Euer Trip ist bereit',
          text: `${BANGKOK.orte.length} Orte stehen auf der Karte. Hol jetzt die Familie dazu – dann seht ihr alle dieselben Stempel.`,
          knopf: 'Familie einladen', aktion: () => einladenDialog(), zweit: 'Später',
        });
      }, 700);
    };
    k.querySelector('#wCode').onclick = () => { if (!nameNehmen()) return; fertig(); codeDialog(); };
    k.querySelector('#wLeer').onclick = () => { if (!nameNehmen()) return; fertig(); neuerTripDialog(); };
  }
}

function codeDialog() {
  const k = modal(`
    <h2>Mit Code beitreten</h2>
    <p class="lead">Den Code bekommst du von jemandem, der den Trip schon hat (Einladen).</p>
    <label class="feld"><input class="eingabe code-eingabe" id="cCode" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16"></label>
    <div class="knopf-reihe">
      <button class="knopf voll orange" id="cOk">Beitreten</button>
      ${navigator.clipboard && navigator.clipboard.readText ? `<button class="knopf voll leise" id="cEinf">${icon('kopie', 19)} Aus Zwischenablage einfügen</button>` : ''}
    </div>`);
  if (!aktuell) modalZu = () => setTimeout(() => !aktuell && willkommen(), 260);
  const feld = k.querySelector('#cCode');
  const los = async () => {
    const c = normCode(feld.value);
    if (!c) { haptik('weg'); return toast('Der Code hat 12 Zeichen, z. B. AB3D-EF7H-JK9M'); }
    const vorher = trips.size;
    modalZu = null;
    modalSchliessen();
    const id = await tripBeitreten(c);
    toast(trips.size > vorher ? 'Beigetreten – lade Orte …' : 'Diesen Trip hast du schon');
    return id;
  };
  k.querySelector('#cOk').onclick = los;
  feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') los(); });
  const einf = k.querySelector('#cEinf');
  if (einf) einf.onclick = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const m = txt.match(/[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}/);
      if (m) feld.value = normCode(m[0]) || m[0]; else toast('Kein Code in der Zwischenablage');
    } catch { toast('Einfügen nicht erlaubt – bitte tippen'); }
  };
  setTimeout(() => feld.focus(), 350);
}

function neuerTripDialog() {
  const emojis = ['🏝️', '🏔️', '🏙️', '🇹🇭', '🇯🇵', '🇮🇹', '🇪🇸', '🇬🇷', '🇺🇸', '🇫🇷', '🇭🇷', '🚗', '⛺', '🎿'];
  let wahl = emojis[0];
  const k = modal(`
    <h2>Neuer Trip</h2>
    <p class="lead">Danach Orte hinzufügen – einzeln suchen, auf der Karte setzen oder eine ganze Liste einfügen.</p>
    <label class="feld"><span>Name</span><input class="eingabe" id="nName" placeholder="z. B. Japan 2027"></label>
    <label class="feld"><span>Symbol</span></label>
    <div class="kat-wahl" id="nEmo">${emojis.map((e, i) => `<button data-e="${e}" class="${i ? '' : 'an'}" style="font-size:20px;padding:0 10px">${e}</button>`).join('')}</div>
    <div class="knopf-reihe"><button class="knopf voll orange" id="nOk">Trip anlegen</button></div>`);
  if (!aktuell) modalZu = () => setTimeout(() => !aktuell && willkommen(), 260);
  k.querySelector('#nEmo').onclick = (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    wahl = b.dataset.e; sound.tick();
    k.querySelectorAll('#nEmo button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#nOk').onclick = async () => {
    const n = k.querySelector('#nName').value.trim();
    if (!n) return toast('Gib dem Trip einen Namen');
    modalZu = null;
    modalSchliessen();
    await tripAnlegen(n.slice(0, 40), wahl);
    sound.plopp();
    setTimeout(() => hinzufuegenDialog('liste'), 400);
  };
  setTimeout(() => k.querySelector('#nName').focus(), 350);
}

function tripMenue() {
  const zeilen = [...trips.entries()].map(([id]) => {
    const v = ansicht(id);
    const n = v.meta ? v.meta.n : 'Wird geladen…';
    return `<li class="${id === aktuell ? 'an' : ''}">
      <button class="wahl" data-wahl="${id}"><span class="t-emo">${esc(v.meta ? v.meta.e : '⏳')}</span>
        <span style="min-width:0"><b>${esc(n)}</b><small>${v.erledigt} von ${v.orte.length} gestempelt</small></span></button>
      <button class="weg" data-weg="${id}" aria-label="Vom Handy entfernen">${icon('muell', 19)}</button>
    </li>`;
  }).join('');
  const k = modal(`
    <h2>Deine Trips</h2>
    <p class="lead">Trips bleiben auf diesem Handy gespeichert, bis du sie hier entfernst.</p>
    <ul class="trip-liste">${zeilen}</ul>
    <button class="knopf voll orange" id="mEinladen">${icon('leute', 20)} Familie einladen</button>
    <div class="liste-knoepfe">
      <button id="mNeu">${icon('plus', 20)} Neuer Trip</button>
      <button id="mCode">${icon('code', 20)} Mit Code beitreten</button>
      <button id="mName">${icon('person', 20)} Dein Name<span class="wert">${esc(ich.name || '–')}</span></button>
      <button id="mTon">${icon(tonAn() ? 'ton' : 'tonAus', 20)} Töne<span class="wert">${tonAn() ? 'An' : 'Aus'}</span></button>
      <button id="mSync">${icon('sync', 20)} Sync & Offline-Karte<span class="wert">${offlineKarte ? 'Offline ✓' : 'nur online'}</span></button>
      ${installEvent ? `<button id="mInstall">${icon('wolke', 20)} Als App installieren</button>` : ''}
    </div>`);
  k.onclick = (e) => {
    const w = e.target.closest('[data-wahl]');
    if (w) { sound.tick(); modalSchliessen(); tripWechseln(w.dataset.wahl); return; }
    const weg = e.target.closest('[data-weg]');
    if (weg) {
      const v = ansicht(weg.dataset.weg);
      if (confirm(`„${v.meta ? v.meta.n : 'Trip'}“ von diesem Handy entfernen?\n\nBei den anderen bleibt er erhalten. Mit dem Code kannst du jederzeit wieder beitreten.`)) {
        sound.weg(); modalSchliessen();
        tripEntfernen(weg.dataset.weg);
      }
    }
  };
  k.querySelector('#mEinladen').onclick = () => einladenDialog();
  k.querySelector('#mNeu').onclick = () => neuerTripDialog();
  k.querySelector('#mCode').onclick = () => codeDialog();
  k.querySelector('#mName').onclick = () => nameDialog();
  k.querySelector('#mSync').onclick = () => syncDialog();
  k.querySelector('#mTon').onclick = (e) => {
    tonSetzen(!tonAn());
    const b = e.currentTarget;
    b.innerHTML = `${icon(tonAn() ? 'ton' : 'tonAus', 20)} Töne<span class="wert">${tonAn() ? 'An' : 'Aus'}</span>`;
    sound.tick(); haptik('leicht');
  };
  const inst = k.querySelector('#mInstall');
  if (inst) inst.onclick = async () => { modalSchliessen(); installEvent.prompt(); installEvent = null; };
}

function nameDialog() {
  const k = modal(`
    <h2>Dein Name</h2>
    <p class="lead">So sehen die anderen, wer etwas abgestempelt hat.</p>
    <label class="feld"><input class="eingabe" id="dName" value="${esc(ich.name)}"></label>
    <button class="knopf voll orange" id="dOk">Speichern</button>`);
  k.querySelector('#dOk').onclick = () => {
    const n = k.querySelector('#dName').value.trim();
    if (!n) return;
    ich.name = n.slice(0, 24); LS.set('sp.ich', ich);
    trips.forEach((_, id) => mitgliedEintragen(id));
    sound.plopp();
    modalSchliessen();
  };
}

function einladeLink(code) { return abs('./') + '#code=' + code; }

function einladenDialog() {
  const t = trips.get(aktuell);
  if (!t) return;
  const v = ansicht(aktuell);
  const link = einladeLink(t.code);
  let qrSvg = '';
  try { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); qrSvg = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch {}
  const k = modal(`
    <h2>Familie einladen</h2>
    <p class="lead">Scannen, Link schicken oder Code abtippen. Wer dabei ist, sieht alle Orte und Stempel live.</p>
    <div class="qr">${qrSvg}</div>
    <div class="code-gross">${esc(t.code)}</div>
    <p class="klein" style="text-align:center;margin:0">Code für „${esc(v.meta ? v.meta.n : 'Trip')}“</p>
    <div class="knopf-reihe">
      ${navigator.share ? `<button class="knopf voll orange" id="eTeilen">${icon('teilen', 20)} Link senden (WhatsApp …)</button>` : ''}
      <button class="knopf voll ${navigator.share ? 'leise' : 'orange'}" id="eKopie">${icon('kopie', 20)} Link kopieren</button>
    </div>
    <p class="klein" style="margin-top:14px">Am iPhone: Link in Safari öffnen, „Zum Home-Bildschirm“ wählen und in der App „Mit Code beitreten“ – der Code steht auch in der Nachricht. Wer den Code hat, kann mitplanen und abstempeln.</p>`);
  const text = `Komm in unseren Trip „${v.meta ? v.meta.n : ''}“ im Stempelpass! 🗺️\n${link}\n\nCode: ${t.code}`;
  const te = k.querySelector('#eTeilen');
  if (te) te.onclick = async () => { try { await navigator.share({ title: 'Stempelpass', text }); } catch {} };
  k.querySelector('#eKopie').onclick = async () => {
    try { await navigator.clipboard.writeText(text); sound.plopp(); haptik('leicht'); toast('Kopiert – jetzt in WhatsApp einfügen'); } catch { toast('Kopieren nicht möglich'); }
  };
}

function syncDialog() {
  const v = ansicht(aktuell);
  const mitglieder = v ? v.leute.map((l) => esc(l.n) + (l.id === ich.id ? ' (du)' : '')).join(', ') : '–';
  modal(`
    <h2>Sync & Offline</h2>
    <p class="lead">${sync.online ? 'Verbunden – Stempel kommen live bei allen an.' : 'Gerade offline. Alles wird auf dem Handy gespeichert und automatisch abgeglichen, sobald wieder Internet da ist.'}</p>
    <div class="info-zeile"><span>Sync-Server verbunden</span><span>${sync.online} von ${sync.relays.length}</span></div>
    <div class="info-zeile"><span>Noch nicht hochgeladen</span><span>${v ? v.ausstehend : 0}</span></div>
    <div class="info-zeile"><span>Offline-Karte Bangkok</span><span>${offlineKarte ? 'gespeichert ✓' : 'nicht gespeichert'}</span></div>
    <div class="info-zeile"><span>Dabei</span><span>${mitglieder || '–'}</span></div>
    <p class="klein" style="margin-top:14px">Eure Daten liegen Ende-zu-Ende-verschlüsselt auf mehreren öffentlichen Nostr-Relays. Ohne den Trip-Code kann niemand sie lesen.</p>
    ${offlineKarte ? '' : `<div class="knopf-reihe"><button class="knopf voll orange" id="sKarte">${icon('wolke', 20)} Offline-Karte laden (${REGION.mb} MB)</button></div>`}`,
  (k) => { const b = k.querySelector('#sKarte'); if (b) b.onclick = () => { modalSchliessen(); karteHerunterladen(); }; });
}

// ---------- Orte hinzufügen ----------
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
function katRaten(r) {
  const t = (r.type || '') + ' ' + (r.category || r.class || '') + ' ' + (r.name || '');
  if (/hotel|hostel|guest_house|motel|apartment|resort/i.test(t)) return 'hotel';
  if (/place_of_worship|temple|wat |^wat|church|mosque|shrine/i.test(t)) return 'tempel';
  if (/market|marketplace|bazaar/i.test(t)) return 'markt';
  if (/park|garden|nature|forest|beach/i.test(t)) return 'park';
  if (/mall|shop|department/i.test(t)) return 'shopping';
  if (/restaurant|food|cafe|fast_food/i.test(t)) return 'essen';
  if (/bar|pub|nightclub/i.test(t)) return 'bar';
  if (/museum|gallery|palace|castle|monument|memorial|ruins|historic/i.test(t)) return 'kultur';
  if (/viewpoint|tower|observation/i.test(t)) return 'aussicht';
  if (/pier|ferry|river|harbour|marina/i.test(t)) return 'wasser';
  if (/massage|spa/i.test(t)) return 'erholung';
  if (/suburb|neighbourhood|quarter/i.test(t)) return 'viertel';
  return 'sonst';
}

// Photon (komoot) ist fehlertolerant: findet "Marriott marquis queens park" und sogar "marriot marquis".
// Nominatim bleibt als Rückfallebene, falls Photon nicht erreichbar ist oder nichts findet.
const PHOTON = 'https://photon.komoot.io/api/';
async function suchenPhoton(q) {
  const c = map.getCenter();
  const p = new URLSearchParams({ q, limit: '10', lang: 'de', lat: c.lat.toFixed(4), lon: c.lng.toFixed(4) });
  const r = await fetch(PHOTON + '?' + p);
  if (!r.ok) throw new Error('Photon ' + r.status);
  return (await r.json()).features.filter((f) => f.properties.name || f.properties.street).map((f) => {
    const x = f.properties;
    const adresse = [x.street && (x.street + (x.housenumber ? ' ' + x.housenumber : '')), x.district, x.city, x.country].filter(Boolean).join(', ');
    return { n: x.name || x.street, ort: adresse, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], k: katRaten({ type: x.osm_value, category: x.osm_key, name: x.name }) };
  });
}

// Reihenfolge der Suche (Relevanz) beibehalten, nur weit entfernte Treffer (> ~300 km) nach hinten
function nachNaehe(liste) {
  const c = map.getCenter();
  const weit = (x) => Math.hypot(x.lat - c.lat, (x.lng - c.lng) * Math.cos(c.lat * Math.PI / 180)) > 3 ? 1 : 0;
  return liste.map((x, i) => [x, i]).sort((a, b) => weit(a[0]) - weit(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

async function suchen(q, beschraenkt) {
  try {
    const t = await suchenPhoton(q);
    if (t.length) return beschraenkt ? nachNaehe(t).slice(0, 1) : nachNaehe(t);
  } catch (e) { console.warn('Photon', e); }
  const b = map.getBounds();
  // Nominatim ist bei Apostrophen und Zusätzen streng: "Queen's Park" findet "Queen’s Park" nicht.
  // Darum nacheinander lockerere Varianten probieren, zuletzt mit weggelassenen Wörtern am Ende.
  const [kopf, ...rest] = q.split(',');
  const woerter = kopf.replace(/['’`´]s?\b/g, '').trim().split(/\s+/);
  const varianten = [q, q.replace(/'/g, '’'), [woerter.join(' '), ...rest].join(',')];
  for (let n = woerter.length - 1; n >= 2; n--) varianten.push([woerter.slice(0, n).join(' '), ...rest].join(','));
  for (const v of [...new Set(varianten)].slice(0, 6)) {
    const p = new URLSearchParams({ format: 'jsonv2', q: v, limit: '8', 'accept-language': 'de,en', viewbox: [b.getWest() - 1, b.getNorth() + 1, b.getEast() + 1, b.getSouth() - 1].join(',') });
    const r = await fetch(NOMINATIM + '?' + p);
    if (!r.ok) throw new Error('Suche fehlgeschlagen');
    const treffer = await r.json();
    if (treffer.length) {
      const liste = nachNaehe(treffer.map((x) => ({ n: x.name || x.display_name.split(',')[0], ort: x.display_name, lat: +x.lat, lng: +x.lon, k: katRaten(x) })));
      return beschraenkt ? liste.slice(0, 1) : liste;
    }
    await new Promise((res) => setTimeout(res, 1000)); // Nominatim: höchstens 1 Anfrage pro Sekunde
  }
  return [];
}

function koordinatenLesen(text) {
  const t = decodeURIComponent(text);
  const m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&](?:q|ll|query|destination|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || t.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function naechsteOrdnung() {
  const v = ansicht(aktuell);
  return v.orte.reduce((m, o) => Math.max(m, o.o ?? 0), -1) + 1;
}

function hinzufuegenDialog(tab = 'suchen') {
  const tabs = [['suchen', 'Suchen'], ['liste', 'Liste'], ['karte', 'Karte'], ['ohne', 'Ohne Ort']];
  const k = modal(`
    <h2>Ort hinzufügen</h2>
    <div class="segmente" id="hTabs" style="--n:4"><span class="schieber"></span>${tabs.map(([id, t]) => `<button data-tab="${id}">${t}</button>`).join('')}</div>
    <div id="hInhalt"></div>`);
  const inhalt = k.querySelector('#hInhalt');
  const zeigen = (t) => {
    const i = tabs.findIndex((x) => x[0] === t);
    k.querySelector('#hTabs').style.setProperty('--i', i);
    k.querySelectorAll('#hTabs button').forEach((b) => b.classList.toggle('an', b.dataset.tab === t));
    if (t === 'suchen') {
      inhalt.innerHTML = `
        <input class="eingabe" id="hSuche" type="search" placeholder="z. B. Wat Arun, Sky Bar, Khao San Road" enterkeyhint="search" autocomplete="off">
        <ul class="treffer" id="hTreffer"></ul>
        <p class="klein" id="hInfo" style="margin-top:10px">Sucht weltweit, Orte in der Nähe der Karte zuerst. Braucht Internet.</p>`;
      const feld = inhalt.querySelector('#hSuche');
      let timer, nr = 0, treffer = [];
      const los = async () => {
        const q = feld.value.trim();
        if (q.length < 3) return;
        const meine = ++nr;
        inhalt.querySelector('#hInfo').textContent = 'Suche …';
        try {
          treffer = await suchen(q);
          if (meine !== nr) return;
          inhalt.querySelector('#hInfo').textContent = treffer.length ? '' : 'Nichts gefunden. Anders schreiben oder auf der Karte setzen.';
          inhalt.querySelector('#hTreffer').innerHTML = treffer.map((r, i) => `<li><button data-i="${i}"><span class="t-ico">${katIcon(r.k, 20)}</span><span style="min-width:0"><b>${esc(r.n)}</b><small>${esc(r.ort)}</small></span></button></li>`).join('');
        } catch { inhalt.querySelector('#hInfo').textContent = navigator.onLine ? 'Suche gerade nicht erreichbar.' : 'Offline – Suche geht nur mit Internet. Du kannst den Ort aber auf der Karte setzen.'; }
      };
      feld.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(los, 650); });
      feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); los(); } });
      inhalt.querySelector('#hTreffer').onclick = (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        const r = treffer[+b.dataset.i];
        sound.tick();
        ortEditor({ n: r.n, k: r.k, lat: r.lat, lng: r.lng });
      };
      setTimeout(() => feld.focus(), 350);
    } else if (t === 'liste') {
      inhalt.innerHTML = `
        <p class="klein" style="margin-top:0">Eine Zeile pro Ort – wie auf eurem Zettel. Jeder Ort wird automatisch gesucht und auf die Karte gesetzt. Was nicht gefunden wird, kommt „ohne Ort“ in die Liste.</p>
        <textarea class="eingabe" id="lText" rows="7" placeholder="Wat Arun&#10;Grand Palace&#10;Lumpini Park"></textarea>
        <label class="feld" style="margin-top:10px"><span>Stadt / Land (hilft beim Finden)</span><input class="eingabe" id="lStadt" placeholder="z. B. Bangkok"></label>
        <button class="knopf voll orange" id="lOk">Alle hinzufügen</button>
        <div class="protokoll" id="lLog"></div>`;
      inhalt.querySelector('#lOk').onclick = async (e) => {
        const zeilen = inhalt.querySelector('#lText').value.split('\n').map((s) => s.replace(/^[\s•·\-*o]+/, '').trim()).filter(Boolean);
        if (!zeilen.length) return;
        const stadt = inhalt.querySelector('#lStadt').value.trim();
        const log = inhalt.querySelector('#lLog');
        e.target.disabled = true;
        let o = naechsteOrdnung();
        for (const z of zeilen) {
          let r = null;
          try { [r] = await suchen(stadt ? `${z}, ${stadt}` : z, true); } catch {}
          schreiben(aktuell, 'p:' + zufall(8), r ? { n: z, k: r.k, lat: r.lat, lng: r.lng, o: o++ } : { n: z, k: 'sonst', lat: null, lng: null, o: o++ });
          if (r) sound.plopp(); else sound.tick();
          log.insertAdjacentHTML('beforeend', `<div>${r ? '✓' : '–'} ${esc(z)}${r ? '' : ' <span class="klein">– ohne Ort, später bearbeiten</span>'}</div>`);
          log.scrollTop = log.scrollHeight;
          await new Promise((res) => setTimeout(res, 1100)); // Suchdienste schonen
        }
        e.target.disabled = false;
        e.target.textContent = 'Fertig – schließen';
        e.target.onclick = () => { modalSchliessen(); allesZeigen(); };
      };
    } else if (t === 'karte') {
      inhalt.innerHTML = `
        <button class="knopf voll orange" id="kSetzen">${icon('sonst', 20)} Punkt auf der Karte setzen</button>
        <p class="klein">Tipp: Du kannst auch einfach lange auf die Karte drücken.</p>
        <label class="feld" style="margin-top:16px"><span>Google-Maps-Link oder Koordinaten</span><input class="eingabe" id="kLink" placeholder="https://www.google.com/maps/…@13.75,100.49"></label>
        <button class="knopf voll leise" id="kLinkOk">Übernehmen</button>
        <p class="klein">Kurze Links (maps.app.goo.gl) erst im Browser öffnen und dann die lange Adresse kopieren.</p>`;
      inhalt.querySelector('#kSetzen').onclick = () => { modalSchliessen(); auswahlStarten(); };
      inhalt.querySelector('#kLinkOk').onclick = () => {
        const p = koordinatenLesen(inhalt.querySelector('#kLink').value);
        if (!p) return toast('Keine Koordinaten im Link gefunden');
        const nm = (inhalt.querySelector('#kLink').value.match(/place\/([^/@]+)/) || [])[1];
        ortEditor({ ...p, n: nm ? decodeURIComponent(nm).replace(/\+/g, ' ') : '' });
      };
    } else {
      inhalt.innerHTML = `<p class="klein" style="margin-top:0">Für Dinge ohne festen Ort – z. B. „Massage“, „Food Tour“ oder „Mango Sticky Rice essen“.</p>`;
      ortEditor({ lat: null, lng: null }, inhalt);
    }
  };
  k.querySelector('#hTabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) { sound.tick(); zeigen(b.dataset.tab); } };
  zeigen(tab);
}

// Editor für neuen oder bestehenden Ort. ziel: optional Element, in das gerendert wird
function ortEditor(o, ziel) {
  const neu = !o.id;
  let katWahl = o.k || 'sonst';
  const html = `
    ${ziel ? '' : `<h2>${neu ? 'Neuer Ort' : 'Ort bearbeiten'}</h2>`}
    <label class="feld"><span>Name</span><input class="eingabe" id="oName" value="${esc(o.n || '')}" placeholder="Wie heißt der Ort?"></label>
    <label class="feld"><span>Art</span></label>
    <div class="kat-wahl" id="oKat">${Object.entries(KATEGORIEN).map(([k, c]) => `<button data-k="${k}" class="${k === katWahl ? 'an' : ''}">${icon(k, 17)}${esc(c.name)}</button>`).join('')}</div>
    <label class="feld" style="margin-top:14px"><span>Notiz</span><textarea class="eingabe" id="oNotiz" rows="3" placeholder="Öffnungszeiten, Tipps, wann hin …">${esc(o.notiz || '')}</textarea></label>
    ${o.lat != null ? `<p class="klein">${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}${neu ? '' : ' · <button class="chip-klein" id="oVerschieben">Position ändern</button>'}</p>` : ''}
    <div class="knopf-reihe">
      <button class="knopf voll orange" id="oOk">${neu ? 'Hinzufügen' : 'Speichern'}</button>
      ${neu ? '' : `<button class="knopf voll rot" id="oWeg">${icon('muell', 19)} Ort löschen</button>`}
    </div>`;
  const k = ziel || modal(html);
  if (ziel) ziel.insertAdjacentHTML('beforeend', html);
  let vorschau = null;
  if (o.lat != null && neu && !ziel) {
    const el = document.createElement('div');
    el.style.cssText = 'width:22px;height:22px;border-radius:50%;background:#ff5d1f;border:3px solid #fff;box-shadow:0 0 0 8px rgba(255,93,31,.25)';
    vorschau = new maplibregl.Marker({ element: el }).setLngLat([o.lng, o.lat]).addTo(map);
    map.easeTo({ center: [o.lng, o.lat], zoom: Math.max(map.getZoom(), 14), duration: 600, padding: { top: 60, bottom: innerHeight * 0.55, left: 0, right: 0 } });
    modalZu = () => vorschau && vorschau.remove();
  }
  k.querySelector('#oKat').onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    katWahl = b.dataset.k; sound.tick(); haptik('leicht');
    k.querySelectorAll('#oKat button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#oOk').onclick = () => {
    const n = k.querySelector('#oName').value.trim();
    if (!n) { haptik('weg'); return toast('Bitte einen Namen eingeben'); }
    const id = o.id || zufall(8);
    const alt = o.id ? trips.get(aktuell).data.records['p:' + id].v : {};
    schreiben(aktuell, 'p:' + id, { ...alt, n: n.slice(0, 80), k: katWahl, notiz: k.querySelector('#oNotiz').value.trim().slice(0, 1000), lat: o.lat ?? null, lng: o.lng ?? null, o: o.id ? alt.o : naechsteOrdnung() });
    modalSchliessen();
    if (vorschau) vorschau.remove();
    sound.plopp(); haptik('mittel');
    toast(neu ? `„${n}“ hinzugefügt` : 'Gespeichert');
    if (neu && o.lat != null) setTimeout(() => detailOeffnen(id), 250);
  };
  const weg = k.querySelector('#oWeg');
  if (weg) weg.onclick = () => { modalSchliessen(); ortLoeschen(o.id); };
  const versch = k.querySelector('#oVerschieben');
  if (versch) versch.onclick = () => { modalSchliessen(); auswahlStarten(o); };
  if (!ziel && neu && !o.n) setTimeout(() => k.querySelector('#oName').focus(), 350);
}

function ortLoeschen(id) {
  const rec = trips.get(aktuell).data.records['p:' + id];
  if (!rec) return;
  schreiben(aktuell, 'p:' + id, { ...rec.v, weg: true });
  sound.weg(); haptik('weg');
  if (ui.ortId === id) zurListe();
  toast(`„${rec.v.n}“ gelöscht`, 'Rückgängig', () => { schreiben(aktuell, 'p:' + id, { ...rec.v, weg: false }); sound.zurueck(); haptik('leicht'); }, 5000);
}

// Menü nach langem Drücken auf einen Ort (Liste oder Pin)
function ortMenue(id) {
  const v = ansicht(aktuell);
  const o = v && v.orte.find((x) => x.id === id);
  if (!o) return;
  const k = modal(`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:18px;padding-right:40px">
      <div class="ort-ico" style="width:56px;height:56px;border-radius:18px">${katIcon(o.k, 26)}</div>
      <div style="min-width:0"><div class="eyebrow">Nr. ${o.nr} · ${esc(kat(o.k).name)}</div><h2 style="margin:2px 0 0;padding:0">${esc(o.n)}</h2></div>
    </div>
    <div class="knopf-reihe" style="margin-top:0">
      <button class="knopf voll ${o.check ? 'leise' : 'orange'}" id="mStempel">${icon('haken', 20, 2.4)} ${o.check ? 'Stempel entfernen' : 'Abstempeln'}</button>
      <button class="knopf voll" id="mBearbeiten">${icon('stift', 19)} Bearbeiten</button>
      <button class="knopf voll rot" id="mLoeschen">${icon('muell', 19)} Ort löschen</button>
    </div>`);
  k.querySelector('#mLoeschen').onclick = () => { modalSchliessen(); ortLoeschen(id); };
  k.querySelector('#mStempel').onclick = () => { modalSchliessen(); stempeln(id); };
  k.querySelector('#mBearbeiten').onclick = () => ortEditor(o);
}

// Langes Drücken (Finger ~0,5 s) bzw. Rechtsklick auf Ortskarten in der Liste
let langGedrueckt = 0;
function langDrueckbar(selektor, fn) {
  let timer = null, start = null, el = null;
  const ab = () => { clearTimeout(timer); timer = null; if (el) el.classList.remove('gedrueckt'); el = null; };
  document.addEventListener('pointerdown', (e) => {
    const ziel = e.target.closest(selektor);
    if (!ziel || e.button > 0 || e.target.closest('[data-stempel]')) return;
    ab();
    el = ziel; start = { x: e.clientX, y: e.clientY };
    el.classList.add('gedrueckt');
    timer = setTimeout(() => {
      const id = el.dataset.id;
      ab();
      langGedrueckt = Date.now();
      haptik('mittel'); sound.tick();
      fn(id);
    }, 520);
  });
  document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) ab(); });
  ['pointerup', 'pointercancel', 'scroll'].forEach((t) => document.addEventListener(t, () => { if (timer) ab(); }, true));
  document.addEventListener('contextmenu', (e) => {
    const ziel = e.target.closest(selektor);
    if (!ziel) return;
    e.preventDefault();
    if (Date.now() - langGedrueckt < 1200) return; // am Handy schon über den Timer ausgelöst
    langGedrueckt = Date.now();
    fn(ziel.dataset.id);
  });
  // Den Klick nach dem Loslassen schlucken, sonst öffnet sich zusätzlich die Detailansicht
  document.addEventListener('click', (e) => { if (Date.now() - langGedrueckt < 800 && e.target.closest(selektor)) { e.stopPropagation(); e.preventDefault(); } }, true);
}
langDrueckbar('.ort', ortMenue);

// Punkt in der Kartenmitte wählen
let auswahlAktiv = false;
function auswahlStarten(bestehend) {
  auswahlAktiv = true;
  $('#auswahl').hidden = false;
  const vorher = ui.snap;
  sheetSetzen('zu', false);
  sheet.style.visibility = 'hidden';
  if (map) map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  if (bestehend && bestehend.lat != null) map.easeTo({ center: [bestehend.lng, bestehend.lat], zoom: 16 });
  const ende = () => { auswahlAktiv = false; $('#auswahl').hidden = true; sheet.style.visibility = ''; sheetSetzen(vorher); };
  $('#auswahlAbbruch').onclick = () => { sound.tick(); ende(); };
  $('#auswahlOk').onclick = () => {
    const c = map.getCenter();
    ende();
    haptik('mittel');
    if (bestehend) {
      const rec = trips.get(aktuell).data.records['p:' + bestehend.id];
      schreiben(aktuell, 'p:' + bestehend.id, { ...rec.v, lat: c.lat, lng: c.lng });
      sound.plopp();
      toast('Position geändert');
    } else ortEditor({ lat: c.lat, lng: c.lng });
  };
}

// ---------- Offline-Karte ----------
let laedt = false;
let ladeAnteil = 0;

async function karteHerunterladen() {
  if (laedt || offlineKarte) return;
  if (!navigator.onLine) return toast('Dafür braucht es Internet – am besten WLAN');
  laedt = true; ladeAnteil = 0;
  toast('Offline-Karte wird gespeichert …');
  neuZeichnen();
  let zuletzt = 0;
  try {
    try { await navigator.storage.persist(); } catch {}
    const res = await fetch(abs(REGION.datei), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const gesamt = +res.headers.get('content-length') || REGION.mb * 1e6;
    const leser = res.body.getReader();
    const teile = [];
    let da = 0;
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      teile.push(value); da += value.length;
      ladeAnteil = Math.min(1, da / gesamt);
      if (ladeAnteil - zuletzt > 0.02) { zuletzt = ladeAnteil; if (ui.ansicht === 'liste') neuZeichnen(); }
    }
    const blob = new Blob(teile, { type: 'application/octet-stream' });
    const c = await caches.open(KARTEN_CACHE);
    await c.put(abs(REGION.datei), new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }));
    // Ab sofort aus dem Speicher lesen statt aus dem Netz
    protokoll.add(new pmtiles.PMTiles(new pmtiles.FileSource(new File([blob], REGION.name))));
    const quelle = map.getSource('protomaps');
    if (quelle && quelle.setUrl) quelle.setUrl('pmtiles://' + REGION.name);
    offlineKarte = true;
    laedt = false;
    neuZeichnen();
    sound.erfolg(); haptik('erfolg');
    erfolg({ icon: 'wolkeOk', titel: 'Offline bereit', text: 'Die Karte von Bangkok bis Ayutthaya liegt jetzt auf deinem Handy – sie funktioniert auch ganz ohne Internet.', knopf: 'Super' });
  } catch (e) {
    console.warn(e);
    laedt = false;
    neuZeichnen();
    toast('Download abgebrochen – später nochmal versuchen');
  }
}

// ---------- Installation ----------
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

// ---------- Start ----------
$('#tripKnopf').onclick = () => { sound.tick(); aktuell ? tripMenue() : willkommen(); };
$('#syncKnopf').onclick = () => { sound.tick(); syncDialog(); };
$('#ortungKnopf').onclick = () => { sound.tick(); haptik('leicht'); ortungStarten(true); };
addEventListener('online', () => { osmUmschalten(); syncAnzeige(); });
addEventListener('offline', () => { osmUmschalten(); syncAnzeige(); });

// Änderungen aus anderen Tabs desselben Geräts übernehmen
addEventListener('storage', (e) => {
  if (!e.key || !e.key.startsWith('sp.trip.')) return;
  const id = e.key.slice(8);
  const t = trips.get(id);
  if (t && e.newValue) { try { t.data = JSON.parse(e.newValue); if (id === aktuell) neuZeichnen(); } catch {} }
});

async function start() {
  for (const code of LS.get('sp.trips', [])) { try { await tripLaden(code); } catch (e) { console.warn(e); } }
  if (aktuell && !trips.has(aktuell)) aktuell = null;
  if (!aktuell && trips.size) aktuell = [...trips.keys()][0];
  sheetZiehen();
  await karteStarten();
  sheetSetzen('mitte', false);
  map.once('load', () => allesZeigen(false));
  allesZeichnen();
  sync.start();

  // Einladungslink: #code=XXXX-XXXX-XXXX
  const m = location.hash.match(/code=([A-Za-z0-9-]+)/);
  if (m) history.replaceState(null, '', location.pathname + location.search);
  const einladung = m && normCode(m[1]);
  if (einladung) {
    const keys = await deriveKeys(einladung);
    if (trips.has(keys.id)) { tripWechseln(keys.id); toast('Diesen Trip hast du schon'); }
    else if (ich.name) { await tripBeitreten(einladung); toast('Beigetreten – lade Orte …'); }
    else willkommen(einladung);
  } else if (!aktuell) willkommen();

  trips.forEach((_, id) => mitgliedEintragen(id));
  if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') ortungStarten(false); }).catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /[?&]sw=1/.test(location.search))) {
    // Neue Version aktiv: einmal neu laden, damit sie sofort gilt (nicht beim allerersten Besuch)
    const hatteSW = !!navigator.serviceWorker.controller;
    let neuGeladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hatteSW || neuGeladen || !$('#modal').hidden || $('#erfolg')) return;
      neuGeladen = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

start();

// Für Tests in der Konsole
window.sp = { trips, sync, ansicht: () => ansicht(aktuell), ich, get map() { return map; } };
