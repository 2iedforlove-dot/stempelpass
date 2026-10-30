import { Sync, deriveKeys, newCode, normCode } from './sync.js';
import { KATEGORIEN, BANGKOK, bildFuerOrt, bildFuerTrip, zeitFuerOrt, uebersetzterOrt, wikiFuerOrt } from './vorlagen.js';
import { zieleSuchen, zielInfo, sehenswuerdigkeiten } from './ziele.js';
import { guideLaden, Sprecher, stimmenFuer, stimmQualitaet } from './audioguide.js';
import { stempi, stimmung, stempiLeben } from './maskottchen.js';
import { konfetti as partikelKonfetti, spritzer, glitzer } from './partikel.js';
import { stufe, stufenName, seltenheit, bestenliste } from './belohnung.js';
import { vorliebenHtml, vorliebenKlick, nachInteressen, passtZu, interessenText, orteProTag } from './vorlieben.js';
import { routeHolen, schaetzung, schrittIcon, schrittText, googleRoute } from './route.js';
import { autoPlan, routeUrl, tageAnzahl, datumVonTag } from './planer.js';
import { fotoVerkleinern, inStuecke, idbSetzen, idbHolen, idbLoeschenPraefix, fotoUrl } from './tagebuch.js';
import { hinweiseFuer } from './hinweise.js';
import { starteRueckblick } from './rueckblick.js';
import { icon, PFADE } from './icons.js';
import { sound, haptik, tonAn, tonSetzen } from './feedback.js';
import { t, setzeSprache, loc } from './i18n.js';
import { starteOnboarding } from './onboarding.js';

const maplibregl = window.maplibregl;
const pmtiles = window.pmtiles;
const basemaps = window.basemaps;

// Offline-Karte: Ausschnitt aus Protomaps (OpenStreetMap), Bangkok bis Ayutthaya
const REGION = { datei: 'karte/bangkok.pmtiles', name: 'bangkok.pmtiles', bbox: [99.85, 13.45, 100.75, 14.45], mb: 64 };
const KARTEN_CACHE = 'sp-karte';
const FARBEN = ['#ff6b3d', '#30c25a', '#8e6cf0', '#0a84ff', '#ff2d78', '#e3a21a', '#19a7c4'];
const AKZENTE = {
  orange: ['#ff8a4c', '#ff5d1f', '#e8420c'],
  pink: ['#ff6ba8', '#ff2d78', '#d6125a'],
  lila: ['#d08bff', '#bf5af2', '#8e3fd0'],
  blau: ['#5ab0ff', '#0a84ff', '#0060d0'],
  gruen: ['#5be08a', '#2fbf5a', '#1f9a43'],
};
// Farbverläufe für Reisen ohne Titelbild
const VERLAEUFE = [['#0a84ff', '#5e5ce6'], ['#ff2d78', '#ff9f0a'], ['#30d158', '#0a84ff'], ['#bf5af2', '#ff2d78'], ['#ff9f0a', '#ff453a'], ['#64d2ff', '#5e5ce6']];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const abs = (p) => new URL(p, location.href).href;
const zufall = (n = 10) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b & 31]).join('');
const istIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const istApp = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// Nur lateinische Schrift? (Thai-Adressen aus den Suchdiensten blenden wir aus)
const latein = (s) => !/[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u20A0-\u20CF\u2100-\u214F]/.test(String(s || ''));
const flagge = (cc) => cc ? String(cc).toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))) : '';

// ---------- Speicher ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('Speichern fehlgeschlagen', e); } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

const ich = Object.assign(
  { id: zufall(8), name: '', farbe: FARBEN[Math.floor(Math.random() * FARBEN.length)], design: 'auto', akzent: 'orange', sprache: 'de', heimat: null, vibration: true, eingerichtet: false,
    interessen: [], tempo: 'ausgewogen', stimmen: {}, schritte: {} },
  LS.get('sp.ich', {}),
);
const ichSpeichern = () => LS.set('sp.ich', ich);
ichSpeichern();
setzeSprache(ich.sprache);
// Zum Testen auf Geräten mit "Bewegung reduzieren": ?bewegung=an zeigt trotzdem alle Animationen
if (/[?&]bewegung=an\b/.test(location.search)) document.documentElement.dataset.bewegung = 'an';
const schrittErledigt = (k) => { if (!ich.schritte[k]) { ich.schritte = { ...ich.schritte, [k]: true }; ichSpeichern(); } };

const trips = new Map(); // id -> { code, keys, data }
let aktuell = LS.get('sp.aktuell', null);
const ui = { tab: 'reisen', stapel: { reisen: [{ s: 'home' }], karte: [{ s: 'karte' }], profil: [{ s: 'profil' }] }, filter: 'alle', kartenOrt: null, reiseAnsicht: 'orte', planTag: 1, kartenTag: null };
let pos = null; // {lat, lng, genau}

const speicherTimer = new Map();
// Fotostücke (fb:…) liegen in IndexedDB; im localStorage bleibt nur ein Platzhalter, sonst wären die 5 MB schnell voll
const inIdb = new Map(); // "tripId|key" -> t
function speichern(id, sofort) {
  clearTimeout(speicherTimer.get(id));
  const tun = () => {
    const tr = trips.get(id);
    if (!tr) return;
    const records = {};
    for (const [k, rec] of Object.entries(tr.data.records)) {
      if (!k.startsWith('fb:')) { records[k] = rec; continue; }
      const sk = id + '|' + k;
      if (rec.v && rec.v.d && inIdb.get(sk) !== rec.t) { inIdb.set(sk, rec.t); idbSetzen(sk, rec.v.d).catch((e) => console.warn('IDB', e)); }
      records[k] = { ...rec, v: { ...rec.v, d: null, idb: !!(rec.v && rec.v.d) }, ev: undefined };
    }
    LS.set('sp.trip.' + id, { ...tr.data, records });
  };
  if (sofort) tun(); else speicherTimer.set(id, setTimeout(tun, 300));
}
addEventListener('pagehide', () => trips.forEach((_, id) => speichern(id, true)));

function tripListeSpeichern() {
  LS.set('sp.trips', [...trips.values()].map((tr) => tr.code));
  LS.set('sp.aktuell', aktuell);
}

async function tripLaden(code) {
  const keys = await deriveKeys(code);
  if (trips.has(keys.id)) return keys.id;
  const data = LS.get('sp.trip.' + keys.id, null) || { records: {}, synced: {} };
  trips.set(keys.id, { code, keys, data });
  // Fotostücke aus IndexedDB zurückholen (vor dem Sync, damit nichts Leeres hochgeladen wird)
  await Promise.all(Object.entries(data.records).filter(([k, rec]) => k.startsWith('fb:') && rec.v && rec.v.idb).map(async ([k, rec]) => {
    try { const d = await idbHolen(keys.id + '|' + k); if (d) { rec.v.d = d; inIdb.set(keys.id + '|' + k, rec.t); } } catch {}
  }));
  return keys.id;
}

// ---------- Datensätze ----------
function schreiben(tripId, key, v) {
  const tr = trips.get(tripId);
  if (!tr) return;
  const alt = tr.data.records[key];
  const zeit = Math.max(Date.now(), alt ? alt.t + 1 : 0);
  tr.data.records[key] = { v, t: zeit, by: ich.id, ca: alt ? alt.ca : 0 };
  speichern(tripId);
  sync.publish(tripId, key);
  neuZeichnen();
}

function ansicht(tripId) {
  const tr = trips.get(tripId);
  if (!tr) return null;
  const r = tr.data.records;
  const meta = r.meta ? r.meta.v : null;
  const orte = [];
  const leute = [];
  const eintraege = [];
  for (const [k, rec] of Object.entries(r)) {
    if (k.startsWith('p:') && rec.v && !rec.v.weg) {
      const id = k.slice(2);
      const c = r['c:' + id];
      const u = uebersetzterOrt(rec.v.nl && rec.v.nl[ich.sprache] ? rec.v.nl[ich.sprache] : rec.v.n, rec.v.notiz, ich.sprache);
      orte.push({ id, ...rec.v, orig: rec.v.n, origNotiz: rec.v.notiz, n: u.n, notiz: u.notiz, check: c && c.v && c.v.ok ? c.v : null });
    } else if (k.startsWith('m:') && rec.v) {
      leute.push({ id: k.slice(2), ...rec.v });
    } else if (k.startsWith('f:') && rec.v && !rec.v.weg) {
      eintraege.push({ id: k.slice(2), ...rec.v });
    }
  }
  eintraege.sort((a, b) => b.at - a.at);
  orte.sort((a, b) => (a.o ?? 1e9) - (b.o ?? 1e9) || String(a.n).localeCompare(b.n));
  orte.forEach((o, i) => { o.nr = i + 1; });
  const erledigt = orte.filter((o) => o.check).length;
  const ausstehend = Object.entries(r).filter(([k, rec]) => (tr.data.synced[k] || 0) < rec.t).length;
  return { id: tripId, tr, meta, orte, leute, erledigt, ausstehend, eintraege };
}

function name(v, id) {
  if (id === ich.id) return t('dir');
  const m = v.leute.find((l) => l.id === id);
  return m ? m.n : t('jemandem');
}

// ---------- Sync ----------
const sync = new Sync({
  getTrips: () => trips,
  onRemote: (tripId) => { speichern(tripId); neuZeichnen(); },
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
const meter = (m) => m == null ? '' : m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toLocaleString(loc(), { maximumFractionDigits: m < 10000 ? 1 : 0 }) + ' km';
const wann = (ms) => {
  const d = new Date(ms), heute = new Date();
  const uhr = d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === heute.toDateString()) return t('heute {uhr}', { uhr });
  return d.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + uhr;
};
const uhrIn = (tz) => { try { return new Date().toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch { return ''; } };
const kat = (k) => { const id = KATEGORIEN[k] ? k : 'sonst'; return { id, farbe: KATEGORIEN[id].farbe, name: t(KATEGORIEN[id].name) }; };
const katKachel = (k, g = 20, cls = 't-ico') => `<span class="${cls}" style="background:${kat(k).farbe}">${icon(kat(k).id, g)}</span>`;
const pfeilRechts = (g = 18) => icon('zurueck', g, 2.4).replace('class="ic"', 'class="ic" style="transform:rotate(180deg)"');
const fuehlen = (art) => { if (ich.vibration !== false) haptik(art); };
const verlauf = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; const [a, b] = VERLAEUFE[h % VERLAEUFE.length]; return `linear-gradient(140deg, ${a}, ${b})`; };

// Vorschaubild eines Orts: Foto oder farbiges Kategorie-Icon
function ortBild(o, nr = true) {
  const b = bildFuerOrt(o, 'klein');
  const n = nr ? `<span class="nr">${o.nr}</span>` : '';
  return b ? `<div class="ort-bild"><img src="${b}" alt="" width="60" height="60" loading="lazy" decoding="async">${n}</div>` : `<div class="ort-ico" style="background:${kat(o.k).farbe}">${icon(kat(o.k).id, 26)}${n}</div>`;
}

function seiteHg(bild) {
  return `<div class="seite-hg ${bild ? '' : 'ohne-bild'}" aria-hidden="true">${bild ? `<img src="${bild}" alt="">` : ''}<div class="aura"><i></i><i></i><i></i></div><div class="hg-tint"></div></div>`;
}

function toast(text, aktion, fn, dauer = 3200) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${aktion ? `<button>${esc(aktion)}</button>` : ''}`;
  if (aktion) el.querySelector('button').onclick = () => { el.classList.remove('zeigen'); fn(); };
  el.classList.add('zeigen');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('zeigen'), dauer);
}

// Runde Scheibe mit umlaufender Schrift
function scheibe({ text, inhalt, klasse = '', attr = '' }) {
  let h = 0; for (const c of text + klasse) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const id = 'rk' + h.toString(36);
  const tx = (text + ' • ').repeat(Math.max(1, Math.ceil(36 / (text.length + 3))));
  return `<button class="scheibe ${klasse}" ${attr}>
    <svg class="ring-text" viewBox="0 0 100 100" aria-hidden="true"><defs><path id="${id}" d="M50,50 m-40.5,0 a40.5,40.5 0 1,1 81,0 a40.5,40.5 0 1,1 -81,0"/></defs>
      <text><textPath href="#${id}" textLength="252" lengthAdjust="spacing">${esc(tx.toUpperCase())}</textPath></text></svg>
    <span class="mitte">${inhalt}</span>
  </button>`;
}

// ---------- Design: hell/dunkel, Akzentfarbe ----------
const dunkelMedia = matchMedia('(prefers-color-scheme: dark)');
const istHell = () => ich.design === 'hell' || (ich.design === 'auto' && !dunkelMedia.matches);
function designAnwenden() {
  const hell = istHell();
  const r = document.documentElement;
  r.dataset.design = hell ? 'hell' : 'dunkel';
  const [a2, a, a3] = AKZENTE[ich.akzent] || AKZENTE.orange;
  r.style.setProperty('--akzent', a);
  r.style.setProperty('--akzent-2', a2);
  r.style.setProperty('--akzent-verlauf', `linear-gradient(135deg, ${a2} 0%, ${a} 45%, ${a3} 100%)`);
  document.querySelector('meta[name="theme-color"]').content = hell ? '#eef0f5' : '#0a0a0c';
  if (map && kartenHell !== hell) { kartenHell = hell; karteNeuStylen(); }
  neuZeichnen();
}
dunkelMedia.addEventListener('change', () => { if (ich.design === 'auto') designAnwenden(); });
const akzentFarbe = () => (AKZENTE[ich.akzent] || AKZENTE.orange)[1];

// ---------- Karte ----------
const protokoll = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protokoll.tile);
let offlineKarte = false;
let kartenUrl = null;
let kartenHell = null;

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

function kartenStil(url, hell) {
  const f = basemaps.namedFlavor(hell ? 'light' : 'dark');
  if (hell) {
    Object.assign(f, {
      background: '#eceef3', earth: '#f1f2f6', water: '#a9d4f5', park_a: '#d5ecd0', park_b: '#c2e5ba', wood_a: '#d5ecd0', wood_b: '#c2e5ba',
      buildings: '#e2e4ea', other: '#ffffff', minor_a: '#ffffff', minor_b: '#ffffff', major: '#ffffff', highway: '#ffe2b8', city_label: '#3c3c46',
    });
  } else {
    Object.assign(f, {
      background: '#161618', earth: '#1c1c1f', water: '#0f1820', park_a: '#1b2620', park_b: '#1e2c24', wood_a: '#1b2620', wood_b: '#1e2c24',
      scrub_a: '#1d2220', scrub_b: '#1f2623', buildings: '#252528', other: '#2a2a2e', minor_a: '#2c2c30', minor_b: '#2c2c30', minor_service: '#28282c',
      major: '#36363b', highway: '#45403b', bridges_major: '#36363b', bridges_highway: '#45403b', city_label: '#a1a1a8', subplace_label: '#6f6f77',
      roads_label_major: '#77777f', roads_label_minor: '#5f5f66', roads_label_major_halo: '#161618', roads_label_minor_halo: '#161618',
      city_label_halo: '#161618', subplace_label_halo: '#161618', ocean_label: '#4a5a66',
    });
  }
  // Ohne die bunten Karten-POIs: nur eure Orte sollen auffallen
  // Beschriftung englisch: in Bangkok haben fast nur englische Namen eine lateinische Schrift
  const schichten = basemaps.layers('protomaps', f, { lang: 'en' }).filter((l) => l.id !== 'background' && l.id !== 'pois');
  // Statt zweizeilig "Englisch + Thai": Name in der gewählten Sprache, sonst Englisch; Namen in fremder Schrift (script gesetzt) ausblenden
  const nameAusdruck = ['coalesce', ['get', 'name:' + ich.sprache], ['get', 'name:en'], ['case', ['has', 'script'], '', ['get', 'name']]];
  for (const l of schichten) if (l.layout && l.layout['text-field'] && JSON.stringify(l.layout['text-field']).includes('"name')) l.layout['text-field'] = nameAusdruck;
  const grund = hell ? '#eceef3' : '#161618';
  return {
    version: 8,
    glyphs: abs('karte/fonts/') + '{fontstack}/{range}.pbf',
    sprite: abs('karte/sprites/' + (hell ? 'light' : 'dark')),
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' },
      protomaps: { type: 'vector', url, attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    layers: [
      { id: 'grund', type: 'background', paint: { 'background-color': grund } },
      { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: hell ? { 'raster-saturation': -0.4 } : { 'raster-saturation': -1, 'raster-brightness-max': 0.35 } },
      ...schichten,
    ],
  };
}

const imGebiet = (lng, lat) => lng > REGION.bbox[0] && lng < REGION.bbox[2] && lat > REGION.bbox[1] && lat < REGION.bbox[3];

let map;
let karteBereit = false;

async function karteStarten() {
  kartenUrl = await kartenQuelle();
  kartenHell = istHell();
  map = new maplibregl.Map({
    container: 'map',
    style: kartenStil(kartenUrl, kartenHell),
    center: [100.53, 13.74], zoom: 11.3, minZoom: 3, maxZoom: 18.5,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.on('moveend', osmUmschalten);
  map.on('style.load', () => { osmUmschalten(); ebenenAnlegen(); karteBereit = true; pinSchluessel = ''; routeSchluessel = ''; pinsZeichnen(); ichZeichnen(); wegZeichnen(); });
  map.on('click', (e) => {
    if (auswahlAktiv || Date.now() - langGedrueckt < 800) return;
    const id = pinBei(e.point);
    if (id) { sound.tick(); fuehlen('leicht'); kartenOrtWaehlen(id, true); }
  });
  map.on('mousemove', (e) => { map.getCanvas().style.cursor = pinBei(e.point) ? 'pointer' : ''; });
  map.on('contextmenu', (e) => {
    const id = pinBei(e.point);
    if (id) { langGedrueckt = Date.now(); ortMenue(id); } else langDruck(e.lngLat);
  });
  langDruckErkennen();
}

function karteNeuStylen() {
  karteBereit = false;
  map.setStyle(kartenStil(kartenUrl, kartenHell), { diff: false });
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
  map.addSource('weg', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'weg-rand', type: 'line', source: 'weg', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 } });
  map.addLayer({ id: 'weg', type: 'line', source: 'weg', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': akzentFarbe(), 'line-width': 5 } });
  map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'route-rand', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 } });
  map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': akzentFarbe(), 'line-width': 4, 'line-dasharray': [1.2, 1.6] } });
  map.addLayer({ id: 'ich-hof', type: 'circle', source: 'ich', paint: { 'circle-radius': 18, 'circle-color': '#0a84ff', 'circle-opacity': 0.18 } });
  map.addLayer({ id: 'ich-punkt', type: 'circle', source: 'ich', paint: { 'circle-radius': 7, 'circle-color': '#0a84ff', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
  const hell = kartenHell;
  map.addLayer({
    id: 'orte-namen', type: 'symbol', source: 'orte', minzoom: 13.5,
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-anchor': 'top', 'text-offset': [0, 0.35], 'text-max-width': 9, 'text-optional': true, 'symbol-sort-key': ['-', 10, ['get', 'sort']] },
    paint: { 'text-color': hell ? '#1c1c22' : '#f5f5f7', 'text-halo-color': hell ? 'rgba(255,255,255,.95)' : 'rgba(10,10,12,.9)', 'text-halo-width': 1.6, 'text-opacity': ['get', 'deckkraft'] },
  });
  map.addLayer({
    id: 'orte', type: 'symbol', source: 'orte',
    layout: { 'icon-image': ['get', 'bild'], 'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sort'], 'symbol-z-order': 'source' },
    paint: { 'icon-opacity': ['get', 'deckkraft'] },
  });
}

// Ein Pin-Bild pro Zustand, auf ein Canvas gezeichnet: offen = weiß mit farbigem Icon, gestempelt = farbig mit Haken
function pinBild(o, aktiv) {
  const k = kat(o.k);
  const name = `pin-${k.id}-${o.check ? 1 : 0}-${o.nr}-${aktiv ? 1 : 0}-${ich.akzent}`;
  if (map.hasImage(name)) return name;
  const s = aktiv ? 1.22 : 1, pr = 2;
  const W = 52 * s, H = 56 * s;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * pr); cv.height = Math.ceil(H * pr);
  const c = cv.getContext('2d');
  c.scale(pr * s, pr * s);
  const cx = 23, cy = 24, r = 18.5;
  c.save();
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = 8; c.shadowOffsetY = 3;
  c.beginPath();
  c.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 2.38);
  c.lineTo(cx, 54);
  c.closePath();
  c.fillStyle = o.check ? k.farbe : '#ffffff';
  c.fill();
  c.restore();
  c.lineWidth = aktiv ? 3 : 1.2;
  c.strokeStyle = aktiv ? akzentFarbe() : o.check ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.08)';
  c.stroke();
  c.save();
  c.translate(cx - 9.5, cy - 9.5); c.scale(19 / 24, 19 / 24);
  c.strokeStyle = o.check ? '#ffffff' : k.farbe;
  c.lineWidth = 2.3; c.lineCap = 'round'; c.lineJoin = 'round';
  c.stroke(new Path2D(PFADE[k.id]));
  c.restore();
  const bx = 40, by = 9;
  c.beginPath(); c.arc(bx, by, 8.5, 0, Math.PI * 2);
  c.fillStyle = o.check ? '#ffffff' : '#1c1c20'; c.fill();
  c.lineWidth = 1.5; c.strokeStyle = o.check ? k.farbe : '#ffffff'; c.stroke();
  if (o.check) {
    c.save(); c.translate(bx - 5.5, by - 5.5); c.scale(11 / 24, 11 / 24);
    c.strokeStyle = akzentFarbe(); c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    c.stroke(new Path2D(PFADE.haken)); c.restore();
  } else {
    c.fillStyle = '#ffffff'; c.font = `700 ${o.nr > 99 ? 7 : 9.5}px -apple-system, "Segoe UI", Roboto, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(o.nr), bx, by + 0.5);
  }
  map.addImage(name, c.getImageData(0, 0, cv.width, cv.height), { pixelRatio: pr });
  return name;
}

let pinSchluessel = '';
function pinsZeichnen() {
  if (!karteBereit || !document.body.classList.contains('auf-karte')) return;
  const v = ansicht(aktuell);
  const features = [];
  for (const o of v ? v.orte : []) {
    if (o.lat == null) continue;
    const aktiv = ui.kartenOrt === o.id;
    const ausgeblendet = ui.kartenTag && o.tag !== ui.kartenTag && o.k !== 'hotel';
    features.push({
      type: 'Feature', geometry: { type: 'Point', coordinates: [o.lng, o.lat] },
      properties: { id: o.id, name: o.n, bild: pinBild(o, aktiv), sort: aktiv ? 3 : ausgeblendet ? 0 : o.check ? 1 : 2, deckkraft: ausgeblendet ? 0.25 : 1 },
    });
  }
  const schluessel = features.map((f) => f.properties.id + f.properties.bild + f.properties.deckkraft + f.geometry.coordinates).join('|');
  routeZeichnen();
  if (schluessel === pinSchluessel) return;
  pinSchluessel = schluessel;
  map.getSource('orte').setData({ type: 'FeatureCollection', features });
}

// Linie durch die Orte des gewählten Tages (ab der Unterkunft)
let routeSchluessel = '';
function routeZeichnen() {
  if (!karteBereit || !map.getSource('route')) return;
  const v = ansicht(aktuell);
  let punkte = [];
  if (v && ui.kartenTag) {
    const start = unterkunft(v);
    punkte = [...(start ? [start] : []), ...tagesOrte(v, ui.kartenTag)].filter((o) => o.lat != null).map((o) => [o.lng, o.lat]);
  }
  const schl = JSON.stringify(punkte) + ich.akzent;
  if (schl === routeSchluessel) return;
  routeSchluessel = schl;
  map.setPaintProperty('route', 'line-color', akzentFarbe());
  map.getSource('route').setData(punkte.length > 1 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: punkte }, properties: {} } : { type: 'FeatureCollection', features: [] });
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
    const tt = e.touches[0];
    start = { x: tt.clientX, y: tt.clientY };
    ab();
    timer = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const p = { x: start.x - r.left, y: start.y - r.top };
      const id = pinBei(p);
      langGedrueckt = Date.now();
      if (id) { fuehlen('mittel'); sound.tick(); ortMenue(id); } else langDruck(map.unproject([p.x, p.y]), true);
    }, 520);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => { const tt = e.touches[0]; if (start && Math.hypot(tt.clientX - start.x, tt.clientY - start.y) > 10) ab(); }, { passive: true });
  el.addEventListener('touchend', ab);
  el.addEventListener('touchcancel', ab);
}

function langDruck(lngLat, schonGeprueft) {
  if (!aktuell || ui.tab !== 'karte' || $('#modal').hidden === false || (!schonGeprueft && Date.now() - langGedrueckt < 1200)) return;
  fuehlen('mittel');
  ortEditor({ lat: lngLat.lat, lng: lngLat.lng });
}

function polster(extra = 30) {
  return { top: 80 + extra, bottom: 170 + extra, left: extra, right: extra + 50 };
}

function allesZeigen(sanft = true) {
  const v = ansicht(aktuell);
  const tagModus = v && ui.kartenTag;
  let mitOrt = v ? (tagModus ? [...tagesOrte(v, ui.kartenTag), unterkunft(v)].filter(Boolean) : v.orte).filter((o) => o.lat != null) : [];
  if (!mitOrt.length || !map) return;
  // Auf den Kern zoomen: Ausflugsziele weit weg (Ayutthaya …) erst beim Herauszoomen
  const mitte = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const kern = { lat: mitte(mitOrt.map((o) => o.lat)), lng: mitte(mitOrt.map((o) => o.lng)) };
  const nah = mitOrt.filter((o) => Math.hypot(o.lat - kern.lat, (o.lng - kern.lng) * Math.cos(kern.lat * Math.PI / 180)) < 0.15);
  if (!tagModus && nah.length >= mitOrt.length / 2) mitOrt = nah;
  const b = new maplibregl.LngLatBounds();
  mitOrt.forEach((o) => b.extend([o.lng, o.lat]));
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(b, { padding: polster(40), maxZoom: 15, duration: sanft ? 900 : 0 });
}

function tripMitte(v) {
  if (v.meta && v.meta.ort) return v.meta.ort;
  const m = v.orte.filter((o) => o.lat != null);
  if (!m.length) return null;
  const mid = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return { lat: mid(m.map((o) => o.lat)), lng: mid(m.map((o) => o.lng)) };
}

// ---------- Wetter & Ortszeit (Open-Meteo, ohne Schlüssel) ----------
const wetter = LS.get('sp.wetter', {});
const wetterLaeuft = new Set();
function wetterFuer(v) {
  const w = wetter[v.id];
  const mitte = tripMitte(v);
  if (mitte && navigator.onLine && !wetterLaeuft.has(v.id) && (!w || !w.taeglich || Date.now() - w.zeit > 30 * 60e3)) {
    wetterLaeuft.add(v.id);
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${mitte.lat.toFixed(3)}&longitude=${mitte.lng.toFixed(3)}&current=temperature_2m,weather_code,is_day&daily=sunset&hourly=precipitation_probability&forecast_days=2&timezone=auto`)
      .then((r) => r.json())
      .then((j) => {
        wetter[v.id] = { zeit: Date.now(), temp: Math.round(j.current.temperature_2m), code: j.current.weather_code, tag: j.current.is_day, tz: j.timezone,
          taeglich: { sonnenuntergang: j.daily.sunset }, stuendlich: { zeit: j.hourly.time, regen: j.hourly.precipitation_probability } };
        LS.set('sp.wetter', wetter); neuZeichnen();
      })
      .catch(() => {})
      .finally(() => wetterLaeuft.delete(v.id));
  }
  return w || null;
}
function wetterIcon(w) {
  const c = w.code;
  if (c >= 95) return 'gewitter';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'regen';
  if (c === 45 || c === 48) return 'nebel';
  if (c >= 2) return 'wolken';
  return w.tag ? 'sonne' : 'mond';
}

// ---------- Tabs und Seiten-Stapel ----------
const TABS = { reisen: ['koffer', 'Reisen'], karte: ['karteTab', 'Karte'], profil: ['profil', 'Profil'] };
const tabEl = (tab) => $('#tab-' + tab);

function tabLeisteZeichnen() {
  document.querySelectorAll('.tab-knopf').forEach((b) => {
    const [ic, txt] = TABS[b.dataset.tab];
    b.innerHTML = `${icon(ic, 24, 1.9)}<span>${esc(t(txt))}</span>`;
    b.classList.toggle('an', b.dataset.tab === ui.tab);
  });
  $('#tabbar').style.setProperty('--i', Object.keys(TABS).indexOf(ui.tab));
}

function tabZeigen(tab) {
  if (ui.tab === tab) {
    // Erneutes Tippen auf den Tab: zurück zur ersten Seite
    if (ui.stapel[tab].length > 1) { while (ui.stapel[tab].length > 1) zurueck(tab, true); }
    return;
  }
  ui.tab = tab;
  document.querySelectorAll('.tab').forEach((el) => el.classList.toggle('an', el.id === 'tab-' + tab));
  document.body.classList.toggle('auf-karte', tab === 'karte' && ui.stapel.karte.length === 1);
  tabLeisteZeichnen();
  sound.tick(); fuehlen('leicht');
  if (tab === 'karte') { if (!ui.kartenOrt) setTimeout(() => allesZeigen(true), 60); }
  const st = ui.stapel[tab];
  st.forEach((e, i) => { const el = seiteEl(tab, i); if (el) seiteZeichnen(el, e); });
  allesZeichnen();
}

function seiteEl(tab, i) { return tabEl(tab).children[i]; }

function seiteAnlegen(tab, eintrag) {
  const el = document.createElement('div');
  el.className = 'seite';
  el.dataset.s = eintrag.s;
  seiteZeichnen(el, eintrag);
  tabEl(tab).appendChild(el);
  return el;
}

function oeffnen(eintrag, tab = ui.tab) {
  const st = ui.stapel[tab];
  const oben = seiteEl(tab, st.length - 1);
  st.push(eintrag);
  const el = seiteAnlegen(tab, eintrag);
  el.classList.add('rechts');
  el.getBoundingClientRect();
  el.classList.remove('rechts');
  if (oben) oben.classList.add('zugedeckt');
  if (tab === 'karte') document.body.classList.remove('auf-karte');
  sound.tick();
}

function zurueck(tab = ui.tab, sofort) {
  const st = ui.stapel[tab];
  if (st.length < 2) return;
  st.pop();
  const el = seiteEl(tab, st.length);
  const darunter = seiteEl(tab, st.length - 1);
  if (darunter) { darunter.classList.remove('zugedeckt'); seiteZeichnen(darunter, st[st.length - 1]); }
  if (sofort) el.remove();
  else { el.classList.add('rechts'); setTimeout(() => el.remove(), 520); sound.tick(); }
  if (tab === 'karte' && st.length === 1) { document.body.classList.add('auf-karte'); pinsZeichnen(); }
}

// Wischen vom linken Rand: zurück wie bei iOS
function randWischen() {
  let start = null, el = null, darunter = null;
  const box = $('#ansichten');
  box.addEventListener('touchstart', (e) => {
    const st = ui.stapel[ui.tab];
    const tt = e.touches[0];
    if (st.length < 2 || tt.clientX > 24) return;
    start = { x: tt.clientX, y: tt.clientY, zeit: performance.now() };
    el = seiteEl(ui.tab, st.length - 1);
    darunter = seiteEl(ui.tab, st.length - 2);
  }, { passive: true });
  box.addEventListener('touchmove', (e) => {
    if (!start) return;
    const dx = Math.max(0, e.touches[0].clientX - start.x);
    el.classList.add('schiebt'); darunter.classList.add('schiebt');
    el.style.transform = `translateX(${dx}px)`;
    const anteil = Math.min(1, dx / innerWidth);
    darunter.style.transform = `translateX(${-26 * (1 - anteil)}%)`;
    darunter.style.setProperty('--dunkel', 1 - anteil);
  }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const tempo = dx / (performance.now() - start.zeit);
    el.classList.remove('schiebt'); darunter.classList.remove('schiebt');
    el.style.transform = ''; darunter.style.transform = ''; darunter.style.removeProperty('--dunkel');
    if (dx > innerWidth * 0.33 || tempo > 0.5) zurueck(); else el.getBoundingClientRect();
    start = null;
  });
}

function seitenHtml(e) {
  if (e.s === 'home') return homeHtml();
  if (e.s === 'reise') return reiseHtml(e.trip);
  if (e.s === 'ort') return ortHtml(e.ort, e.tab);
  if (e.s === 'karte') return karteHtml();
  if (e.s === 'profil') return profilHtml();
  return '';
}

// Neu aufbauen nur, wenn sich das HTML wirklich geändert hat (spart Layout und Bilddekodierung)
function seiteZeichnen(el, e) {
  const html = seitenHtml(e);
  if (el._html === html) return;
  el._html = html;
  const merk = el.scrollTop;
  const karussell = el.querySelector('.karussell');
  const kLinks = karussell ? karussell.scrollLeft : 0;
  el.innerHTML = html;
  el.scrollTop = merk;
  const k2 = el.querySelector('.karussell');
  if (k2) { k2.scrollLeft = kLinks; karussellBeobachten(k2); }
}

let zeichnenGeplant = false;
function neuZeichnen() {
  if (zeichnenGeplant) return;
  zeichnenGeplant = true;
  requestAnimationFrame(() => { zeichnenGeplant = false; allesZeichnen(); });
}

// Nur die oberste Seite des sichtbaren Tabs wird gezeichnet; andere Seiten beim Anzeigen (tabZeigen, zurueck)
function allesZeichnen() {
  const st = ui.stapel[ui.tab];
  const el = seiteEl(ui.tab, st.length - 1);
  if (el) seiteZeichnen(el, st[st.length - 1]);
  pinsZeichnen();
  syncAnzeige();
  fremdeStempelMelden();
  miniPlayer();
  $('#auswahlAbbruch').textContent = t('Abbrechen');
  $('#auswahlOk').textContent = t('Hier setzen');
}

function syncAnzeige() {
  document.querySelectorAll('.sync').forEach((el) => {
    const v = ansicht(aktuell);
    const offen = v ? v.ausstehend : 0;
    const live = sync.online > 0;
    el.classList.toggle('live', live && !offen);
    el.classList.toggle('wartet', offen > 0);
    el.querySelector('span').textContent = live ? (offen ? t('Sync …') : t('Live')) : offen ? t('Offline · {n}', { n: offen }) : t('Offline');
  });
}

// Wenn jemand anderes etwas abstempelt: kurz Bescheid geben
const bekannteStempel = new Map();
function fremdeStempelMelden() {
  for (const [id] of trips) {
    const v = ansicht(id);
    if (!v || !v.meta) continue;
    const jetzt = new Set(v.orte.filter((o) => o.check).map((o) => o.id));
    const vorher = bekannteStempel.get(id);
    bekannteStempel.set(id, jetzt);
    if (!vorher) continue;
    const neu = v.orte.filter((o) => o.check && !vorher.has(o.id) && o.check.by !== ich.id);
    if (neu.length && neu.length <= 2) {
      const o = neu[neu.length - 1];
      toast(t('{wer} hat „{ort}“ gestempelt', { wer: name(v, o.check.by), ort: o.n }));
      sound.plopp(); fuehlen('leicht');
    }
  }
}

// ---------- Startseite: alle Reisen ----------
function gruss() {
  const h = new Date().getHours();
  const g = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Hallo' : h < 22 ? 'Guten Abend' : 'Gute Nacht';
  return ich.name ? t(g + ', {name}', { name: ich.name }) : t(g);
}

function avatarHtml(cls = '') {
  return `<span class="avatar ring ${cls}" style="background:${esc(ich.farbe)}">${esc((ich.name || '?').slice(0, 1).toUpperCase())}</span>`;
}

function leuteHtml(v, max = 5) {
  return `<span class="leute">${v.leute.slice(0, max).map((l) => `<span style="background:${esc(l.c || '#888')}" title="${esc(l.n)}">${esc((l.n || '?').slice(0, 1).toUpperCase())}</span>`).join('')}</span>`;
}

function reiseKarte(id) {
  const v = ansicht(id);
  const n = v.orte.length;
  const cover = bildFuerTrip(v.meta);
  const w = wetterFuer(v);
  const anteil = n ? v.erledigt / n : 0;
  return `<button class="reise-karte" data-reise="${id}">
    ${cover ? `<img class="bild" src="${cover}" alt="">` : `<div class="cover-verlauf" style="background:${verlauf(id)}">${esc(v.meta ? v.meta.e : '⏳')}</div>`}
    <div class="oben-chips">
      <span class="chip-glas">${icon('sonst', 14, 2.2)} ${esc(n === 1 ? t('1 Ort') : t('{n} Orte', { n }))}</span>
      ${w ? `<span class="chip-glas">${icon(wetterIcon(w), 15, 2.2)} ${w.temp}° · ${uhrIn(w.tz)}</span>` : ''}
    </div>
    <div class="reise-info">
      <h2>${esc(v.meta ? v.meta.n : t('Wird geladen …'))} <span style="font-size:22px">${esc(v.meta ? v.meta.e : '')}</span></h2>
      <div class="unter">${esc(t('{e} von {n} gestempelt', { e: v.erledigt, n }))}</div>
      <div class="balken" style="--p:${anteil}"><i></i></div>
      <div class="reise-fuss">${leuteHtml(v)}<span>${Math.round(anteil * 100)} %</span></div>
    </div>
  </button>`;
}

function homeHtml() {
  const ids = [...trips.keys()];
  const erst = ids[0] && ansicht(aktuell || ids[0]);
  const hg = erst ? bildFuerTrip(erst.meta, 'hg') : null;
  const leer = !ids.length ? `
    <div class="leer-reisen glas">
      ${stempi({ stimmung: 'winken', groesse: 104 })}
      <h2>${esc(t('Noch keine Reise'))}</h2>
      <p>${esc(t('Leg eure Bangkok-Reise mit allen Zielen vom Zettel an – oder tritt einer Reise mit Code bei.'))}</p>
      <button class="knopf regenbogen voll" data-aktion="bangkok" style="margin-bottom:10px">🇹🇭 ${esc(t('Bangkok-Reise anlegen'))}</button>
    </div>` : '';
  return `${seiteHg(hg)}
    <div class="grosstitel">
      <div><div class="unter">${esc(gruss())}</div><h1>${esc(t('Reisen'))}</h1></div>
      <button data-aktion="zumprofil" aria-label="${esc(t('Profil'))}">${avatarHtml()}</button>
    </div>
    ${ids.map(reiseKarte).join('')}
    ${leer}
    <div class="knopf-paar">
      <button class="knopf glas" data-aktion="neutrip">${icon('plus', 20)} ${esc(t('Neue Reise'))}</button>
      <button class="knopf glas" data-aktion="code">${icon('code', 20)} ${esc(t('Code'))}</button>
    </div>
    ${checklisteHtml()}`;
}

// ---------- Erste Schritte ----------
// Statt eines Rundgangs mit Pop-ups eine Checkliste, die bleibt, bis alles erledigt ist (Mobbin: Mural +10 % Bindung)
function checklistePunkte() {
  const alle = [...trips.keys()].map(ansicht).filter(Boolean);
  return [
    ['reise', t('Erste Reise anlegen'), t('Ziel suchen – Stempi schlägt die Top-Orte vor'), trips.size > 0, 'neutrip'],
    ['stempel', t('Den ersten Ort abstempeln'), t('Auf den Kreis neben einem Ort tippen'), alle.some((v) => v.orte.some((o) => o.check && o.check.by === ich.id)), 'zurreise'],
    ['einladen', t('Mitreisende einladen'), t('Per Link oder Code – alle sehen eure Stempel'), alle.some((v) => v.leute.length > 1) || !!ich.schritte.einladen, 'einladen'],
    ['guide', t('Einen Audio-Guide anhören'), t('Stempi erzählt dir die Geschichte jedes Orts'), !!ich.schritte.guide, 'zumguide'],
    ['app', t('Auf den Startbildschirm legen'), t('Dann startet Stempelpass wie eine echte App'), istApp || !!ich.schritte.app, 'homescreen'],
  ];
}

function checklisteHtml() {
  if (ich.checklisteZu) return '';
  const punkte = checklistePunkte();
  const fertig = punkte.filter((p) => p[3]).length;
  if (fertig === punkte.length) {
    if (!ich.checklisteFeier) {
      ich.checklisteFeier = true; ichSpeichern();
      setTimeout(() => erfolg({ stempi: 'jubel', titel: t('Erste Schritte geschafft!'), text: esc(t('Du kennst jetzt alles Wichtige. Ab hier zählt nur noch eins: stempeln!')), knopf: t('Super'), feiern: 'stufe' }), 700);
    }
    return '';
  }
  return `<div class="checkliste glas">
    <button class="cl-zu" data-aktion="checklistezu" aria-label="${esc(t('Ausblenden'))}">${icon('x', 14, 2.4)}</button>
    <div class="cl-kopf">${stempi({ groesse: 46 })}<span><b>${esc(t('Erste Schritte'))}</b><small>${esc(t('{e} von {n} erledigt', { e: fertig, n: punkte.length }))}</small></span></div>
    ${punkte.map(([, a, b, ok, aktion]) => `<button class="cl-punkt ${ok ? 'fertig' : ''}" ${ok ? 'disabled' : `data-aktion="${aktion}"`}><span class="kreis">${icon('haken', 14, 3)}</span><span><b>${esc(a)}</b><small>${esc(b)}</small></span>${ok ? '' : `<span class="pfeil">${pfeilRechts(16)}</span>`}</button>`).join('')}
  </div>`;
}

// ---------- Reise-Übersicht ----------
function segmenteHtml(v) {
  const n = v.orte.length;
  const liste = [['alle', 'raster', 'Alle', n], ['offen', 'kreis', 'Offen', n - v.erledigt], ['erledigt', 'kreisHaken', 'Erledigt', v.erledigt], ['naehe', 'navi', 'Nähe', null]];
  const i = Math.max(0, liste.findIndex((s) => s[0] === ui.filter));
  return `<div class="segmente glas" style="--n:4;--i:${i}"><span class="schieber"></span>
    ${liste.map(([id, ic, txt, z]) => `<button class="${ui.filter === id ? 'an' : ''}" data-filter="${id}">${icon(ic, 15, 2.2)}${esc(t(txt))}${z != null ? ` <span class="zahl">${z}</span>` : ''}</button>`).join('')}
  </div>`;
}

function ortKarte(v, o) {
  const d = entfernung(o);
  const unten = o.check
    ? `<p class="von">${esc(name(v, o.check.by) === t('dir') ? t('Von dir') : t('Von {wer}', { wer: name(v, o.check.by) }))} · ${esc(wann(o.check.at))}</p>`
    : `<p><span class="kat-punkt" style="background:${kat(o.k).farbe}"></span> ${esc(kat(o.k).name)}${d != null ? ' · ' + meter(d) : ''}</p>`;
  return `<article class="ort ${o.check ? 'erledigt' : ''}" data-id="${esc(o.id)}">
    ${ortBild(o)}
    <div class="ort-text"><h3>${esc(o.n)}${o.lat == null ? `<span class="ohne-ort">${esc(t('ohne Ort'))}</span>` : ''}</h3>${unten}</div>
    <button class="stempel" data-stempel="${esc(o.id)}" aria-label="${esc(o.check ? t('Stempel entfernen') : t('Abstempeln'))}">${icon('haken', 22, 2.6)}</button>
  </article>`;
}

function reiseHtml(id) {
  const v = ansicht(id);
  if (!v) return '';
  const n = v.orte.length;
  const cover = bildFuerTrip(v.meta);
  const w = wetterFuer(v);
  let liste = v.orte;
  if (ui.filter === 'offen') liste = liste.filter((o) => !o.check);
  if (ui.filter === 'erledigt') liste = liste.filter((o) => o.check).sort((a, b) => b.check.at - a.check.at);
  if (ui.filter === 'naehe') liste = [...liste].filter((o) => o.lat != null).sort((a, b) => entfernung(a) - entfernung(b));
  const offline = offlineKarte
    ? `<button class="kachel glas" data-aktion="sync"><span class="k-ico" style="background:#30c25a">${icon('wolkeOk')}</span>${esc(t('Offline ✓'))}</button>`
    : laedt
      ? `<button class="kachel glas" data-aktion="offline" style="--f:${ladeAnteil}"><span class="k-ico" style="background:#bf5af2">${icon('wolke')}</span>${Math.round(ladeAnteil * 100)} %<span class="fortschritt"><i></i></span></button>`
      : `<button class="kachel glas" data-aktion="offline"><span class="k-ico" style="background:#bf5af2">${icon('wolke')}</span>${esc(t('Offline'))}<span class="punkt"></span></button>`;
  const leer = !v.meta
    ? `<div class="leer-hinweis">${icon('sync', 30)}${esc(t('Reise wird von den anderen Handys geladen …'))}<br><span class="klein">${esc(t('Dafür braucht es kurz Internet.'))}</span></div>`
    : !n ? `<div class="leer-hinweis">${icon('sonst', 30)}${esc(t('Noch keine Orte – füg den ersten hinzu!'))}</div>`
      : !liste.length ? `<div class="leer-hinweis">${esc(ui.filter === 'naehe' ? t('Erlaube den Standort, dann stehen hier die nächsten Orte zuerst.') : ui.filter === 'offen' ? t('Alles gestempelt!') : t('Noch nichts gestempelt.'))}</div>` : '';
  return `${seiteHg(bildFuerTrip(v.meta, 'hg'))}
    <div class="held">
      ${cover ? `<img src="${cover}" alt="">` : `<div class="cover-verlauf" style="background:${verlauf(id)}">${esc(v.meta ? v.meta.e : '')}</div>`}
      <div class="nav-held">
        <button class="kreisknopf auf-bild" data-aktion="zurueck" aria-label="${esc(t('Zurück'))}">${icon('zurueck', 22, 2.3)}</button>
        <button class="kreisknopf auf-bild" data-aktion="tripmenue" aria-label="${esc(t('Mehr'))}">${icon('mehr', 22, 2.4)}</button>
      </div>
      <div class="titel">
        <h1>${esc(v.meta ? v.meta.n : '…')} ${esc(v.meta ? v.meta.e : '')}</h1>
        <div class="unter">${w ? `<span class="chip-glas">${icon(wetterIcon(w), 15, 2.2)} ${w.temp}°</span><span class="chip-glas">${icon('uhr', 15, 2.2)} ${uhrIn(w.tz)}</span>` : ''}<span class="chip-glas">${esc(n === 1 ? t('1 Ort') : t('{n} Orte', { n }))}</span></div>
      </div>
    </div>
    <div class="ueber-held">
      <div class="segmente glas umschalter" style="--n:3;--i:${['orte', 'plan', 'tagebuch'].indexOf(ui.reiseAnsicht)}"><span class="schieber"></span>
        ${[['orte', 'orteListe', 'Orte'], ['plan', 'kalender', 'Plan'], ['tagebuch', 'buch', 'Tagebuch']].map(([k, ic, tx]) => `<button class="${ui.reiseAnsicht === k ? 'an' : ''}" data-reiseansicht="${k}">${icon(ic, 16, 2.2)}${esc(t(tx))}</button>`).join('')}
      </div>
      ${ui.reiseAnsicht === 'plan' ? planHtml(v) : ui.reiseAnsicht === 'tagebuch' ? tagebuchHtml(v) : `
      ${hinweiseHtml(v, w)}
      <div class="status-karte glas">
        <div class="fring" style="--p:${n ? v.erledigt / n : 0}"><span>${v.erledigt}<small>/${n}</small></span></div>
        <div class="status-text">
          <b>${esc(t('{e} von {n} gestempelt', { e: v.erledigt, n }))}</b>
          <div class="zeilen"><span>${leuteHtml(v, 6)}</span><span class="sync" style="height:auto;padding:0;background:none;border:0"><i></i><span></span></span></div>
        </div>
      </div>
      ${bestenlisteHtml(v)}
      <div class="kacheln">
        <button class="kachel glas" data-aktion="aufkarte"><span class="k-ico" style="background:#0a84ff">${icon('karteTab')}</span>${esc(t('Karte'))}</button>
        <button class="kachel glas" data-aktion="einladen"><span class="k-ico" style="background:#30c25a">${icon('leute')}</span>${esc(t('Einladen'))}</button>
        <button class="kachel glas" data-aktion="hinzu"><span class="k-ico" style="background:var(--akzent)">${icon('plus')}</span>${esc(t('Hinzufügen'))}</button>
        ${offline}
      </div>
      ${v.erledigt ? `<button class="rb-banner glas" data-aktion="rueckblick"><span class="rb-play">${icon('play', 18, 2.4)}</span><span><b>${esc(t('Rückblick ansehen'))}</b><small>${esc(t('Eure Reise als Story – mit Musik'))}</small></span>${pfeilRechts()}</button>` : ''}
      ${v.meta ? `<button class="knopf glas voll entdecken" data-aktion="entdecken">${icon('funken', 19)} ${esc(t('Sehenswürdigkeiten entdecken'))}</button>` : ''}
      ${segmenteHtml(v)}
      ${liste.map((o) => ortKarte(v, o)).join('')}${leer}
      ${n ? `<p class="lang-tipp">${esc(t('Lange auf einen Ort drücken zum Löschen oder Bearbeiten'))}</p>` : ''}`}
    </div>`;
}

// Sichtbarer Vergleich in der Gruppe (Strava, Peloton): wer hat in dieser Reise am meisten gestempelt?
function bestenlisteHtml(v) {
  const bl = bestenliste(v);
  if (v.leute.length < 2 || !bl.length) return '';
  const max = bl[0].n;
  return `<div class="bestenliste glas"><h3>${icon('pokal', 17, 2.2)} ${esc(t('Wer stempelt am meisten?'))}</h3>
    ${bl.slice(0, 6).map((p, i) => `<div class="bl-zeile"><span class="av" style="background:${esc(p.farbe)}">${i === 0 && (!bl[1] || bl[1].n < p.n) ? `<span class="krone">${icon('krone', 16, 2.2)}</span>` : ''}${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>
      <span style="min-width:0"><span class="nm">${esc(p.id === ich.id ? t('Du') : p.name)}</span><span class="spur" style="--w:${(p.n / max).toFixed(3)};--f:${esc(p.farbe)}"><i></i></span></span><b>${p.n}</b></div>`).join('')}
  </div>`;
}

// ---------- Hinweise ----------
function planTagFuer(v) {
  if (!v.meta || !v.meta.von) return null;
  return (datum) => {
    const n = Math.round((new Date(datum + 'T12:00:00') - new Date(v.meta.von + 'T12:00:00')) / 864e5) + 1;
    if (n < 1 || n > tageAnzahl(v.meta)) return null;
    return { tag: n, orte: tagesOrte(v, n) };
  };
}
function hinweiseHtml(v, w) {
  const h = hinweiseFuer(v, w, { t, zeit: zeitFuerOrt, planTag: planTagFuer(v) });
  if (!h.length) return '';
  return `<div class="hinweise">${h.map((x) => `<button class="hinweis glas" ${x.aktion ? `data-aktion="${x.aktion}"` : ''}><span class="e-ico" style="background:${x.farbe}">${icon(x.ico, 18)}</span><span><b>${esc(x.titel)}</b><small>${esc(x.text)}</small></span></button>`).join('')}</div>`;
}

// ---------- Tagesplaner ----------
const tagesOrte = (v, n) => v.orte.filter((o) => o.tag === n).sort((a, b) => (a.reihe ?? 99) - (b.reihe ?? 99));
const unterkunft = (v) => v.orte.find((o) => o.k === 'hotel' && o.lat != null) || null;
function tagLabel(v, n, kurz) {
  const d = datumVonTag(v.meta && v.meta.von, n);
  if (!d) return t('Tag {n}', { n });
  const wt = d.toLocaleDateString(loc(), { weekday: 'short' });
  return kurz ? `${wt} ${d.getDate()}.` : `${t('Tag {n}', { n })} · ${d.toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' })}`;
}

function planHtml(v) {
  const tage = tageAnzahl(v.meta);
  if (!tage) {
    return `<div class="box glas plan-start">
      <div class="erfolg-ico" style="width:70px;height:70px;margin:4px auto 14px">${icon('kalender', 32, 2)}</div>
      <h2 style="text-align:center;font-size:24px;margin-bottom:6px">${esc(t('Reise planen'))}</h2>
      <p class="klein" style="text-align:center;margin:0 0 16px">${esc(t('Sag, wann ihr dort seid – die App verteilt die Orte sinnvoll auf die Tage: nahe Orte zusammen, Ausflüge extra, Märkte am Wochenende, Aussichtspunkte zum Sonnenuntergang.'))}</p>
      <button class="knopf akzent voll" data-aktion="reisedaten">${icon('kalender', 19)} ${esc(t('Reisedaten festlegen'))}</button>
    </div>`;
  }
  if (ui.planTag > tage) ui.planTag = 1;
  const n = ui.planTag;
  const orte = tagesOrte(v, n);
  const start = unterkunft(v);
  const offen = v.orte.filter((o) => !o.tag && o.k !== 'hotel');
  const datum = datumVonTag(v.meta.von, n);
  const istWE = datum && (datum.getDay() === 0 || datum.getDay() === 6);
  let km = 0, vorher = start;
  const karten = orte.map((o) => {
    let bein = '';
    if (vorher && o.lat != null) { const d = abstand(vorher, o); km += d; bein = `<button class="bein" data-routeleg="${esc(vorher.id)}|${esc(o.id)}">${icon('route', 14, 2)} ${meter(d)} · ${esc(t('Route'))} ›</button>`; }
    if (o.lat != null) vorher = o;
    const warn = zeitFuerOrt(o) === 'wochenende' && datum && !istWE ? `<div class="warnung">${icon('info', 14, 2.2)} ${esc(t('{ort} hat nur Sa & So offen', { ort: o.n }))}</div>` : '';
    return bein + warn + ortKarte(v, o);
  }).join('');
  const route = routeUrl(orte, start);
  return `
    <div class="tag-chips">${Array.from({ length: tage }, (_, i) => i + 1).map((d) => {
      const z = tagesOrte(v, d), fertig = z.length && z.every((o) => o.check);
      return `<button class="tag-chip glas ${d === n ? 'an' : ''} ${fertig ? 'fertig' : ''}" data-plantag="${d}"><b>${esc(t('Tag {n}', { n: d }))}</b><small>${esc(v.meta.von ? tagLabel(v, d, true) : t('{n} Orte', { n: z.length }))}</small>${z.length ? `<i>${z.length}</i>` : ''}</button>`;
    }).join('')}<button class="tag-chip glas plus" data-aktion="tagdazu" aria-label="${esc(t('Tag hinzufügen'))}">${icon('plus', 18, 2.2)}</button></div>
    <div class="tag-kopf">
      <div><b>${esc(tagLabel(v, n))}</b><small>${esc(orte.length ? t('{n} Orte · {km} Wege', { n: orte.length, km: meter(km) }) : t('Noch nichts eingeplant'))}</small></div>
      <button class="kreisknopf glas" data-aktion="reisedaten" aria-label="${esc(t('Reisedaten'))}">${icon('kalender', 19)}</button>
    </div>
    ${start && orte.length ? `<div class="start-zeile">${icon('hotel', 15, 2)} ${esc(t('Start: {ort}', { ort: start.n }))}</div>` : ''}
    ${karten || `<div class="leer-hinweis" style="padding:18px">${esc(t('Tippe unten bei einem Ort auf „+“, um ihn diesem Tag zuzuordnen.'))}</div>`}
    ${orte.length ? `<div class="zwei" style="margin-top:10px">
      ${route ? `<a class="knopf akzent" href="${route}" target="_blank" rel="noopener">${icon('navi', 19)} ${esc(t('Route'))}</a>` : ''}
      <button class="knopf glas" data-aktion="tagaufkarte">${icon('karteTab', 19)} ${esc(t('Karte'))}</button>
    </div>` : ''}
    <button class="knopf glas voll" data-aktion="autoplan" style="margin-top:10px">${icon('zauber', 19)} ${esc(t('Automatisch planen'))}</button>
    ${offen.length ? `<div class="abschnitt">${esc(t('Noch nicht eingeplant ({n})', { n: offen.length }))}</div>
      ${offen.map((o) => `<div class="einplanen">${ortKarte(v, o)}<button class="plus-tag" data-einplanen="${esc(o.id)}" aria-label="${esc(t('Zu Tag {n}', { n }))}">${icon('plus', 18, 2.4)}<small>${esc(t('Tag {n}', { n }))}</small></button></div>`).join('')}` : ''}`;
}

function tagSetzen(id, tag) {
  const tr = trips.get(aktuell);
  const rec = tr && tr.data.records['p:' + id];
  if (!rec) return;
  const v = ansicht(aktuell);
  const reihe = tag ? tagesOrte(v, tag).length : null;
  schreiben(aktuell, 'p:' + id, { ...rec.v, tag: tag || null, reihe });
}

function automatischPlanen() {
  const v = ansicht(aktuell);
  const tage = tageAnzahl(v.meta);
  const start = unterkunft(v);
  // Schon gestempelte Orte behalten ihren Tag, geplant wird der Rest
  const zuPlanen = v.orte.filter((o) => !o.check).map((o) => ({ ...o, z: zeitFuerOrt(o) }));
  const plan = autoPlan(zuPlanen, { start, tage, von: v.meta.von, proTag: orteProTag(ich.tempo) });
  const tr = trips.get(aktuell);
  for (const o of zuPlanen) {
    const p = plan.get(o.id);
    const rec = tr.data.records['p:' + o.id];
    if (p && (rec.v.tag !== p.tag || rec.v.reihe !== p.reihe)) schreiben(aktuell, 'p:' + o.id, { ...rec.v, tag: p.tag, reihe: p.reihe });
  }
  const max = Math.max(0, ...[...plan.values()].map((p) => p.tag));
  if (!tage && max) schreiben(aktuell, 'meta', { ...v.meta, tage: max });
  ui.planTag = 1;
  sound.erfolg(); fuehlen('erfolg');
  toast(t('Plan erstellt – {n} Orte auf {tage} Tage verteilt', { n: plan.size, tage: tage || max }));
}

function reisedatenDialog() {
  const v = ansicht(aktuell);
  const m = v.meta || {};
  const k = modal(`
    <h2>${esc(t('Reisedaten'))}</h2>
    <p class="lead">${esc(t('Mit Datum weiß der Planer, welcher Tag ein Wochenende ist, und die Hinweise zeigen jeden Morgen euren Tag.'))}</p>
    <div class="zwei">
      <label class="feld"><span>${esc(t('Von'))}</span><input class="eingabe" type="date" id="rVon" value="${esc(m.von || '')}"></label>
      <label class="feld"><span>${esc(t('Bis'))}</span><input class="eingabe" type="date" id="rBis" value="${esc(m.bis || '')}"></label>
    </div>
    <label class="feld"><span>${esc(t('Oder nur Anzahl Tage'))}</span><input class="eingabe" type="number" min="1" max="60" id="rTage" value="${esc(m.tage || tageAnzahl(m) || '')}" placeholder="7"></label>
    <div class="knopf-reihe">
      <button class="knopf voll akzent" id="rAuto">${icon('zauber', 19)} ${esc(t('Speichern & automatisch planen'))}</button>
      <button class="knopf voll" id="rOk">${esc(t('Nur speichern'))}</button>
    </div>`);
  const lesen = () => {
    const von = k.querySelector('#rVon').value || null;
    const bis = k.querySelector('#rBis').value || null;
    const tage = +k.querySelector('#rTage').value || null;
    if (von && bis && bis < von) { toast(t('„Bis“ liegt vor „Von“')); return null; }
    if (!von && !tage) { toast(t('Bitte Daten oder Anzahl Tage angeben')); return null; }
    let ende = bis;
    if (von && !bis) ende = new Date(new Date(von + 'T12:00:00').getTime() + ((tage || 1) - 1) * 864e5).toISOString().slice(0, 10);
    return { ...m, von, bis: von ? ende : null, tage: von ? null : tage };
  };
  k.querySelector('#rOk').onclick = () => { const neu = lesen(); if (!neu) return; schreiben(aktuell, 'meta', neu); modalSchliessen(); sound.plopp(); };
  k.querySelector('#rAuto').onclick = () => { const neu = lesen(); if (!neu) return; schreiben(aktuell, 'meta', neu); modalSchliessen(); setTimeout(automatischPlanen, 250); };
}

function tagWahlDialog(id) {
  const v = ansicht(aktuell);
  const o = v.orte.find((x) => x.id === id);
  const tage = tageAnzahl(v.meta);
  if (!tage) { ui.reiseAnsicht = 'plan'; return reisedatenDialog(); }
  const k = modal(`
    <h2>${esc(t('An welchem Tag?'))}</h2>
    <p class="lead">${esc(o.n)}</p>
    <ul class="trip-liste">${Array.from({ length: tage }, (_, i) => i + 1).map((d) => `<li class="${o.tag === d ? 'an' : ''}"><button class="wahl" data-tagwahl="${d}"><span class="t-emo">${d}</span><span><b>${esc(tagLabel(v, d))}</b><small>${esc(t('{n} Orte', { n: tagesOrte(v, d).length }))}</small></span></button></li>`).join('')}</ul>
    <button class="knopf voll" data-tagwahl="0">${esc(t('Nicht einplanen'))}</button>`);
  k.onclick = (e) => { const b = e.target.closest('[data-tagwahl]'); if (!b) return; tagSetzen(id, +b.dataset.tagwahl || null); modalSchliessen(); sound.plopp(); fuehlen('leicht'); };
}

// ---------- Tagebuch ----------
function eintragHtml(v, e, mitOrt = true) {
  const o = e.ort && v.orte.find((x) => x.id === e.ort);
  const url = e.anzahl ? fotoUrl(v.tr.data.records, e.id, e.anzahl) : null;
  const wer = name(v, e.by) === t('dir') ? t('Du') : name(v, e.by);
  return `<article class="eintrag glas" data-eintrag="${esc(e.id)}">
    ${e.anzahl ? (url ? `<img class="foto" src="${url}" alt="" style="aspect-ratio:${e.w || 4}/${e.h || 3}">` : `<div class="foto laedt" style="aspect-ratio:${e.w || 4}/${e.h || 3}">${icon('kamera', 28)}<small>${esc(t('Foto lädt …'))}</small></div>`) : ''}
    <div class="eintrag-text">
      ${e.text ? `<p>${esc(e.text)}</p>` : ''}
      <div class="eintrag-fuss">${leuteHtml({ leute: v.leute.filter((l) => l.id === e.by) }, 1)}<span>${esc(wer)} · ${esc(wann(e.at))}</span>${mitOrt && o ? `<button class="chip" data-ortlink="${esc(o.id)}">${icon(kat(o.k).id, 13)} ${esc(o.n)}</button>` : ''}</div>
    </div>
  </article>`;
}

function tagebuchHtml(v) {
  // Stempel und Einträge zu einer Zeitleiste nach Tagen zusammenführen
  const ereignisse = [
    ...v.eintraege.map((e) => ({ at: e.at, html: eintragHtml(v, e) })),
    ...v.orte.filter((o) => o.check).map((o) => ({ at: o.check.at, html: `<button class="stempel-zeile" data-ortlink="${esc(o.id)}">${katKachel(o.k, 16)}<span>${esc(t('{wer} hat „{ort}“ gestempelt', { wer: name(v, o.check.by) === t('dir') ? t('Du') : name(v, o.check.by), ort: o.n }))}</span><small>${esc(new Date(o.check.at).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }))}</small></button>` })),
  ].sort((a, b) => b.at - a.at);
  const gruppen = [];
  for (const e of ereignisse) {
    const tag = new Date(e.at).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long' });
    if (!gruppen.length || gruppen[gruppen.length - 1].tag !== tag) gruppen.push({ tag, liste: [] });
    gruppen[gruppen.length - 1].liste.push(e.html);
  }
  return `<div class="zwei">
      <button class="knopf akzent" data-aktion="foto">${icon('kamera', 19)} ${esc(t('Foto'))}</button>
      <button class="knopf glas" data-aktion="notiz">${icon('notiz', 19)} ${esc(t('Notiz'))}</button>
    </div>
    ${gruppen.length ? gruppen.map((g) => `<div class="abschnitt">${esc(g.tag)}</div>${g.liste.join('')}`).join('')
      : `<div class="leer-hinweis">${icon('buch', 30)}${esc(t('Euer Reisetagebuch ist noch leer. Stempelt Orte, macht Fotos und schreibt kurze Notizen – alle sehen sie.'))}</div>`}`;
}

// Foto oder Notiz anlegen; ort: Orts-ID oder null
function eintragDialog(ort, mitFoto) {
  const v = ansicht(aktuell);
  const waehlen = () => new Promise((ok) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => ok(inp.files[0] || null);
    inp.click();
  });
  const zeigen = (foto) => {
    const k = modal(`
      <h2>${esc(foto ? t('Foto ins Tagebuch') : t('Notiz ins Tagebuch'))}</h2>
      ${foto ? `<img class="foto vorschau" src="data:image/jpeg;base64,${foto.daten}" alt="">` : ''}
      <label class="feld"><span>${esc(t('Text'))}</span><textarea class="eingabe" id="tText" rows="3" placeholder="${esc(t('Was war besonders?'))}"></textarea></label>
      <label class="feld"><span>${esc(t('Ort'))}</span><select class="eingabe" id="tOrt"><option value="">${esc(t('Ohne Ort'))}</option>${v.orte.map((o) => `<option value="${esc(o.id)}" ${o.id === ort ? 'selected' : ''}>${esc(o.n)}</option>`).join('')}</select></label>
      <button class="knopf voll akzent" id="tOk">${esc(t('Speichern'))}</button>`);
    k.querySelector('#tOk').onclick = () => {
      const text = k.querySelector('#tText').value.trim().slice(0, 600);
      if (!foto && !text) return toast(t('Schreib etwas oder wähle ein Foto'));
      const id = zufall(8);
      if (foto) inStuecke(foto.daten).forEach((d, i) => schreiben(aktuell, `fb:${id}:${i}`, { d }));
      schreiben(aktuell, 'f:' + id, { ort: k.querySelector('#tOrt').value || null, text, at: Date.now(), by: ich.id, anzahl: foto ? Math.ceil(foto.daten.length / 26000) : 0, w: foto ? foto.w : null, h: foto ? foto.h : null });
      modalSchliessen();
      sound.plopp(); fuehlen('mittel');
      toast(t('Im Tagebuch gespeichert'));
    };
    setTimeout(() => k.querySelector('#tText').focus({ preventScroll: true }), 400);
  };
  if (!mitFoto) return zeigen(null);
  waehlen().then(async (datei) => {
    if (!datei) return;
    sound.foto();
    try { zeigen(await fotoVerkleinern(datei)); } catch { toast(t('Foto konnte nicht gelesen werden')); }
  });
}

function eintragAnsehen(id) {
  const v = ansicht(aktuell);
  const e = v.eintraege.find((x) => x.id === id);
  if (!e) return;
  const k = modal(`${eintragHtml(v, e)}<div class="knopf-reihe"><button class="knopf voll rot" id="eWeg">${icon('muell', 19)} ${esc(t('Aus dem Tagebuch löschen'))}</button></div>`);
  k.querySelector('#eWeg').onclick = () => {
    const rec = trips.get(aktuell).data.records['f:' + id];
    schreiben(aktuell, 'f:' + id, { ...rec.v, weg: true });
    for (let i = 0; i < (e.anzahl || 0); i++) schreiben(aktuell, `fb:${id}:${i}`, { d: null, weg: true });
    modalSchliessen(); sound.weg(); fuehlen('weg');
  };
}

function rueckblickStarten() {
  const v = ansicht(aktuell);
  const fotos = v.eintraege.filter((e) => e.anzahl).map((e) => ({ url: fotoUrl(v.tr.data.records, e.id, e.anzahl), text: e.text })).filter((f) => f.url).reverse();
  starteRueckblick({ v, t, esc, icon, kat, bildFuerOrt, bildFuerTrip, fotos, sound, abstand, loc, meter });
}

// ---------- Orts-Seite ----------
function ortHtml(id, tab) {
  const v = ansicht(aktuell);
  const o = v && v.orte.find((x) => x.id === id);
  if (!o) return `<div class="leer-hinweis">${esc(t('Dieser Ort wurde gelöscht.'))}</div>`;
  const d = entfernung(o);
  const bild = bildFuerOrt(o);
  const ringText = `${v.meta ? v.meta.n : 'Stempelpass'} • Nr ${String(o.nr).padStart(2, '0')} • ${o.n.slice(0, 22)}`;
  return `${seiteHg(bildFuerOrt(o, 'hg') || bildFuerTrip(v.meta, 'hg'))}
    <div class="nav-oben">
      <button class="kreisknopf glas-echt" data-aktion="zurueck" aria-label="${esc(t('Zurück'))}">${icon('zurueck', 22, 2.3)}</button>
      <button class="kreisknopf glas-echt" data-aktion="ortmenue" data-id="${esc(o.id)}" aria-label="${esc(t('Mehr'))}">${icon('mehr', 22, 2.4)}</button>
    </div>
    <div class="ort-held">
      ${bild ? `<img src="${bild}" alt="">` : `<div class="farbe" style="background:linear-gradient(140deg, ${kat(o.k).farbe}, color-mix(in srgb, ${kat(o.k).farbe} 55%, #000))">${icon(kat(o.k).id, 84, 1.5)}</div>`}
      <div class="chips"><span class="chip-glas">${icon(kat(o.k).id, 15, 2.2)} ${esc(kat(o.k).name)}</span><span class="chip-glas">Nr. ${o.nr}</span></div>
    </div>
    <div class="scheibe-box">
      ${scheibe({ text: ringText, inhalt: o.check ? icon('haken', 40, 2.6) : icon(kat(o.k).id, 40), klasse: o.check ? 'gestempelt' : '', attr: `data-stempel="${esc(o.id)}" aria-label="${esc(o.check ? t('Stempel entfernen') : t('Abstempeln'))}"` })}
    </div>
    <div class="scheibe-hinweis">${esc(o.check ? t('Gestempelt von {wer} · {wann}', { wer: name(v, o.check.by), wann: wann(o.check.at) }) : t('Auf die Scheibe tippen zum Abstempeln'))}</div>
    <h2 class="detail-name">${esc(o.n)}</h2>
    <div class="chips-zeile">
      ${d != null ? `<span class="chip">${icon('navi', 14)}${meter(d)}</span>` : ''}
      ${o.lat == null ? `<span class="chip">${esc(t('Ohne festen Ort'))}</span>` : ''}
      ${o.check ? `<span class="chip akzent">${icon('haken', 14, 2.6)}${esc(t('Erledigt'))}</span>` : ''}
    </div>
    ${o.lat == null ? `<button class="knopf akzent voll" data-aktion="verorten" data-id="${esc(o.id)}" style="margin-bottom:12px">${icon('sonst', 19)} ${esc(t('Ort festlegen'))}</button>` : ''}
    ${o.lat != null ? `<div class="zwei">
      <button class="knopf akzent" data-aktion="routehier" data-id="${esc(o.id)}">${icon('navi', 19)} ${esc(t('Route'))}</button>
      <button class="knopf glas" data-aktion="ortaufkarte" data-id="${esc(o.id)}">${icon('karteTab', 19)} ${esc(t('Karte'))}</button>
    </div>` : ''}
    ${guideHtml(o)}
    ${o.notiz ? `<div class="box glas"><div class="abschnitt">${esc(t('Notiz'))}</div><p class="notiz">${esc(o.notiz)}</p></div>` : ''}
    <div class="abschnitt">${esc(t('Tagebuch'))}</div>
    ${v.eintraege.filter((e) => e.ort === o.id).map((e) => eintragHtml(v, e, false)).join('')}
    <div class="zwei">
      <button class="knopf glas" data-aktion="foto" data-id="${esc(o.id)}">${icon('kamera', 19)} ${esc(t('Foto'))}</button>
      <button class="knopf glas" data-aktion="notiz" data-id="${esc(o.id)}">${icon('notiz', 19)} ${esc(t('Notiz'))}</button>
    </div>
    ${o.tag ? `<button class="chip" data-aktion="ortmenue" data-id="${esc(o.id)}" style="margin:4px auto 0;display:flex;width:max-content">${icon('kalender', 14)} ${esc(tagLabel(v, o.tag))}</button>` : ''}`;
}

function ortOeffnen(id) {
  const tab = ui.tab === 'profil' ? 'reisen' : ui.tab;
  if (tab !== ui.tab) tabZeigen(tab);
  const st = ui.stapel[tab];
  const oben = st[st.length - 1];
  if (oben.s === 'ort') { oben.ort = id; seiteZeichnen(seiteEl(tab, st.length - 1), oben); seiteEl(tab, st.length - 1).scrollTop = 0; return; }
  oeffnen({ s: 'ort', ort: id, tab }, tab);
}

// ---------- Karten-Tab ----------
function karteHtml() {
  const v = ansicht(aktuell);
  const tage = v ? tageAnzahl(v.meta) : 0;
  if (ui.kartenTag && ui.kartenTag > tage) ui.kartenTag = null;
  const orteAufKarte = v ? (ui.kartenTag ? tagesOrte(v, ui.kartenTag) : v.orte) : [];
  const tagWahl = tage && v.orte.some((o) => o.tag) ? `<div class="karte-tage">${['alle', ...Array.from({ length: tage }, (_, i) => i + 1)].map((d) => `<button class="chip glas-echt ${(d === 'alle' && !ui.kartenTag) || d === ui.kartenTag ? 'an' : ''}" data-kartentag="${d}">${esc(d === 'alle' ? t('Alle') : v.meta.von ? `${t('Tag {n}', { n: d })} · ${tagLabel(v, d, true)}` : t('Tag {n}', { n: d }))}</button>`).join('')}</div>` : '';
  const karten = v ? orteAufKarte.map((o) => `
    <div class="k-karte ${ui.kartenOrt === o.id ? 'an' : ''} ${o.check ? 'erledigt' : ''}" data-kid="${esc(o.id)}" data-id="${esc(o.id)}">
      ${ortBild(o)}
      <div class="ort-text"><h3>${esc(o.n)}</h3><p>${o.check ? `<span style="color:var(--akzent);font-weight:650">${esc(t('Gestempelt'))}</span>` : `<span class="kat-punkt" style="background:${kat(o.k).farbe}"></span> ${esc(kat(o.k).name)}`}${entfernung(o) != null ? ' · ' + meter(entfernung(o)) : ''}</p></div>
      <button class="stempel" data-stempel="${esc(o.id)}" aria-label="${esc(o.check ? t('Stempel entfernen') : t('Abstempeln'))}">${icon('haken', 22, 2.6)}</button>
    </div>`).join('') : '';
  return `<div class="karte-oben">
      <button class="pille glas-echt" data-aktion="tripmenue"><span class="emo">${esc(v && v.meta ? v.meta.e : '🗺️')}</span><span class="name">${esc(v && v.meta ? v.meta.n : t('Keine Reise'))}</span>${icon('runter', 18, 2.4)}</button>
      <button class="sync glas-echt" data-aktion="sync"><i></i><span></span></button>
    </div>
    <div class="karte-knoepfe">
      <button class="kreisknopf glas-echt ${ortungId != null ? 'an' : ''}" data-aktion="ortung" aria-label="${esc(t('Mein Standort'))}">${icon('ortung', 22)}</button>
      <button class="kreisknopf glas-echt" data-aktion="alle" aria-label="${esc(t('Übersicht'))}">${icon('karte', 22)}</button>
      ${v ? `<button class="kreisknopf glas-echt ${ui.route ? 'an' : ''}" data-aktion="routeneu" aria-label="${esc(t('Route'))}">${icon('route', 22)}</button>` : ''}
      ${v ? `<button class="kreisknopf glas-echt" data-aktion="hinzu" aria-label="${esc(t('Hinzufügen'))}">${icon('plus', 22)}</button>` : ''}
    </div>
    ${ui.route && v ? routeKarteHtml(v) : `${tagWahl}
    <div class="karussell">${karten}</div>`}`;
}

// Karussell: was in der Mitte steht, wird auf der Karte angeflogen
function karussellBeobachten(k) {
  if (k.dataset.beobachtet) return;
  k.dataset.beobachtet = '1';
  let timer = null;
  k.addEventListener('scroll', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const mitte = k.scrollLeft + k.clientWidth / 2;
      let best = null, bestD = 1e9;
      k.querySelectorAll('.k-karte').forEach((c) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mitte); if (d < bestD) { bestD = d; best = c; } });
      if (best && best.dataset.kid !== ui.kartenOrt) { fuehlen('leicht'); kartenOrtWaehlen(best.dataset.kid, false); }
    }, 140);
  }, { passive: true });
}

function kartenOrtWaehlen(id, scrollen) {
  ui.kartenOrt = id;
  const v = ansicht(aktuell);
  const o = v && v.orte.find((x) => x.id === id);
  if (o && o.lat != null && map) map.easeTo({ center: [o.lng, o.lat], zoom: Math.max(map.getZoom(), 14.5), padding: polster(), duration: 650 });
  pinsZeichnen();
  document.querySelectorAll('.k-karte').forEach((c) => c.classList.toggle('an', c.dataset.kid === id));
  if (scrollen) {
    const c = document.querySelector(`.k-karte[data-kid="${CSS.escape(id)}"]`);
    if (c) c.parentElement.scrollTo({ left: c.offsetLeft - (c.parentElement.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
  }
}

function ortAufKarte(id) {
  tabZeigen('karte');
  while (ui.stapel.karte.length > 1) zurueck('karte', true);
  document.body.classList.add('auf-karte');
  setTimeout(() => kartenOrtWaehlen(id, true), 120);
}

// ---------- Profil ----------
function profilHtml() {
  const alleTrips = [...trips.keys()].map(ansicht).filter(Boolean);
  const stempel = alleTrips.flatMap((v) => v.orte.filter((o) => o.check).map((o) => ({ o, v }))).sort((a, b) => b.o.check.at - a.o.check.at);
  const meine = stempel.filter((s) => s.o.check.by === ich.id).length;
  const v = ansicht(aktuell);
  const mitte = v && tripMitte(v);
  const km = ich.heimat && mitte ? Math.round(abstand(ich.heimat, mitte) / 1000) : null;
  const w = v && wetter[v.id];
  const heimat = ich.heimat ? `${esc(ich.heimat.name)}${ich.heimat.land ? ', ' + esc(ich.heimat.land) : ''}` : esc(t('Heimatort festlegen'));
  const st = stufe(meine);
  // Maschinenlesbare Zeile wie im echten Reisepass – nur Dekoration
  const mrz = ('P<' + ((ich.heimat && ich.heimat.cc) || 'XX').toUpperCase() + '<' + (ich.name || 'REISENDE').toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '') + '<<STEMPELPASS<<' + String(meine).padStart(3, '0') + 'ST' + (st.nr + 1)).padEnd(44, '<').slice(0, 44);
  const seg = (feld, werte) => {
    const i = Math.max(0, werte.findIndex(([w]) => w === ich[feld]));
    return `<div class="segmente" style="--n:${werte.length};--i:${i};background:var(--flaeche)"><span class="schieber"></span>${werte.map(([w, txt, ic]) => `<button class="${ich[feld] === w ? 'an' : ''}" data-einst="${feld}" data-wert="${w}">${ic ? icon(ic, 15, 2.2) : ''}${esc(txt)}</button>`).join('')}</div>`;
  };
  const zeile = (ic, farbe, txt, rechts, aktion) => `<button class="e-zeile" ${aktion ? `data-aktion="${aktion}"` : ''}><span class="e-ico" style="background:${farbe}">${icon(ic, 18)}</span>${esc(txt)}<span class="wert">${rechts}</span></button>`;
  return `${seiteHg(null)}
    <div class="grosstitel"><div><h1>${esc(t('Profil'))}</h1></div></div>
    <div class="pass-karte">
      <div class="pk-glanz"></div>
      <div class="pk-kopf"><span>STEMPELPASS</span><span>${ich.heimat ? flagge(ich.heimat.cc) : '🌍'}</span></div>
      <div class="pk-mitte">${avatarHtml()}
        <div style="min-width:0"><h2>${esc(ich.name || t('Ohne Namen'))}</h2><button class="heimat" data-aktion="heimat">${icon('haus', 14)} ${heimat}</button></div>
        ${stempi({ groesse: 54, stimmung: meine ? 'ruhe' : 'schlaeft' })}</div>
      <div class="pk-stufe"><b>${esc(t('Stufe {n}', { n: st.nr + 1 }))} · ${esc(stufenName(st, t))}</b><span>${esc(meine === 1 ? t('1 Stempel') : t('{n} Stempel', { n: meine }))}</span></div>
      <div class="pk-balken" style="--p:${st.anteil.toFixed(3)}"><i></i></div>
      <div class="pk-fuss"><span>${esc(t('Noch {n} bis {name}', { n: st.fehlen, name: stufenName(st.naechste, t) }))}</span>
        <span class="uhren">
          ${ich.heimat && ich.heimat.tz ? `<span class="chip">${icon('haus', 13)} ${uhrIn(ich.heimat.tz)}</span>` : ''}
          ${w && w.tz && v.meta ? `<span class="chip">${icon('sonst', 13)} ${uhrIn(w.tz)}</span>` : ''}
        </span></div>
      <div class="pk-mrz" aria-hidden="true">${esc(mrz)}</div>
    </div>
    <div class="statistik">
      <div class="stat glas"><b>${meine}</b><span>${esc(t('Deine Stempel'))}</span></div>
      <div class="stat glas"><b>${alleTrips.length}</b><span>${esc(t('Reisen'))}</span></div>
      <div class="stat glas"><b>${km != null ? km.toLocaleString(loc()) : '–'}</b><span>${esc(t('km von zuhause'))}</span></div>
    </div>
    <div class="abschnitt">${esc(t('Mein Stempelpass'))}</div>
    <div class="pass glas">
      ${stempel.length ? `<div class="pass-raster">${stempel.map(({ o, v: rv }, i) => { const sel = seltenheit(rv.id, o); return `<button class="mini-stempel ${sel}" data-pass="${esc(o.id)}" style="--f:${kat(o.k).farbe};--w:${((i * 37) % 22) - 11}deg">
          <span class="rund">${icon(kat(o.k).id, 28, 1.8)}${sel !== 'normal' ? `<span class="selten" title="${esc(sel === 'gold' ? t('Goldstempel') : t('Silberstempel'))}">✦</span>` : ''}</span><b>${esc(o.n)}</b>${esc(new Date(o.check.at).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }))}</button>`; }).join('')}</div>`
        : `<div class="leer-hinweis" style="padding:14px">${esc(t('Noch keine Stempel – der erste wartet schon!'))}</div>`}
    </div>
    <div class="abschnitt">${esc(t('Einstellungen'))}</div>
    <div class="gruppe glas">
      <div class="e-zeile block"><span class="e-ico" style="background:#5e5ce6">${icon('halbmond', 18)}</span>${esc(t('Erscheinungsbild'))}${seg('design', [['auto', t('Auto'), 'halbmond'], ['hell', t('Hell'), 'sonne'], ['dunkel', t('Dunkel'), 'mond']])}</div>
      <div class="e-zeile"><span class="e-ico" style="background:var(--akzent)">${icon('palette', 18)}</span>${esc(t('Akzentfarbe'))}<span class="farben">${Object.entries(AKZENTE).map(([k, f]) => `<button class="${ich.akzent === k ? 'an' : ''}" data-akzent="${k}" style="--f:${f[1]}" aria-label="${k}"></button>`).join('')}</span></div>
      <div class="e-zeile block"><span class="e-ico" style="background:#0a84ff">${icon('sprache', 18)}</span>${esc(t('Sprache'))}${seg('sprache', [['de', 'Deutsch'], ['en', 'English']])}</div>
    </div>
    <div class="gruppe glas">
      ${zeile('person', '#30c25a', t('Name & Farbe'), `${esc(ich.name)} ${pfeilRechts(16)}`, 'name')}
      ${zeile('haus', '#ff9f0a', t('Heimatort'), `${ich.heimat ? esc(ich.heimat.name) : ''} ${pfeilRechts(16)}`, 'heimat')}
      ${zeile('funken', '#ff2d78', t('Interessen & Reisetempo'), `${(ich.interessen || []).length || ''} ${pfeilRechts(16)}`, 'vorlieben')}
      ${'speechSynthesis' in window ? zeile('stimme', '#30b0c7', t('Stimme des Audio-Guides'), `${esc(((ich.stimmen || {})[ich.sprache] || '').replace(/^(Microsoft|Google)\s+/, '').split(/\s[-(]/)[0])} ${pfeilRechts(16)}`, 'stimme') : ''}
    </div>
    <div class="gruppe glas">
      <label class="e-zeile"><span class="e-ico" style="background:#ff2d78">${icon('ton', 18)}</span>${esc(t('Töne'))}<input type="checkbox" class="schalter" data-schalter="ton" ${tonAn() ? 'checked' : ''}></label>
      <label class="e-zeile"><span class="e-ico" style="background:#30b0c7">${icon('vibration', 18)}</span>${esc(t('Vibration'))}<input type="checkbox" class="schalter" data-schalter="vibration" ${ich.vibration !== false ? 'checked' : ''}></label>
    </div>
    <div class="gruppe glas">
      ${zeile('sync', '#0a84ff', t('Sync & Offline-Karte'), `${esc(offlineKarte ? t('Offline ✓') : t('nur online'))} ${pfeilRechts(16)}`, 'sync')}
      ${zeile('homescreen', '#ff2d78', t('Zum Startbildschirm hinzufügen'), `${esc(istApp ? t('Installiert ✓') : '')} ${pfeilRechts(16)}`, 'homescreen')}
      ${zeile('rakete', '#bf5af2', t('Einführung ansehen'), pfeilRechts(16), 'einfuehrung')}
      ${zeile('bild', '#8e8e93', t('Bildnachweise'), pfeilRechts(16), 'nachweise')}
    </div>
    <p class="klein" style="text-align:center">Stempelpass · ${esc(t('Eure Daten sind Ende-zu-Ende-verschlüsselt.'))}</p>`;
}


// ---------- Route zwischen zwei Orten ----------
// Punkt-Kennungen: 'ich' (eigener Standort) oder die ID eines Orts
function routePunkt(v, k) {
  if (k === 'ich') return pos ? { lat: pos.lat, lng: pos.lng, n: t('Mein Standort'), ich: true } : null;
  const o = v && v.orte.find((x) => x.id === k);
  return o && o.lat != null ? o : null;
}

function standardStart(v, ziel) {
  if (pos) return 'ich';
  const h = unterkunft(v);
  if (h && h.id !== ziel) return h.id;
  const anderer = v.orte.find((o) => o.lat != null && o.id !== ziel);
  return anderer ? anderer.id : null;
}

// Straßennamen aus OSRM (oft Thai) über die Kartendaten in Deutsch/Englisch übersetzen
let strassenCache = { zeit: 0, map: new Map() };
function strassenName(roh, ref) {
  if (!roh) return ref && latein(ref) ? ref : '';
  if (Date.now() - strassenCache.zeit > 3000 && karteBereit) {
    const m = new Map();
    for (const f of map.querySourceFeatures('protomaps', { sourceLayer: 'roads' })) {
      const p = f.properties;
      if (p.name && !m.has(p.name)) m.set(p.name, p);
    }
    strassenCache = { zeit: Date.now(), map: m };
  }
  const p = strassenCache.map.get(roh);
  const uebersetzt = p && (p['name:' + ich.sprache] || p['name:en']);
  if (uebersetzt) return uebersetzt;
  if (latein(roh)) return roh;
  return ref && latein(ref) ? ref : '';
}

async function routeStarten(ziel, start) {
  const v = ansicht(aktuell);
  if (!routePunkt(v, ziel)) return toast(t('Dieser Ort hat noch keine Position'));
  ui.route = { nach: ziel, von: start || standardStart(v, ziel), modus: ui.route ? ui.route.modus : 'fuss', schritte: false, daten: null, laedt: false };
  if (!ui.route.von) { ui.route = null; return toast(t('Für eine Route braucht es einen Startpunkt – Standort erlauben oder einen zweiten Ort anlegen')); }
  ui.kartenOrt = ziel;
  tabZeigen('karte');
  while (ui.stapel.karte.length > 1) zurueck('karte', true);
  document.body.classList.add('auf-karte');
  routeBerechnen();
}

async function routeBerechnen() {
  const r = ui.route;
  if (!r) return;
  const v = ansicht(aktuell);
  const von = routePunkt(v, r.von), nach = routePunkt(v, r.nach);
  if (!von || !nach) { r.daten = null; neuZeichnen(); return; }
  r.laedt = true; r.daten = null;
  allesZeichnen();
  const anfrage = (r.anfrage = Symbol());
  let daten;
  try { daten = await routeHolen(von, nach, r.modus); } catch { daten = schaetzung(von, nach, r.modus, abstand); }
  if (ui.route !== r || r.anfrage !== anfrage) return;
  r.daten = daten; r.laedt = false;
  wegZeichnen();
  allesZeichnen();
  const b = new maplibregl.LngLatBounds();
  daten.punkte.forEach((p) => b.extend(p));
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  map.fitBounds(b, { padding: { top: 130, bottom: Math.min(innerHeight * 0.5, 340), left: 40, right: 70 }, maxZoom: 16.5, duration: 800 });
  setTimeout(() => { strassenCache.zeit = 0; neuZeichnen(); }, 1300); // Straßennamen aus den jetzt geladenen Kacheln
}

function wegZeichnen() {
  if (!karteBereit || !map.getSource('weg')) return;
  const d = ui.route && ui.route.daten;
  map.getSource('weg').setData(d ? { type: 'Feature', geometry: { type: 'LineString', coordinates: d.punkte }, properties: {} } : { type: 'FeatureCollection', features: [] });
  map.setPaintProperty('weg', 'line-color', akzentFarbe());
  map.setPaintProperty('weg', 'line-dasharray', d && d.geschaetzt ? [1, 1.5] : [1, 0]);
}

function routeSchliessen() {
  ui.route = null;
  wegZeichnen();
  allesZeichnen();
}

const dauerText = (s) => { const min = Math.max(1, Math.round(s / 60)); return min < 60 ? t('{n} Min', { n: min }) : t('{h} Std {m} Min', { h: Math.floor(min / 60), m: min % 60 }); };

function routeKarteHtml(v) {
  const r = ui.route;
  const von = routePunkt(v, r.von), nach = routePunkt(v, r.nach);
  const d = r.daten;
  const modi = [['fuss', 'fuss', 'Gehen'], ['auto', 'auto', 'Fahren'], ['rad', 'rad', 'Rad']];
  const i = Math.max(0, modi.findIndex((m) => m[0] === r.modus));
  const schritte = d && d.schritte.length ? d.schritte.map((s) => `<li><span class="s-ico">${icon(schrittIcon(s), 18, 2.2)}</span><span>${esc(schrittText(s, t, strassenName(s.name, s.ref), nach ? nach.n : '', r.modus))}</span><small>${s.distanz >= 10 ? meter(s.distanz) : ''}</small></li>`).join('') : '';
  return `<div class="route-karte glas-dicht">
    <div class="route-kopf">
      <div class="route-punkte">
        <button class="route-punkt" data-routewahl="von"><i class="start"></i><span>${esc(von ? von.n : t('Start wählen'))}</span></button>
        <button class="route-punkt" data-routewahl="nach"><i class="ende"></i><span>${esc(nach ? nach.n : t('Ziel wählen'))}</span></button>
      </div>
      <button class="kreisknopf" data-aktion="routetausch" aria-label="${esc(t('Tauschen'))}">${icon('tauschen', 18, 2.2)}</button>
      <button class="kreisknopf" data-aktion="routezu" aria-label="${esc(t('Schließen'))}">${icon('x', 18, 2.4)}</button>
    </div>
    <div class="segmente" style="--n:3;--i:${i};background:var(--flaeche)"><span class="schieber"></span>${modi.map(([k, ic, tx]) => `<button class="${r.modus === k ? 'an' : ''}" data-routemodus="${k}">${icon(ic, 17, 2)}${esc(t(tx))}</button>`).join('')}</div>
    <div class="route-summe">
      ${r.laedt ? `<b>…</b><span>${esc(t('Route wird berechnet'))}</span>` : d ? `<b>${esc(dauerText(d.dauer))}</b><span>${meter(d.distanz)}${d.geschaetzt ? ' · ' + esc(t('Schätzung ohne Internet')) : r.modus === 'auto' ? ' · ' + esc(t('ohne Stau')) : ''}</span>` : `<span>${esc(t('Start und Ziel wählen'))}</span>`}
    </div>
    ${schritte ? `<button class="route-schritte-knopf" data-aktion="routeschritte">${icon(r.schritte ? 'runter' : 'orteListe', 16, 2.2)} ${esc(r.schritte ? t('Schritte ausblenden') : t('{n} Schritte anzeigen', { n: d.schritte.length }))}</button>
      ${r.schritte ? `<ol class="schritte">${schritte}</ol>` : ''}` : ''}
    ${von && nach ? `<div class="zwei" style="margin:10px 0 0">
      <a class="knopf" href="${googleRoute(von.ich ? null : von, nach, r.modus)}" target="_blank" rel="noopener">${icon('navi', 18)} Google Maps</a>
      <a class="knopf" href="${googleRoute(von.ich ? null : von, nach, 'oepnv')}" target="_blank" rel="noopener">${icon('bus', 18)} ${esc(t('Öffis'))}</a>
    </div>` : ''}
  </div>`;
}

function routeWahlDialog(welcher) {
  const v = ansicht(aktuell);
  const r = ui.route;
  const auswahl = [
    ...(('geolocation' in navigator) ? [{ id: 'ich', n: t('Mein Standort'), ich: true }] : []),
    ...v.orte.filter((o) => o.lat != null).sort((a, b) => (b.k === 'hotel') - (a.k === 'hotel')),
  ];
  const k = modal(`
    <h2>${esc(welcher === 'von' ? t('Von wo?') : t('Wohin?'))}</h2>
    <ul class="trip-liste">${auswahl.map((o) => `<li class="${r[welcher] === o.id ? 'an' : ''}"><button class="wahl" data-punkt="${esc(o.id)}">${o.ich ? `<span class="t-emo" style="background:#0a84ff;color:#fff">${icon('ortung', 22)}</span>` : `<span class="t-emo">${bildFuerOrt(o, 'klein') ? `<img src="${bildFuerOrt(o, 'klein')}" alt="">` : katKachel(o.k, 20)}</span>`}<span style="min-width:0"><b>${esc(o.n)}</b><small>${esc(o.ich ? (pos ? t('Wo du gerade bist') : t('Standort wird gesucht …')) : kat(o.k).name)}</small></span></button></li>`).join('')}</ul>`);
  k.onclick = (e) => {
    const b = e.target.closest('[data-punkt]');
    if (!b) return;
    r[welcher] = b.dataset.punkt;
    if (welcher === 'nach') ui.kartenOrt = b.dataset.punkt;
    modalSchliessen(); sound.tick();
    if (b.dataset.punkt === 'ich' && !pos) setTimeout(() => standortFragen(false), 300);
    setTimeout(routeBerechnen, pos || b.dataset.punkt !== 'ich' ? 0 : 1500);
  };
}

// ---------- Zum Home-Bildschirm ----------
function homescreenDialog() {
  schrittErledigt('app');
  if (istApp) return toast(t('Stempelpass ist schon als App installiert ✓'));
  if (installEvent) { installEvent.prompt(); installEvent.userChoice.then((c) => { if (c.outcome === 'accepted') { sound.erfolg(); toast(t('Installiert – du findest Stempelpass jetzt auf dem Startbildschirm')); } }); installEvent = null; return; }
  const codes = [...trips.values()].map((tr) => { const v = ansicht(tr.keys.id); return `${v.meta ? v.meta.n : '?'}: ${tr.code}`; }).join('\n');
  const schritte = istIOS
    ? [['iosTeilen', t('Unten in Safari auf „Teilen“ tippen'), t('Das Quadrat mit dem Pfeil nach oben')], ['homescreen', t('„Zum Home-Bildschirm“ wählen'), t('Etwas nach unten scrollen, falls es nicht gleich zu sehen ist')], ['haken', t('Oben rechts auf „Hinzufügen“'), t('Fertig – das Stempelpass-Symbol liegt jetzt bei deinen Apps')]]
    : [['mehr', t('Das Browser-Menü öffnen'), t('Meist die drei Punkte oben rechts')], ['homescreen', t('„App installieren“ oder „Zum Startbildschirm hinzufügen“'), t('Je nach Browser heißt es etwas anders')], ['haken', t('Bestätigen'), t('Fertig – das Symbol liegt jetzt bei deinen Apps')]];
  const k = modal(`
    <div style="text-align:center"><img src="icons/icon-192.png" alt="" style="width:76px;height:76px;border-radius:18px;box-shadow:var(--schatten);margin:2px 0 14px"></div>
    <h2 style="text-align:center;padding:0">${esc(t('Auf den Startbildschirm'))}</h2>
    <p class="lead" style="text-align:center">${esc(t('Dann startet Stempelpass wie eine echte App – im Vollbild und auch offline.'))}</p>
    <ol class="anleitung">${schritte.map(([ic, a, b], n) => `<li><span class="nr">${n + 1}</span><span class="e-ico" style="background:${['#0a84ff', '#bf5af2', '#30c25a'][n]}">${icon(ic, 18)}</span><span><b>${esc(a)}</b><small>${esc(b)}</small></span></li>`).join('')}</ol>
    ${istIOS && trips.size ? `<div class="ios-hinweis"><b>${esc(t('Wichtig fürs iPhone:'))}</b> ${esc(t('Die App vom Startbildschirm hat einen eigenen Speicher. Tritt dort deinen Reisen einfach nochmal mit dem Code bei:'))}<pre class="codes">${esc(codes)}</pre><button class="knopf voll" id="hCodes">${icon('kopie', 18)} ${esc(t('Codes kopieren'))}</button></div>` : ''}`);
  const kc = k.querySelector('#hCodes');
  if (kc) kc.onclick = async () => { try { await navigator.clipboard.writeText(codes); sound.plopp(); toast(t('Codes kopiert')); } catch { toast(t('Kopieren nicht möglich')); } };
}

// ---------- Abstempeln ----------
function stempeln(id, knopf) {
  const v = ansicht(aktuell);
  const o = v.orte.find((x) => x.id === id);
  if (!o) return;
  if (!o.check && knopf) {
    // Tintenspritzer genau dort, wo der Stempel aufs Papier trifft
    const r = knopf.getBoundingClientRect();
    setTimeout(() => spritzer(r.left + r.width / 2, r.top + r.height / 2, akzentFarbe()), 60);
  }
  if (!o.check) guideFuer(o); // Fun Facts für den Erfolgsscreen schon mal holen (meist aus dem Zwischenspeicher)
  if (o.check) {
    const alt = o.check;
    schreiben(aktuell, 'c:' + id, { ok: false, by: ich.id, at: Date.now() });
    sound.weg(); fuehlen('weg');
    toast(t('Stempel bei „{ort}“ entfernt', { ort: o.n }), t('Rückgängig'), () => { schreiben(aktuell, 'c:' + id, alt); sound.zurueck(); fuehlen('leicht'); }, 4500);
    return;
  }
  const vorher = v.erledigt;
  schreiben(aktuell, 'c:' + id, { ok: true, by: ich.id, at: Date.now() });
  sound.stempel(); fuehlen('stempel');
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
  const von = o.lat != null ? o : pos;
  const offen = v.orte.filter((x) => !x.check && x.lat != null);
  const naechster = von && offen.length ? offen.map((x) => [x, abstand(von, x)]).sort((a, b) => a[1] - b[1])[0] : null;
  // Belohnungen: seltener Stempel (Überraschung), neue Stufe (endloser Fortschritt), Führung in der Gruppe (Vergleich)
  const sel = seltenheit(aktuell, o);
  const meine = meineStempel();
  const s0 = stufe(meine - 1), s1 = stufe(meine);
  const aufstieg = s1.nr > s0.nr;
  const bl = bestenliste(v);
  const fuehrt = v.leute.length > 1 && bl.length > 1 && bl[0].id === ich.id && bl[0].n - bl[1].n === 1;
  const fakt = fundstueck(o);
  const extra = (fuehrt ? `<div class="fuehrung">${icon('krone', 18, 2.2)} ${esc(t('Du führst jetzt in eurer Gruppe!'))}</div>` : '')
    + (fakt ? `<div class="fundstueck">${icon('funken', 18, 2)}<span><b>${esc(t('Wusstest du?'))}</b>${esc(fakt)}</span></div>` : '');
  const titel = aufstieg ? t('Neue Stufe: {name}!', { name: stufenName(s1, t) })
    : marke ? t(marke[1]) : sel === 'gold' ? t('Wow, ein Goldstempel!') : sel === 'silber' ? t('Ein Silberstempel!') : t('Gestempelt!');
  erfolg({
    kopf: aufstieg ? `<div class="stufe-kopf">${stempi({ stimmung: 'jubel', groesse: 82 })}<div class="stufe-abzeichen">${s1.nr + 1}<small>${esc(t('STUFE'))}</small></div></div>` : '',
    stempi: aufstieg ? null : marke || sel === 'gold' ? 'jubel' : sel === 'silber' ? 'staunen' : 'freude',
    selten: sel,
    titel,
    text: aufstieg ? esc(t('{ort} war dein {n}. Stempel. Als Nächstes: {name} ab {ab} Stempeln.', { ort: o.n, n: meine, name: stufenName(s1.naechste, t), ab: s1.naechste.ab }))
      : fertig ? esc(t('Alle {n} Orte von „{reise}“ – was für eine Reise!', { n, reise: v.meta.n })) : esc(t('{ort} · {e} von {n} geschafft, noch {rest} offen.', { ort: o.n, e, n, rest: n - e })),
    extra,
    fortschritt: { von: vorher / n, auf: e / n, links: t('{e} gestempelt', { e }), rechts: `${Math.round((e / n) * 100)} %` },
    vorschlag: !fertig && naechster && !fakt ? { o: naechster[0], weit: naechster[1] } : null,
    knopf: fertig ? t('Rückblick ansehen') : t('Weiter'),
    aktion: fertig ? rueckblickStarten : null,
    zweit: t('📷 Foto dazu'),
    zweitAktion: () => eintragDialog(id, true),
    feiern: aufstieg ? 'stufe' : sel !== 'normal' ? sel : marke ? 'erfolg' : null,
  });
}

// Alle eigenen Stempel über alle Reisen – die eine Zahl, die zählt
function meineStempel() {
  let n = 0;
  for (const id of trips.keys()) { const v = ansicht(id); if (v) n += v.orte.filter((o) => o.check && o.check.by === ich.id).length; }
  return n;
}

// Zufälliger Fun Fact aus dem Audio-Guide – nicht jedes Mal, damit es eine Überraschung bleibt
function fundstueck(o) {
  const z = guides.get(o.id + '.' + ich.sprache);
  const f = z && z.guide && z.guide.kapitel.find((k) => k.id === 'fakten');
  if (!f || !f.saetze.length || Math.random() < 0.3) return null;
  // "Artikel in 30 Sprachen" ist eher Statistik als Fun Fact – nur nehmen, wenn es nichts anderes gibt
  const gute = f.saetze.filter((s) => !/Wikipedia/.test(s));
  const pool = gute.length ? gute : f.saetze;
  return pool[Math.floor(Math.random() * pool.length)];
}

const KONFETTI_FARBEN = ['#0a84ff', '#bf5af2', '#ff2d78', '#ff9f0a', '#30d158', '#ffd60a', '#ffffff'];
function konfetti(opt = {}) { partikelKonfetti({ farben: [...KONFETTI_FARBEN, akzentFarbe()], ...opt }); }

// Erfolgs-Screen. kopf: eigenes HTML oben, stempi: Stimmung des Maskottchens statt Symbol,
// selten: 'silber' | 'gold' zeigt das Metall-Band, feiern: 'erfolg' | 'stufe' | 'silber' | 'gold' (oder true)
function erfolg({ icon: ic = 'haken', kopf = '', stempi: figur = null, selten = null, titel, text, extra = '', fortschritt, vorschlag, knopf, aktion, zweit, zweitAktion, feiern }) {
  const alt = $('#erfolg'); if (alt) alt.remove();
  const el = document.createElement('div');
  el.className = 'erfolg'; el.id = 'erfolg';
  const glut = selten === 'gold' ? '--glut:#ffd60a' : selten === 'silber' ? '--glut:#dfe4ea' : '';
  el.innerHTML = `
    <div class="erfolg-hg"></div>
    <div class="erfolg-karte glas-dicht" role="dialog" aria-modal="true">
      ${kopf || (figur ? `<div class="erfolg-stempi" style="${glut}">${stempi({ stimmung: figur, groesse: 100 })}</div>` : `<div class="erfolg-ico">${icon(ic, 44, 2.4)}</div>`)}
      ${selten === 'gold' || selten === 'silber' ? `<div class="selten-band ${selten}">✦ ${esc(selten === 'gold' ? t('Goldstempel') : t('Silberstempel'))}</div>` : ''}
      <h2>${esc(titel)}</h2>
      <p class="unter">${text}</p>
      ${extra}
      ${fortschritt ? `<div class="erfolg-balken" style="--von:${fortschritt.von};--auf:${fortschritt.auf}"><i></i></div>
        <div class="erfolg-zahlen"><span>${esc(fortschritt.links)}</span><span>${esc(fortschritt.rechts)}</span></div>` : ''}
      ${vorschlag ? `<button class="vorschlag" data-naechster="${esc(vorschlag.o.id)}">
        ${ortBild(vorschlag.o, false)}
        <span style="flex:1;min-width:0"><small>${esc(t('Als Nächstes in der Nähe'))}</small><b>${esc(vorschlag.o.n)}</b><small>${esc(t('{weit} entfernt', { weit: meter(vorschlag.weit) }))}</small></span>${pfeilRechts()}
      </button>` : ''}
      <button class="knopf akzent voll" data-weiter>${esc(knopf || t('Weiter'))}</button>
      ${zweit ? `<button class="knopf voll" data-zweit style="margin-top:8px;background:none;border:0;box-shadow:none;color:var(--text-2)">${esc(zweit)}</button>` : ''}
    </div>`;
  document.body.appendChild(el);
  const zu = (fn) => { el.classList.add('weg'); setTimeout(() => el.remove(), 260); sound.tick(); if (fn) setTimeout(fn, 120); };
  el.querySelector('[data-weiter]').onclick = () => zu(aktion);
  el.querySelector('.erfolg-hg').onclick = () => zu();
  const z = el.querySelector('[data-zweit]'); if (z) z.onclick = () => zu(zweitAktion);
  const n = el.querySelector('[data-naechster]'); if (n) n.onclick = () => zu(() => ortOeffnen(n.dataset.naechster));
  if (!feiern) return;
  setTimeout(() => {
    const k = el.querySelector('.erfolg-stempi, .stufe-kopf, .erfolg-ico');
    const r = k ? k.getBoundingClientRect() : null;
    const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : innerHeight * 0.3;
    fuehlen('erfolg');
    if (feiern === 'gold' || feiern === 'silber') {
      const gold = feiern === 'gold';
      sound.selten(gold);
      glitzer(x, y, gold ? ['#ffd60a', '#ffe17a', '#ffffff', '#ff9f0a'] : ['#ffffff', '#dfe4ea', '#c3cad3', '#9aa3ae']);
      if (gold) konfetti({ farben: ['#ffd60a', '#ffe17a', '#ff9f0a', '#ffffff'], menge: 90, sterne: true });
    } else {
      if (feiern === 'stufe') sound.stufe(); else sound.erfolg();
      konfetti({ sterne: feiern === 'stufe' });
    }
  }, 150);
}

// ---------- Klicks in allen Seiten ----------
$('#ansichten').addEventListener('click', (e) => {
  const st = e.target.closest('[data-stempel]');
  if (st) { e.stopPropagation(); return stempeln(st.dataset.stempel, st); }
  const reise = e.target.closest('[data-reise]');
  if (reise) { aktuell = reise.dataset.reise; tripListeSpeichern(); ui.filter = 'alle'; ui.kartenOrt = null; fuehlen('leicht'); oeffnen({ s: 'reise', trip: aktuell }, 'reisen'); pinsZeichnen(); return; }
  const gk = e.target.closest('[data-guidekap]');
  if (gk) { sound.tick(); return guideStarten(gk.dataset.id, gk.dataset.guidekap); }
  const gs = e.target.closest('[data-satz]');
  if (gs) {
    const id = gs.closest('[data-guide]').dataset.guide;
    guideStarten(id, null); sprecher.start(+gs.dataset.satz); return;
  }
  const rl = e.target.closest('[data-routeleg]');
  if (rl) { const [von, nach] = rl.dataset.routeleg.split('|'); sound.tick(); return routeStarten(nach, von); }
  const rw = e.target.closest('[data-routewahl]');
  if (rw) { sound.tick(); return routeWahlDialog(rw.dataset.routewahl); }
  const rm = e.target.closest('[data-routemodus]');
  if (rm) { if (ui.route.modus !== rm.dataset.routemodus) { sound.tick(); fuehlen('leicht'); } ui.route.modus = rm.dataset.routemodus; return routeBerechnen(); }
  const ra = e.target.closest('[data-reiseansicht]');
  if (ra) { if (ui.reiseAnsicht !== ra.dataset.reiseansicht) { sound.tick(); fuehlen('leicht'); } ui.reiseAnsicht = ra.dataset.reiseansicht; return allesZeichnen(); }
  const pt = e.target.closest('[data-plantag]');
  if (pt) { ui.planTag = +pt.dataset.plantag; sound.tick(); fuehlen('leicht'); return allesZeichnen(); }
  const ep = e.target.closest('[data-einplanen]');
  if (ep) { tagSetzen(ep.dataset.einplanen, ui.planTag); sound.plopp(); fuehlen('leicht'); return; }
  const ol = e.target.closest('[data-ortlink]');
  if (ol) { sound.tick(); return ortOeffnen(ol.dataset.ortlink); }
  const ei = e.target.closest('[data-eintrag]');
  if (ei) { sound.tick(); return eintragAnsehen(ei.dataset.eintrag); }
  const kt = e.target.closest('[data-kartentag]');
  if (kt) { ui.kartenTag = kt.dataset.kartentag === 'alle' ? null : +kt.dataset.kartentag; ui.kartenOrt = null; sound.tick(); fuehlen('leicht'); allesZeichnen(); routeZeichnen(); setTimeout(() => allesZeigen(true), 50); return; }
  const f = e.target.closest('[data-filter]');
  if (f) {
    if (ui.filter !== f.dataset.filter) { sound.tick(); fuehlen('leicht'); }
    ui.filter = f.dataset.filter;
    if (ui.filter === 'naehe' && !pos) standortFragen(false);
    return allesZeichnen();
  }
  const einst = e.target.closest('[data-einst]');
  if (einst) {
    ich[einst.dataset.einst] = einst.dataset.wert; ichSpeichern(); sound.tick(); fuehlen('leicht');
    if (einst.dataset.einst === 'sprache') { sprecher.stop(); sprecher.ortId = null; setzeSprache(ich.sprache); tabLeisteZeichnen(); if (map) karteNeuStylen(); }
    return designAnwenden();
  }
  const ak = e.target.closest('[data-akzent]');
  if (ak) { ich.akzent = ak.dataset.akzent; ichSpeichern(); sound.plopp(); fuehlen('leicht'); return designAnwenden(); }
  const pass = e.target.closest('[data-pass]');
  if (pass) {
    const tid = [...trips.keys()].find((id) => trips.get(id).data.records['p:' + pass.dataset.pass]);
    if (tid) { aktuell = tid; tripListeSpeichern(); tabZeigen('reisen'); ortOeffnen(pass.dataset.pass); }
    return;
  }
  const kk = e.target.closest('.k-karte');
  if (kk && !e.target.closest('button')) {
    if (ui.kartenOrt !== kk.dataset.kid) { sound.tick(); return kartenOrtWaehlen(kk.dataset.kid, true); }
    return ortOeffnen(kk.dataset.kid);
  }
  const a = e.target.closest('[data-aktion]');
  if (a) {
    const was = a.dataset.aktion;
    sound.tick();
    if (was === 'zurueck') return zurueck();
    if (was === 'zumprofil') return tabZeigen('profil');
    if (was === 'bangkok') return bangkokAnlegen();
    if (was === 'neutrip') return neuerTripDialog();
    if (was === 'code') return codeDialog();
    if (was === 'hinzu') return hinzufuegenDialog();
    if (was === 'einladen') return einladenDialog();
    if (was === 'offline') return karteHerunterladen();
    if (was === 'sync') return syncDialog();
    if (was === 'tripmenue') return tripMenue();
    if (was === 'aufkarte') { ui.kartenOrt = null; tabZeigen('karte'); return; }
    if (was === 'ortaufkarte') return ortAufKarte(a.dataset.id);
    if (was === 'ortmenue') return ortMenue(a.dataset.id);
    if (was === 'reisedaten') return reisedatenDialog();
    if (was === 'autoplan') {
      const v = ansicht(aktuell);
      if (v.orte.some((o) => o.tag) && !confirm(t('Den bisherigen Plan neu verteilen? Schon gestempelte Orte bleiben, wo sie sind.'))) return;
      if (!tageAnzahl(v.meta)) return reisedatenDialog();
      return automatischPlanen();
    }
    if (was === 'tagdazu') {
      const v = ansicht(aktuell);
      const m = v.meta;
      const neu = m.von ? { ...m, bis: new Date(new Date((m.bis || m.von) + 'T12:00:00').getTime() + 864e5).toISOString().slice(0, 10) } : { ...m, tage: (m.tage || 0) + 1 };
      schreiben(aktuell, 'meta', neu); ui.planTag = tageAnzahl(neu); sound.plopp(); return;
    }
    if (was === 'tagaufkarte') { ui.kartenTag = ui.planTag; ui.kartenOrt = null; tabZeigen('karte'); routeZeichnen(); setTimeout(() => allesZeigen(true), 80); return; }
    if (was === 'planheute') { const pt2 = planTagFuer(ansicht(aktuell)); const w = wetter[aktuell]; const d = pt2 && pt2(new Date().toLocaleDateString('en-CA', { timeZone: (w && w.tz) || undefined })); ui.reiseAnsicht = 'plan'; if (d) ui.planTag = d.tag; return allesZeichnen(); }
    if (was === 'rueckblick') return rueckblickStarten();
    if (was === 'foto') return eintragDialog(a.dataset.id || null, true);
    if (was === 'notiz') return eintragDialog(a.dataset.id || null, false);
    if (was === 'verorten') return ortVerorten(a.dataset.id);
    if (was === 'routehier') return routeStarten(a.dataset.id);
    if (was === 'routeneu') { if (ui.route) return routeSchliessen(); const v = ansicht(aktuell); ui.route = { von: standardStart(v, null), nach: ui.kartenOrt || null, modus: 'fuss', schritte: false, daten: null }; allesZeichnen(); return ui.route.nach ? routeBerechnen() : routeWahlDialog('nach'); }
    if (was === 'routezu') return routeSchliessen();
    if (was === 'routetausch') { const r = ui.route; [r.von, r.nach] = [r.nach, r.von]; fuehlen('leicht'); return routeBerechnen(); }
    if (was === 'routeschritte') { ui.route.schritte = !ui.route.schritte; return allesZeichnen(); }
    if (was === 'homescreen') return homescreenDialog();
    if (was === 'entdecken') return entdeckenDialog();
    if (was === 'guideplay') return guideStarten(a.dataset.id);
    if (was === 'guidetempo') { sprecher.tempoWechseln(); return allesZeichnen(); }
    if (was === 'guidezurueck') return sprecher.springen(-1);
    if (was === 'guidevor') return sprecher.springen(1);
    if (was === 'ortung') return standortFragen(true);
    if (was === 'alle') return allesZeigen();
    if (was === 'checklistezu') { ich.checklisteZu = true; ichSpeichern(); toast(t('Ausgeblendet – die Einführung findest du im Profil')); return allesZeichnen(); }
    if (was === 'zurreise') { if (!aktuell) return neuerTripDialog(); return oeffnen({ s: 'reise', trip: aktuell }, 'reisen'); }
    if (was === 'zumguide') {
      const v = aktuell && ansicht(aktuell);
      const o = v && (v.orte.find((x) => x.wd && x.k !== 'hotel') || v.orte.find((x) => x.lat != null && x.k !== 'hotel'));
      if (!o) return neuerTripDialog();
      ortOeffnen(o.id);
      return setTimeout(() => toast(t('Tippe beim Audio-Guide auf ▶ – Stempi erzählt los')), 500);
    }
    if (was === 'vorlieben') return vorliebenDialog();
    if (was === 'stimme') return stimmeDialog();
    if (was === 'name') return nameDialog();
    if (was === 'heimat') return heimatDialog();
    if (was === 'einfuehrung') return einfuehrung();
    if (was === 'nachweise') return nachweiseDialog();
    return;
  }
  const karte = e.target.closest('.ort');
  if (karte) { sound.tick(); ortOeffnen(karte.dataset.id); }
});
$('#ansichten').addEventListener('change', (e) => {
  const s = e.target.closest('[data-schalter]');
  if (!s) return;
  if (s.dataset.schalter === 'ton') { tonSetzen(s.checked); sound.tick(); }
  if (s.dataset.schalter === 'vibration') { ich.vibration = s.checked; ichSpeichern(); fuehlen('mittel'); }
});
document.querySelectorAll('.tab-knopf').forEach((b) => { b.onclick = () => tabZeigen(b.dataset.tab); });

// ---------- Modal ----------
let modalZu = null;
function modal(html, nachher) {
  const m = $('#modal');
  const k = $('#modalKarte');
  m.classList.remove('weg');
  k.innerHTML = `<button class="modal-zu" data-zu aria-label="${esc(t('Schließen'))}">${icon('x', 18, 2.2)}</button>` + html;
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
  setTimeout(() => { m.hidden = true; m.classList.remove('weg'); $('#modalKarte').innerHTML = ''; }, 260);
  if (modalZu) { const f = modalZu; modalZu = null; f(); }
}
$('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-zu]')) modalSchliessen(); });

// ---------- Reisen anlegen / beitreten ----------
async function tripAnlegen(nameText, emoji, vorlage) {
  const code = newCode();
  const id = await tripLaden(code);
  aktuell = id;
  tripListeSpeichern();
  sync.watch(id, trips.get(id).keys);
  const meta = { n: nameText, e: emoji || '🗺️', seit: Date.now() };
  if (vorlage) { meta.b = vorlage.bild; meta.ort = vorlage.ort; }
  schreiben(id, 'meta', meta);
  mitgliedEintragen(id);
  if (vorlage) {
    vorlage.orte.forEach(([n, k, lat, lng, notiz, b], i) => {
      const p = { n, k, lat, lng, notiz, o: i };
      if (b) p.b = b;
      schreiben(id, 'p:' + zufall(8), p);
    });
  }
  speichern(id, true);
  ui.filter = 'alle'; ui.kartenOrt = null;
  if (ui.tab !== 'reisen') tabZeigen('reisen');
  while (ui.stapel.reisen.length > 1) zurueck('reisen', true);
  oeffnen({ s: 'reise', trip: id }, 'reisen');
  allesZeichnen();
  return id;
}

async function bangkokAnlegen() {
  await tripAnlegen(BANGKOK.name, BANGKOK.emoji, BANGKOK);
  setTimeout(() => {
    sound.erfolg(); fuehlen('erfolg'); konfetti();
    erfolg({
      icon: 'funken', titel: t('Eure Reise ist bereit'),
      text: esc(t('{n} Orte stehen auf der Karte. Hol jetzt die Familie dazu – dann seht ihr alle dieselben Stempel.', { n: BANGKOK.orte.length })),
      knopf: t('Familie einladen'), aktion: () => einladenDialog(), zweit: t('Später'),
    });
  }, 700);
}

async function tripBeitreten(code) {
  const id = await tripLaden(code);
  const neu = !trips.get(id).data.records.meta;
  aktuell = id;
  tripListeSpeichern();
  sync.watch(id, trips.get(id).keys);
  mitgliedEintragen(id);
  speichern(id, true);
  ui.filter = 'alle'; ui.kartenOrt = null;
  if (ui.tab !== 'reisen') tabZeigen('reisen');
  while (ui.stapel.reisen.length > 1) zurueck('reisen', true);
  oeffnen({ s: 'reise', trip: id }, 'reisen');
  let n = 0;
  const warten = setInterval(() => {
    const v = ansicht(id);
    if ((v && v.meta && v.orte.length) || ++n > 60) {
      clearInterval(warten);
      if (!v || !v.orte.length || !neu) return;
      sound.erfolg(); fuehlen('erfolg'); konfetti();
      erfolg({
        icon: 'leute', titel: t('Willkommen in der Reise!'),
        text: esc(t('„{reise}“ · {n} Orte · dabei: {wer}', { reise: v.meta.n, n: v.orte.length, wer: v.leute.map((l) => l.n).join(', ') })),
        knopf: offlineKarte ? t('Los geht’s') : t('Karte offline speichern · {mb} MB', { mb: REGION.mb }),
        aktion: offlineKarte ? null : karteHerunterladen,
        zweit: offlineKarte ? null : t('Später'),
      });
    }
  }, 500);
  return id;
}

function mitgliedEintragen(id) {
  const tr = trips.get(id);
  const alt = tr && tr.data.records['m:' + ich.id];
  if (!alt || alt.v.n !== ich.name || alt.v.c !== ich.farbe) schreiben(id, 'm:' + ich.id, { n: ich.name, c: ich.farbe });
}

function tripWechseln(id) {
  aktuell = id;
  tripListeSpeichern();
  ui.filter = 'alle'; ui.kartenOrt = null;
  const st = ui.stapel.reisen;
  if (st.length > 1) { while (st.length > 2) zurueck('reisen', true); st[1].trip = id; }
  while (ui.stapel.karte.length > 1) zurueck('karte', true);
  allesZeichnen();
  if (ui.tab === 'karte') allesZeigen();
}

function tripEntfernen(id) {
  sync.unwatch(id);
  trips.delete(id);
  LS.del('sp.trip.' + id);
  idbLoeschenPraefix(id + '|').catch(() => {});
  if (aktuell === id) aktuell = trips.size ? [...trips.keys()][0] : null;
  tripListeSpeichern();
  while (ui.stapel.reisen.length > 1) zurueck('reisen', true);
  while (ui.stapel.karte.length > 1) zurueck('karte', true);
  if (ui.tab !== 'reisen') tabZeigen('reisen');
  allesZeichnen();
}

// ---------- Dialoge ----------
function codeDialog() {
  const k = modal(`
    <h2>${esc(t('Mit Code beitreten'))}</h2>
    <p class="lead">${esc(t('Den Code bekommst du von jemandem, der die Reise schon hat (Einladen).'))}</p>
    <label class="feld"><input class="eingabe code-eingabe" id="cCode" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16"></label>
    <div class="knopf-reihe">
      <button class="knopf voll akzent" id="cOk">${esc(t('Beitreten'))}</button>
      ${navigator.clipboard && navigator.clipboard.readText ? `<button class="knopf voll" id="cEinf">${icon('kopie', 19)} ${esc(t('Aus Zwischenablage einfügen'))}</button>` : ''}
    </div>`);
  const feld = k.querySelector('#cCode');
  const los = async () => {
    const c = normCode(feld.value);
    if (!c) { fuehlen('weg'); return toast(t('Der Code hat 12 Zeichen, z. B. AB3D-EF7H-JK9M')); }
    const vorher = trips.size;
    modalSchliessen();
    await tripBeitreten(c);
    toast(trips.size > vorher ? t('Beigetreten – lade Orte …') : t('Diese Reise hast du schon'));
  };
  k.querySelector('#cOk').onclick = los;
  feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') los(); });
  const einf = k.querySelector('#cEinf');
  if (einf) einf.onclick = async () => {
    try {
      const txt = await navigator.clipboard.readText();
      const m = txt.match(/[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}/);
      if (m) feld.value = normCode(m[0]) || m[0]; else toast(t('Kein Code in der Zwischenablage'));
    } catch { toast(t('Einfügen nicht erlaubt – bitte tippen')); }
  };
  setTimeout(() => feld.focus(), 350);
}

// ---------- Neue Reise: Ziel weltweit wählen ----------
function neuerTripDialog() {
  const hatBangkok = [...trips.keys()].some((id) => /bangkok/i.test(ansicht(id).meta?.n || ''));
  const k = modal(`
    <h2>${esc(t('Wohin geht die Reise?'))}</h2>
    <p class="lead">${esc(t('Stadt, Region oder Land – weltweit. Die bekanntesten Sehenswürdigkeiten schlagen wir dir gleich vor.'))}</p>
    <input class="eingabe" id="zSuche" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(t('z. B. Lissabon, Japan, Toskana'))}">
    <div class="ort-vorschlaege" id="zListe"></div>
    <div class="knopf-reihe">
      ${hatBangkok ? '' : `<button class="knopf regenbogen voll" id="nBkk">🇹🇭 ${esc(t('Bangkok-Reise vom Zettel'))}</button>`}
      <button class="knopf voll" id="zLeer">${icon('plus', 19)} ${esc(t('Ohne Ziel anlegen'))}</button>
    </div>`);
  const feld = k.querySelector('#zSuche'), liste = k.querySelector('#zListe');
  let treffer = [], timer, nr = 0;
  const typName = (typ) => ({ country: t('Land'), state: t('Region'), city: t('Stadt'), district: t('Stadtteil'), locality: t('Ort') })[typ] || '';
  const los = async () => {
    const q = feld.value.trim();
    if (q.length < 2) return;
    const meine = ++nr;
    liste.innerHTML = `<p class="klein">${esc(t('Suche …'))}</p>`;
    try { treffer = await zieleSuchen(q, ich.sprache); } catch { treffer = []; }
    if (meine !== nr) return;
    liste.innerHTML = treffer.map((z, i) => `<button class="glas" data-ziel="${i}"><span class="flagge">${flagge(z.cc) || '🗺️'}</span><span style="min-width:0"><b>${esc(z.n)}</b><small>${esc([typName(z.typ), z.typ === 'country' ? '' : z.region, z.typ === 'country' ? '' : z.land].filter(Boolean).join(' · '))}</small></span></button>`).join('')
      || `<p class="klein">${esc(navigator.onLine ? t('Nichts gefunden.') : t('Dafür braucht es Internet.'))}</p>`;
  };
  feld.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(los, 400); });
  feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); los(); } });
  liste.onclick = (e) => { const b = e.target.closest('[data-ziel]'); if (b) { sound.tick(); zielDialog(treffer[+b.dataset.ziel]); } };
  const bkk = k.querySelector('#nBkk');
  if (bkk) bkk.onclick = () => { modalSchliessen(); bangkokAnlegen(); };
  k.querySelector('#zLeer').onclick = () => leereReiseDialog();
  setTimeout(() => feld.focus(), 350);
}

function leereReiseDialog() {
  const emojis = ['🏝️', '🏔️', '🏙️', '🚗', '⛺', '🎿', '🏖️', '🚂'];
  let wahl = emojis[0];
  const k = modal(`
    <h2>${esc(t('Neue Reise'))}</h2>
    <label class="feld"><span>${esc(t('Name'))}</span><input class="eingabe" id="nName" placeholder="${esc(t('z. B. Japan 2027'))}"></label>
    <div class="kat-wahl" id="nEmo">${emojis.map((e, i) => `<button data-e="${e}" class="${i ? '' : 'an'}" style="font-size:20px;padding:0 10px">${e}</button>`).join('')}</div>
    <div class="knopf-reihe"><button class="knopf voll akzent" id="nOk">${esc(t('Reise anlegen'))}</button></div>`);
  k.querySelector('#nEmo').onclick = (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    wahl = b.dataset.e; sound.tick();
    k.querySelectorAll('#nEmo button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#nOk').onclick = async () => {
    const n = k.querySelector('#nName').value.trim();
    if (!n) return toast(t('Gib der Reise einen Namen'));
    modalSchliessen();
    await tripAnlegen(n.slice(0, 40), wahl);
    sound.plopp();
    setTimeout(() => hinzufuegenDialog('suchen'), 500);
  };
}

// Liste der vorgeschlagenen Sehenswürdigkeiten mit Häkchen
function sehenswertListe(liste, vorausgewaehlt) {
  // "Passt zu dir" nur, wenn es etwas unterscheidet (in Kyoto ist fast alles Tempel)
  const passend = liste.filter((s) => passtZu(s.k, ich.interessen)).length;
  const markieren = passend && passend <= liste.length * 0.6;
  return liste.map((s, i) => `<label class="sw-zeile">
    <input type="checkbox" class="sw-haken" data-sw="${i}" ${i < vorausgewaehlt ? 'checked' : ''}>
    ${s.bf ? `<img src="${bildFuerOrt({ bf: s.bf }, 'klein')}" alt="" loading="lazy">` : katKachel(s.k, 22, 'sw-ico')}
    <span style="min-width:0"><b>${esc(s.n)}${markieren && passtZu(s.k, ich.interessen) ? `<span class="passt">${esc(t('Passt zu dir'))}</span>` : ''}</b><small>${esc(s.info || kat(s.k).name)}</small></span>
    <span class="sw-mark">${icon('haken', 15, 3)}</span>
  </label>`).join('');
}

async function zielDialog(ziel) {
  const k = modal(`
    <div class="ziel-kopf" id="zKopf"><div class="cover-verlauf" style="background:${verlauf(ziel.n)}">${flagge(ziel.cc) || '🗺️'}</div>
      <div class="ziel-titel"><span class="chip-glas">${flagge(ziel.cc)} ${esc(ziel.land || ziel.n)}</span><h2>${esc(ziel.n)}</h2></div></div>
    <p class="klein" id="zText"></p>
    <div class="zwei">
      <label class="feld"><span>${esc(t('Von'))}</span><input class="eingabe" type="date" id="zVon"></label>
      <label class="feld"><span>${esc(t('Bis'))}</span><input class="eingabe" type="date" id="zBis"></label>
    </div>
    <div class="abschnitt" style="margin-top:6px">${esc(t('Top-Sehenswürdigkeiten'))}</div>
    <div id="zSw"><div class="leer-hinweis">${icon('sync', 26)}${esc(t('Suche die bekanntesten Orte …'))}</div></div>
    <div class="knopf-reihe" style="position:sticky;bottom:0"><button class="knopf voll akzent" id="zOk" disabled>${esc(t('Reise anlegen'))}</button></div>`);
  const info = zielInfo(ziel.n, ich.sprache).catch(() => ({}));
  let liste = [];
  try { liste = await sehenswuerdigkeiten(ziel.lat, ziel.lng, ziel.radius, ich.sprache); } catch { liste = []; }
  const i = await info;
  if (!k.isConnected) return;
  // Länder: Satellitenbilder und Karten taugen nicht als Titelbild – dann das Foto der bekanntesten Sehenswürdigkeit
  let titelDatei = i.bf;
  if (!titelDatei || ziel.typ === 'country' || /satellit|map|karte|flag|locator|lage/i.test(titelDatei)) titelDatei = (liste.find((s) => s.bf) || {}).bf || titelDatei;
  if (titelDatei) k.querySelector('#zKopf').insertAdjacentHTML('afterbegin', `<img src="${bildFuerTrip({ bf: titelDatei })}" alt="">`);
  k.querySelector('#zText').textContent = (i.text || '').split(/(?<=\.)\s/).slice(0, 2).join(' ');
  const sw = k.querySelector('#zSw');
  // Personalisiert: passende Orte nach vorne, Vorauswahl nach Reisetempo und Reisedauer
  liste = nachInteressen(liste, ich.interessen);
  const was = interessenText(ich, t);
  sw.innerHTML = liste.length
    ? (was ? `<p class="klein" style="display:flex;gap:7px;align-items:flex-start;margin:0 0 8px">${icon('funken', 15)}<span>${esc(t('Vorausgewählt nach deinen Interessen: {was}', { was }))}</span></p>` : '') + sehenswertListe(liste, 12)
    : `<p class="klein">${esc(t('Keine Vorschläge gefunden – du kannst Orte danach selbst hinzufügen.'))}</p>`;
  const ok = k.querySelector('#zOk');
  const zaehlen = () => { const n = sw.querySelectorAll('.sw-haken:checked').length; ok.disabled = false; ok.textContent = n ? t('Reise mit {n} Orten anlegen', { n }) : t('Reise anlegen'); };
  let angefasst = false;
  sw.addEventListener('change', () => { angefasst = true; sound.tick(); fuehlen('leicht'); zaehlen(); });
  // Sobald die Reisedauer feststeht: so viele Orte vorauswählen, wie zum Tempo passen (solange nichts von Hand geändert wurde)
  const nachDauer = () => {
    const von = k.querySelector('#zVon').value, bis = k.querySelector('#zBis').value;
    if (angefasst || !von || !liste.length) return;
    const tage = tageAnzahl({ von, bis: bis || von });
    const n = Math.max(4, Math.min(liste.length, tage * orteProTag(ich.tempo)));
    sw.querySelectorAll('.sw-haken').forEach((c) => { c.checked = +c.dataset.sw < n; });
    zaehlen();
  };
  k.querySelector('#zVon').addEventListener('change', nachDauer);
  k.querySelector('#zBis').addEventListener('change', nachDauer);
  nachDauer();
  zaehlen();
  ok.onclick = async () => {
    const auswahl = [...sw.querySelectorAll('.sw-haken:checked')].map((c) => liste[+c.dataset.sw]);
    const von = k.querySelector('#zVon').value || null, bis = k.querySelector('#zBis').value || null;
    modalSchliessen();
    const id = await tripAnlegen(ziel.n, flagge(ziel.cc) || '🗺️');
    const v = ansicht(id);
    schreiben(id, 'meta', { ...v.meta, ort: { lat: ziel.lat, lng: ziel.lng }, radius: ziel.radius, cc: ziel.cc, land: ziel.land, bf: titelDatei || null, von, bis: von ? (bis || von) : null });
    auswahl.forEach((s, n) => schreiben(id, 'p:' + zufall(8), { n: s.n, nl: s.nl, k: s.k, lat: s.lat, lng: s.lng, wd: s.wd, bf: s.bf, o: n }));
    if (von && auswahl.length) setTimeout(automatischPlanen, 300);
    sound.erfolg(); fuehlen('erfolg'); konfetti();
    setTimeout(() => erfolg({
      icon: 'funken', titel: t('Auf nach {ziel}!', { ziel: ziel.n }),
      text: esc(auswahl.length ? t('{n} Sehenswürdigkeiten sind auf der Karte – jede mit Audio-Guide. Hol jetzt deine Mitreisenden dazu.', { n: auswahl.length }) : t('Füg jetzt deine ersten Orte hinzu.')),
      knopf: t('Mitreisende einladen'), aktion: () => einladenDialog(), zweit: t('Später'),
    }), 600);
  };
}

// Weitere Sehenswürdigkeiten zu einer bestehenden Reise
async function entdeckenDialog() {
  const v = ansicht(aktuell);
  const mitte = tripMitte(v);
  if (!mitte) return toast(t('Leg zuerst einen Ort an oder wähle ein Ziel'));
  const k = modal(`
    <h2>${esc(t('Sehenswürdigkeiten entdecken'))}</h2>
    <p class="lead">${esc(t('Die bekanntesten Orte rund um {ziel} – sortiert danach, wie berühmt sie weltweit sind.', { ziel: v.meta.n }))}</p>
    <div id="eSw"><div class="leer-hinweis">${icon('sync', 26)}${esc(t('Suche die bekanntesten Orte …'))}</div></div>
    <div class="knopf-reihe" style="position:sticky;bottom:0"><button class="knopf voll akzent" id="eOk" disabled>${esc(t('Hinzufügen'))}</button></div>`);
  let liste = [];
  try { liste = await sehenswuerdigkeiten(mitte.lat, mitte.lng, v.meta.radius || 12, ich.sprache); } catch {}
  if (!k.isConnected) return;
  // Schon vorhandene Orte weglassen (gleiche Wikidata-ID oder sehr nah mit ähnlichem Namen)
  liste = nachInteressen(liste.filter((s) => !v.orte.some((o) => o.wd === s.wd || (o.lat != null && abstand(o, s) < 150))), ich.interessen);
  const sw = k.querySelector('#eSw');
  sw.innerHTML = liste.length ? sehenswertListe(liste, 0) : `<p class="klein">${esc(navigator.onLine ? t('Ihr habt die bekanntesten Orte schon alle!') : t('Dafür braucht es Internet.'))}</p>`;
  const ok = k.querySelector('#eOk');
  sw.addEventListener('change', () => { const n = sw.querySelectorAll('.sw-haken:checked').length; ok.disabled = !n; ok.textContent = n ? t('{n} Orte hinzufügen', { n }) : t('Hinzufügen'); sound.tick(); });
  ok.onclick = () => {
    let o = naechsteOrdnung();
    const auswahl = [...sw.querySelectorAll('.sw-haken:checked')].map((c) => liste[+c.dataset.sw]);
    auswahl.forEach((s) => schreiben(aktuell, 'p:' + zufall(8), { n: s.n, nl: s.nl, k: s.k, lat: s.lat, lng: s.lng, wd: s.wd, bf: s.bf, o: o++ }));
    modalSchliessen(); sound.plopp(); fuehlen('mittel');
    toast(t('{n} Orte hinzugefügt', { n: auswahl.length }));
  };
}

// ---------- Audio-Guide ----------
const guides = new Map(); // Orts-ID -> { status: 'laedt' | 'fertig' | 'fehlt', guide }
const sprecher = new Sprecher(() => guideAnzeigen(), (lang) => (ich.stimmen || {})[lang] || null);

function guideFuer(o) {
  const schl = o.id + '.' + ich.sprache;
  let z = guides.get(schl);
  if (!z) {
    z = { status: 'laedt' };
    guides.set(schl, z);
    guideLaden({ ...o, wiki: o.wiki || wikiFuerOrt(o) }, ich.sprache, t)
      .then((g) => { z.status = g ? 'fertig' : 'fehlt'; z.guide = g; })
      .catch(() => { z.status = navigator.onLine ? 'fehlt' : 'offline'; guides.delete(schl); })
      .finally(() => neuZeichnen());
  }
  return z;
}

const KAPITEL_NAME = { ueberblick: 'Überblick', geschichte: 'Geschichte', architektur: 'Architektur', legenden: 'Legenden', fakten: 'Fun Facts' };

function guideHtml(o) {
  if (!('speechSynthesis' in window)) return '';
  const z = guideFuer(o);
  if (z.status === 'laedt') return `<div class="guide glas"><div class="guide-kopf"><span class="guide-ico">${icon('kopfhoerer', 22)}</span><span><b>${esc(t('Audio-Guide'))}</b><small>${esc(t('Wird vorbereitet …'))}</small></span></div></div>`;
  if (z.status !== 'fertig') return `<div class="guide glas leer"><div class="guide-kopf"><span class="guide-ico aus">${icon('kopfhoerer', 22)}</span><span><b>${esc(t('Audio-Guide'))}</b><small>${esc(z.status === 'offline' ? t('Braucht beim ersten Mal Internet.') : t('Zu diesem Ort gibt es noch keine Geschichte.'))}</small></span></div></div>`;
  const g = z.guide;
  const aktiv = sprecher.ortId === o.id;
  const laeuft = aktiv && sprecher.laeuft;
  const i = aktiv ? sprecher.i : -1;
  let n = 0;
  const kapitel = g.kapitel.map((k) => `<div class="guide-kapitel" data-kap="${k.id}"><div class="abschnitt">${esc(t(KAPITEL_NAME[k.id]))}</div><p>${k.saetze.map((s) => `<span class="satz ${n === i ? 'an' : ''}" data-satz="${n++}">${esc(s)}</span>`).join(' ')}</p></div>`).join('');
  return `<div class="guide glas ${laeuft ? 'laeuft' : ''}" data-guide="${esc(o.id)}">
    <div class="guide-kopf">
      <button class="guide-play" data-aktion="guideplay" data-id="${esc(o.id)}" aria-label="${esc(laeuft ? t('Pause') : t('Abspielen'))}">${icon(laeuft ? 'pauseIc' : 'play', 24, 2.4)}</button>
      <span style="min-width:0;flex:1"><b>${esc(t('Audio-Guide'))}</b><small>${esc(t('ca. {n} Min', { n: Math.max(1, Math.round(g.sekunden / 60 / sprecher.tempo)) }))}${g.fremdsprache ? ' · ' + esc(t('nur auf Englisch verfügbar')) : ''}</small></span>
      ${stempi({ groesse: 42, kopfhoerer: true, titel: t('Stempi erzählt') })}
      <button class="chip" data-aktion="guidetempo">${String(sprecher.tempo).replace('.', ',')}×</button>
    </div>
    <div class="guide-wellen" aria-hidden="true">${'<i></i>'.repeat(24)}</div>
    <div class="guide-steuer">
      <button class="kreisknopf" data-aktion="guidezurueck" aria-label="${esc(t('Zurück'))}">${icon('zurueck', 18, 2.4)}</button>
      <div class="guide-chips">${g.kapitel.map((k) => `<button class="chip ${aktiv && sprecher.liste[i] && sprecher.liste[i].kapitel === k.id ? 'akzent' : ''}" data-guidekap="${k.id}" data-id="${esc(o.id)}">${esc(t(KAPITEL_NAME[k.id]))}</button>`).join('')}</div>
      <button class="kreisknopf" data-aktion="guidevor" aria-label="${esc(t('Weiter'))}">${pfeilRechts(18)}</button>
    </div>
    <div class="guide-text">${kapitel}</div>
    <a class="klein guide-quelle" href="${esc(g.quelle)}" target="_blank" rel="noopener">${esc(t('Text: Wikipedia ({titel}), CC BY-SA', { titel: g.titel }))}</a>
  </div>`;
}

// Zustand des Vorlesens in der sichtbaren Seite und im Mini-Player nachziehen, ohne die Seite neu zu bauen
function guideAnzeigen() {
  document.querySelectorAll('.satz.an').forEach((s) => s.classList.remove('an'));
  const g = document.querySelector(`.guide[data-guide="${CSS.escape(sprecher.ortId || '')}"]`);
  if (g) {
    g.classList.toggle('laeuft', sprecher.laeuft);
    const s = g.querySelector(`[data-satz="${sprecher.i}"]`);
    if (s) { s.classList.add('an'); if (sprecher.laeuft) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    const p = g.querySelector('.guide-play');
    if (p) p.innerHTML = icon(sprecher.laeuft ? 'pauseIc' : 'play', 24, 2.4);
    const kap = sprecher.liste[sprecher.i] && sprecher.liste[sprecher.i].kapitel;
    g.querySelectorAll('[data-guidekap]').forEach((c) => c.classList.toggle('akzent', c.dataset.guidekap === kap));
  }
  miniPlayer();
}

function miniPlayer() {
  let el = $('#miniplayer');
  const v = ansicht(aktuell);
  const o = v && sprecher.ortId && v.orte.find((x) => x.id === sprecher.ortId);
  const st = ui.stapel[ui.tab];
  const aufSeite = st[st.length - 1].s === 'ort' && st[st.length - 1].ort === sprecher.ortId;
  if (!o || (!sprecher.laeuft && !sprecher.i) || aufSeite) { if (el) el.hidden = true; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'miniplayer'; el.className = 'miniplayer glas-dicht';
    document.body.appendChild(el);
    el.onclick = (e) => {
      if (e.target.closest('[data-mini="play"]')) { sprecher.umschalten(); return; }
      if (e.target.closest('[data-mini="zu"]')) { sprecher.stop(); sprecher.i = 0; miniPlayer(); return; }
      ortOeffnen(sprecher.ortId);
    };
  }
  el.hidden = false;
  const kap = sprecher.liste[sprecher.i] ? t(KAPITEL_NAME[sprecher.liste[sprecher.i].kapitel]) : '';
  el.innerHTML = `${ortBild(o, false)}<span class="mp-text"><b>${esc(o.n)}</b><small>${esc(t('Audio-Guide'))} · ${esc(kap)}</small></span>
    <button class="kreisknopf" data-mini="play" aria-label="${esc(t('Abspielen'))}">${icon(sprecher.laeuft ? 'pauseIc' : 'play', 20, 2.4)}</button>
    <button class="kreisknopf" data-mini="zu" aria-label="${esc(t('Schließen'))}">${icon('x', 16, 2.4)}</button>`;
}

function guideStarten(id, kapitel) {
  const v = ansicht(aktuell);
  const o = v.orte.find((x) => x.id === id);
  const z = o && guides.get(id + '.' + ich.sprache);
  if (!z || !z.guide) return;
  if (sprecher.ortId !== id || sprecher.guide !== z.guide) sprecher.laden(id, z.guide);
  if (kapitel) sprecher.kapitel(kapitel); else sprecher.umschalten();
  fuehlen('leicht');
  if (sprecher.laeuft) schrittErledigt('guide');
}

// Alle Guides einer Reise vorab laden, damit sie offline funktionieren
async function guidesOfflineLaden(knopf) {
  const v = ansicht(aktuell);
  const orte = v.orte.filter((o) => o.lat != null || o.wd);
  let n = 0;
  for (const o of orte) {
    knopf.textContent = t('Lade Audio-Guides … {n}/{m}', { n: ++n, m: orte.length });
    const z = guideFuer(o);
    for (let i = 0; i < 40 && z.status === 'laedt'; i++) await new Promise((r) => setTimeout(r, 250));
  }
  const fertig = orte.filter((o) => (guides.get(o.id + '.' + ich.sprache) || {}).status === 'fertig').length;
  knopf.textContent = t('{n} Audio-Guides offline gespeichert ✓', { n: fertig });
  sound.erfolg();
}

function tripMenue() {
  const zeilen = [...trips.entries()].map(([id]) => {
    const v = ansicht(id);
    const cover = bildFuerTrip(v.meta);
    return `<li class="${id === aktuell ? 'an' : ''}">
      <button class="wahl" data-wahl="${id}"><span class="t-emo" style="${cover ? '' : `background:${verlauf(id)}`}">${cover ? `<img src="${cover}" alt="">` : esc(v.meta ? v.meta.e : '⏳')}</span>
        <span style="min-width:0"><b>${esc(v.meta ? v.meta.n : t('Wird geladen …'))}</b><small>${esc(t('{e} von {n} gestempelt', { e: v.erledigt, n: v.orte.length }))}</small></span></button>
      <button class="weg" data-weg="${id}" aria-label="${esc(t('Vom Handy entfernen'))}">${icon('muell', 19)}</button>
    </li>`;
  }).join('');
  const k = modal(`
    <h2>${esc(t('Deine Reisen'))}</h2>
    <p class="lead">${esc(t('Reisen bleiben auf diesem Handy gespeichert, bis du sie hier entfernst.'))}</p>
    <ul class="trip-liste">${zeilen}</ul>
    <div class="knopf-reihe" style="margin-top:0">
      <button class="knopf voll akzent" id="mEinladen">${icon('leute', 20)} ${esc(t('Familie einladen'))}</button>
      <div class="knopf-paar"><button class="knopf" id="mNeu">${icon('plus', 20)} ${esc(t('Neue Reise'))}</button><button class="knopf" id="mCode">${icon('code', 20)} ${esc(t('Code'))}</button></div>
      ${installEvent ? `<button class="knopf voll" id="mInstall">${icon('wolke', 20)} ${esc(t('Als App installieren'))}</button>` : ''}
    </div>`);
  k.onclick = (e) => {
    const w = e.target.closest('[data-wahl]');
    if (w) { sound.tick(); modalSchliessen(); tripWechseln(w.dataset.wahl); return; }
    const weg = e.target.closest('[data-weg]');
    if (weg) {
      const v = ansicht(weg.dataset.weg);
      if (confirm(t('„{reise}“ von diesem Handy entfernen?\n\nBei den anderen bleibt sie erhalten. Mit dem Code kannst du jederzeit wieder beitreten.', { reise: v.meta ? v.meta.n : '' }))) {
        sound.weg(); modalSchliessen();
        tripEntfernen(weg.dataset.weg);
      }
    }
  };
  k.querySelector('#mEinladen').onclick = () => einladenDialog();
  k.querySelector('#mNeu').onclick = () => neuerTripDialog();
  k.querySelector('#mCode').onclick = () => codeDialog();
  const inst = k.querySelector('#mInstall');
  if (inst) inst.onclick = async () => { modalSchliessen(); installEvent.prompt(); installEvent = null; };
}

function nameDialog() {
  let farbe = ich.farbe;
  const k = modal(`
    <h2>${esc(t('Name & Farbe'))}</h2>
    <p class="lead">${esc(t('So sehen die anderen, wer etwas abgestempelt hat.'))}</p>
    <span class="avatar ring avatar-vorschau" id="dAv" style="background:${esc(farbe)}">${esc((ich.name || '?').slice(0, 1).toUpperCase())}</span>
    <label class="feld"><input class="eingabe" id="dName" value="${esc(ich.name)}"></label>
    <div class="farben" id="dFarben" style="justify-content:center;margin:6px 0 4px">${FARBEN.map((f) => `<button class="${f === farbe ? 'an' : ''}" data-f="${f}" style="--f:${f}"></button>`).join('')}</div>
    <div class="knopf-reihe"><button class="knopf voll akzent" id="dOk">${esc(t('Speichern'))}</button></div>`);
  const feld = k.querySelector('#dName'), av = k.querySelector('#dAv');
  feld.oninput = () => { av.textContent = (feld.value.trim() || '?').slice(0, 1).toUpperCase(); };
  k.querySelector('#dFarben').onclick = (e) => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    farbe = b.dataset.f; av.style.background = farbe; sound.tick(); fuehlen('leicht');
    k.querySelectorAll('#dFarben button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#dOk').onclick = () => {
    const n = feld.value.trim();
    if (!n) return;
    ich.name = n.slice(0, 24); ich.farbe = farbe; ichSpeichern();
    trips.forEach((_, id) => mitgliedEintragen(id));
    sound.plopp();
    modalSchliessen();
    neuZeichnen();
  };
}

// Heimatort über die Open-Meteo-Ortssuche (kostenlos, ohne Schlüssel, liefert auch die Zeitzone)
export async function orteSuchen(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&language=${ich.sprache}&name=${encodeURIComponent(q)}`);
  const j = await r.json();
  return (j.results || []).map((x) => ({ name: x.name, land: x.country || '', region: x.admin1 || '', cc: x.country_code, lat: x.latitude, lng: x.longitude, tz: x.timezone }));
}

function heimatDialog() {
  const k = modal(`
    <h2>${esc(t('Heimatort'))}</h2>
    <p class="lead">${esc(t('Damit siehst du, wie spät es zuhause ist und wie weit ihr weg seid.'))}</p>
    <input class="eingabe" id="hOrt" placeholder="${esc(t('z. B. Wien'))}" autocomplete="off" value="${esc(ich.heimat ? ich.heimat.name : '')}">
    <div class="ort-vorschlaege" id="hListe"></div>`);
  const feld = k.querySelector('#hOrt'), liste = k.querySelector('#hListe');
  let timer, treffer = [];
  feld.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (feld.value.trim().length < 2) return;
      try { treffer = await orteSuchen(feld.value.trim()); } catch { treffer = []; }
      liste.innerHTML = treffer.map((x, i) => `<button class="glas" data-i="${i}"><span class="flagge">${flagge(x.cc)}</span><span><b>${esc(x.name)}</b><small>${esc([x.region, x.land].filter(Boolean).join(', '))}</small></span></button>`).join('') || `<p class="klein">${esc(t('Nichts gefunden.'))}</p>`;
    }, 350);
  };
  liste.onclick = (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    ich.heimat = treffer[+b.dataset.i]; ichSpeichern();
    sound.plopp(); fuehlen('leicht');
    modalSchliessen(); neuZeichnen();
  };
  setTimeout(() => feld.focus(), 350);
}

function einladeLink(code) { return abs('./') + '#code=' + code; }

function einladenDialog() {
  const tr = trips.get(aktuell);
  if (!tr) return;
  schrittErledigt('einladen');
  const v = ansicht(aktuell);
  const link = einladeLink(tr.code);
  let qrSvg = '';
  try { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); qrSvg = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch {}
  const k = modal(`
    <h2>${esc(t('Familie einladen'))}</h2>
    <p class="lead">${esc(t('Scannen, Link schicken oder Code abtippen. Wer dabei ist, sieht alle Orte und Stempel live.'))}</p>
    <div class="qr">${qrSvg}</div>
    <div class="code-gross">${esc(tr.code)}</div>
    <p class="klein" style="text-align:center;margin:0">${esc(t('Code für „{reise}“', { reise: v.meta ? v.meta.n : '' }))}</p>
    <div class="knopf-reihe">
      ${navigator.share ? `<button class="knopf voll akzent" id="eTeilen">${icon('teilen', 20)} ${esc(t('Link senden (WhatsApp …)'))}</button>` : ''}
      <button class="knopf voll ${navigator.share ? '' : 'akzent'}" id="eKopie">${icon('kopie', 20)} ${esc(t('Link kopieren'))}</button>
    </div>
    <p class="klein" style="margin-top:14px">${esc(t('Am iPhone: Link in Safari öffnen, „Zum Home-Bildschirm“ wählen und in der App „Mit Code beitreten“ – der Code steht auch in der Nachricht.'))}</p>`);
  const text = t('Komm in unsere Reise „{reise}“ im Stempelpass! 🗺️\n{link}\n\nCode: {code}', { reise: v.meta ? v.meta.n : '', link, code: tr.code });
  const te = k.querySelector('#eTeilen');
  if (te) te.onclick = async () => { try { await navigator.share({ title: 'Stempelpass', text }); } catch {} };
  k.querySelector('#eKopie').onclick = async () => {
    try { await navigator.clipboard.writeText(text); sound.plopp(); fuehlen('leicht'); toast(t('Kopiert – jetzt in WhatsApp einfügen')); } catch { toast(t('Kopieren nicht möglich')); }
  };
}

function syncDialog() {
  const v = ansicht(aktuell);
  const mitglieder = v ? v.leute.map((l) => esc(l.n) + (l.id === ich.id ? ` (${esc(t('du'))})` : '')).join(', ') : '–';
  modal(`
    <h2>${esc(t('Sync & Offline'))}</h2>
    <p class="lead">${esc(sync.online ? t('Verbunden – Stempel kommen live bei allen an.') : t('Gerade offline. Alles wird auf dem Handy gespeichert und automatisch abgeglichen, sobald wieder Internet da ist.'))}</p>
    <div class="info-zeile"><span>${esc(t('Sync-Server verbunden'))}</span><span>${sync.online} / ${sync.relays.length}</span></div>
    <div class="info-zeile"><span>${esc(t('Noch nicht hochgeladen'))}</span><span>${v ? v.ausstehend : 0}</span></div>
    <div class="info-zeile"><span>${esc(t('Offline-Karte Bangkok'))}</span><span>${esc(offlineKarte ? t('gespeichert ✓') : t('nicht gespeichert'))}</span></div>
    <div class="info-zeile"><span>${esc(t('Dabei'))}</span><span>${mitglieder || '–'}</span></div>
    <p class="klein" style="margin-top:14px">${esc(t('Eure Daten liegen Ende-zu-Ende-verschlüsselt auf mehreren öffentlichen Nostr-Relays. Ohne den Code kann niemand sie lesen.'))}</p>
    <div class="knopf-reihe">
      ${offlineKarte ? '' : `<button class="knopf voll akzent" id="sKarte">${icon('wolke', 20)} ${esc(t('Offline-Karte laden ({mb} MB)', { mb: REGION.mb }))}</button>`}
      ${'speechSynthesis' in window && v ? `<button class="knopf voll" id="sGuides">${icon('kopfhoerer', 20)} ${esc(t('Audio-Guides offline speichern'))}</button>` : ''}
    </div>`,
  (k) => {
    const b = k.querySelector('#sKarte'); if (b) b.onclick = () => { modalSchliessen(); karteHerunterladen(); };
    const g = k.querySelector('#sGuides'); if (g) g.onclick = () => { g.disabled = true; guidesOfflineLaden(g); };
  });
}

async function nachweiseDialog() {
  let n = {};
  try { n = await (await fetch('bilder/nachweise.json')).json(); } catch {}
  modal(`
    <h2>${esc(t('Bildnachweise'))}</h2>
    <p class="lead">${esc(t('Fotos von Wikimedia Commons unter freien Lizenzen. Kartendaten © OpenStreetMap, Karte von Protomaps, Wetter von Open-Meteo.'))}</p>
    ${Object.values(n).map((x) => `<div class="nachweis"><b>${esc(x.datei.replace(/^File:/, ''))}</b><br>${esc(x.urheber || '?')} · ${esc(x.lizenz)} · <a href="${esc(x.seite)}" target="_blank" rel="noopener">Commons</a></div>`).join('')}`);
}

// ---------- Orte hinzufügen ----------
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
function katRaten(r) {
  const tx = (r.type || '') + ' ' + (r.category || r.class || '') + ' ' + (r.name || '');
  if (/hotel|hostel|guest_house|motel|apartment|resort/i.test(tx)) return 'hotel';
  if (/place_of_worship|temple|wat |^wat|church|mosque|shrine/i.test(tx)) return 'tempel';
  if (/market|marketplace|bazaar/i.test(tx)) return 'markt';
  if (/park|garden|nature|forest|beach/i.test(tx)) return 'park';
  if (/mall|shop|department/i.test(tx)) return 'shopping';
  if (/restaurant|food|cafe|fast_food/i.test(tx)) return 'essen';
  if (/bar|pub|nightclub/i.test(tx)) return 'bar';
  if (/museum|gallery|palace|castle|monument|memorial|ruins|historic/i.test(tx)) return 'kultur';
  if (/viewpoint|tower|observation/i.test(tx)) return 'aussicht';
  if (/pier|ferry|river|harbour|marina/i.test(tx)) return 'wasser';
  if (/massage|spa/i.test(tx)) return 'erholung';
  if (/suburb|neighbourhood|quarter/i.test(tx)) return 'viertel';
  return 'sonst';
}

// Photon (komoot) ist fehlertolerant: findet "Marriott marquis queens park" und sogar "marriot marquis".
const PHOTON = 'https://photon.komoot.io/api/';
async function suchenPhoton(q) {
  const c = map.getCenter();
  const p = new URLSearchParams({ q, limit: '10', lang: ich.sprache === 'en' ? 'en' : 'de', lat: c.lat.toFixed(4), lon: c.lng.toFixed(4) });
  const r = await fetch(PHOTON + '?' + p);
  if (!r.ok) throw new Error('Photon ' + r.status);
  return (await r.json()).features.filter((f) => f.properties.name || f.properties.street).map((f) => {
    const x = f.properties;
    const adresse = [x.street && (x.street + (x.housenumber ? ' ' + x.housenumber : '')), x.district, x.city, x.state, x.country].filter((teil) => teil && latein(teil)).filter((teil, i, a) => a.indexOf(teil) === i).join(', ');
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
  // Suchmittelpunkt: die aktuelle Reise, nicht wo die Karte gerade steht
  const v = ansicht(aktuell);
  const m = v && tripMitte(v);
  if (m && ui.tab !== 'karte') map.jumpTo({ center: [m.lng, m.lat] });
  try {
    const tr = await suchenPhoton(q);
    if (tr.length) return beschraenkt ? nachNaehe(tr).slice(0, 1) : nachNaehe(tr);
  } catch (e) { console.warn('Photon', e); }
  const b = map.getBounds();
  // Nominatim ist bei Apostrophen und Zusätzen streng: "Queen's Park" findet "Queen’s Park" nicht.
  const [kopf, ...rest] = q.split(',');
  const woerter = kopf.replace(/['’`´]s?\b/g, '').trim().split(/\s+/);
  const varianten = [q, q.replace(/'/g, '’'), [woerter.join(' '), ...rest].join(',')];
  for (let n = woerter.length - 1; n >= 2; n--) varianten.push([woerter.slice(0, n).join(' '), ...rest].join(','));
  for (const vv of [...new Set(varianten)].slice(0, 6)) {
    const p = new URLSearchParams({ format: 'jsonv2', q: vv, limit: '8', 'accept-language': ich.sprache + ',en', viewbox: [b.getWest() - 1, b.getNorth() + 1, b.getEast() + 1, b.getSouth() - 1].join(',') });
    const r = await fetch(NOMINATIM + '?' + p);
    if (!r.ok) throw new Error('Suche fehlgeschlagen');
    const treffer = await r.json();
    if (treffer.length) {
      const liste = nachNaehe(treffer.map((x) => ({ n: x.name || x.display_name.split(',')[0], ort: x.display_name.split(', ').filter(latein).join(', '), lat: +x.lat, lng: +x.lon, k: katRaten(x) })));
      return beschraenkt ? liste.slice(0, 1) : liste;
    }
    await new Promise((res) => setTimeout(res, 1000)); // Nominatim: höchstens 1 Anfrage pro Sekunde
  }
  return [];
}

function koordinatenLesen(text) {
  const tx = decodeURIComponent(text);
  const m = tx.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || tx.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || tx.match(/[?&](?:q|ll|query|destination|daddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || tx.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
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
    <h2>${esc(t('Ort hinzufügen'))}</h2>
    <div class="segmente" id="hTabs" style="--n:4;background:var(--flaeche)"><span class="schieber"></span>${tabs.map(([id, tx]) => `<button data-tab="${id}">${esc(t(tx))}</button>`).join('')}</div>
    <div id="hInhalt"></div>`);
  const inhalt = k.querySelector('#hInhalt');
  const zeigen = (tb) => {
    const i = tabs.findIndex((x) => x[0] === tb);
    k.querySelector('#hTabs').style.setProperty('--i', i);
    k.querySelectorAll('#hTabs button').forEach((b) => b.classList.toggle('an', b.dataset.tab === tb));
    if (tb === 'suchen') {
      inhalt.innerHTML = `
        <input class="eingabe" id="hSuche" type="search" placeholder="${esc(t('z. B. Wat Arun, Sky Bar, Khao San Road'))}" enterkeyhint="search" autocomplete="off">
        <ul class="treffer" id="hTreffer"></ul>
        <p class="klein" id="hInfo" style="margin-top:10px">${esc(t('Sucht weltweit, Orte in der Nähe der Reise zuerst. Braucht Internet.'))}</p>`;
      const feld = inhalt.querySelector('#hSuche');
      let timer, nr = 0, treffer = [];
      const los = async () => {
        const q = feld.value.trim();
        if (q.length < 3) return;
        const meine = ++nr;
        inhalt.querySelector('#hInfo').textContent = t('Suche …');
        try {
          treffer = await suchen(q);
          if (meine !== nr) return;
          inhalt.querySelector('#hInfo').textContent = treffer.length ? '' : t('Nichts gefunden. Anders schreiben oder auf der Karte setzen.');
          inhalt.querySelector('#hTreffer').innerHTML = treffer.map((r, i) => `<li><button data-i="${i}">${katKachel(r.k)}<span style="min-width:0"><b>${esc(r.n)}</b><small>${esc(r.ort)}</small></span></button></li>`).join('');
        } catch { inhalt.querySelector('#hInfo').textContent = navigator.onLine ? t('Suche gerade nicht erreichbar.') : t('Offline – Suche geht nur mit Internet. Du kannst den Ort aber auf der Karte setzen.'); }
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
    } else if (tb === 'liste') {
      inhalt.innerHTML = `
        <p class="klein" style="margin-top:0">${esc(t('Eine Zeile pro Ort – wie auf eurem Zettel. Jeder Ort wird automatisch gesucht und auf die Karte gesetzt. Was nicht gefunden wird, kommt „ohne Ort“ in die Liste.'))}</p>
        <textarea class="eingabe" id="lText" rows="7" placeholder="Wat Arun&#10;Grand Palace&#10;Lumpini Park"></textarea>
        <label class="feld" style="margin-top:10px"><span>${esc(t('Stadt / Land (hilft beim Finden)'))}</span><input class="eingabe" id="lStadt" placeholder="${esc(t('z. B. Bangkok'))}"></label>
        <button class="knopf voll akzent" id="lOk">${esc(t('Alle hinzufügen'))}</button>
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
          log.insertAdjacentHTML('beforeend', `<div>${r ? '✓' : '–'} ${esc(z)}${r ? '' : ` <span class="klein">– ${esc(t('ohne Ort, später bearbeiten'))}</span>`}</div>`);
          log.scrollTop = log.scrollHeight;
          await new Promise((res) => setTimeout(res, 1100));
        }
        e.target.disabled = false;
        e.target.textContent = t('Fertig – schließen');
        e.target.onclick = () => modalSchliessen();
      };
    } else if (tb === 'karte') {
      inhalt.innerHTML = `
        <button class="knopf voll akzent" id="kSetzen">${icon('sonst', 20)} ${esc(t('Punkt auf der Karte setzen'))}</button>
        <p class="klein">${esc(t('Tipp: Im Karten-Tab kannst du auch einfach lange auf die Karte drücken.'))}</p>
        <label class="feld" style="margin-top:16px"><span>${esc(t('Google-Maps-Link oder Koordinaten'))}</span><input class="eingabe" id="kLink" placeholder="https://www.google.com/maps/…@13.75,100.49"></label>
        <button class="knopf voll" id="kLinkOk">${esc(t('Übernehmen'))}</button>
        <p class="klein">${esc(t('Kurze Links (maps.app.goo.gl) erst im Browser öffnen und dann die lange Adresse kopieren.'))}</p>`;
      inhalt.querySelector('#kSetzen').onclick = () => { modalSchliessen(); auswahlStarten(); };
      inhalt.querySelector('#kLinkOk').onclick = () => {
        const p = koordinatenLesen(inhalt.querySelector('#kLink').value);
        if (!p) return toast(t('Keine Koordinaten im Link gefunden'));
        const nm = (inhalt.querySelector('#kLink').value.match(/place\/([^/@]+)/) || [])[1];
        ortEditor({ ...p, n: nm ? decodeURIComponent(nm).replace(/\+/g, ' ') : '' });
      };
    } else {
      inhalt.innerHTML = `<p class="klein" style="margin-top:0">${esc(t('Für Dinge ohne festen Ort – z. B. „Massage“, „Food Tour“ oder „Mango Sticky Rice essen“.'))}</p>`;
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
    ${ziel ? '' : `<h2>${esc(neu ? t('Neuer Ort') : t('Ort bearbeiten'))}</h2>`}
    <label class="feld"><span>${esc(t('Name'))}</span><input class="eingabe" id="oName" value="${esc(o.n || '')}" placeholder="${esc(t('Wie heißt der Ort?'))}"></label>
    <label class="feld"><span>${esc(t('Art'))}</span></label>
    <div class="kat-wahl" id="oKat">${Object.keys(KATEGORIEN).map((k) => `<button data-k="${k}" class="${k === katWahl ? 'an' : ''}">${katKachel(k, 16)}${esc(kat(k).name)}</button>`).join('')}</div>
    <label class="feld" style="margin-top:14px"><span>${esc(t('Notiz'))}</span><textarea class="eingabe" id="oNotiz" rows="3" placeholder="${esc(t('Öffnungszeiten, Tipps, wann hin …'))}">${esc(o.notiz || '')}</textarea></label>
    ${o.lat != null ? `<p class="klein">${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}${neu ? '' : ` · <button class="chip" id="oVerschieben">${esc(t('Position ändern'))}</button>`}</p>` : ''}
    <div class="knopf-reihe">
      <button class="knopf voll akzent" id="oOk">${esc(neu ? t('Hinzufügen') : t('Speichern'))}</button>
      ${neu ? '' : `<button class="knopf voll rot" id="oWeg">${icon('muell', 19)} ${esc(t('Ort löschen'))}</button>`}
    </div>`;
  const k = ziel || modal(html);
  if (ziel) ziel.insertAdjacentHTML('beforeend', html);
  k.querySelector('#oKat').onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    katWahl = b.dataset.k; sound.tick(); fuehlen('leicht');
    k.querySelectorAll('#oKat button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#oOk').onclick = () => {
    const n = k.querySelector('#oName').value.trim();
    if (!n) { fuehlen('weg'); return toast(t('Bitte einen Namen eingeben')); }
    const id = o.id || zufall(8);
    const alt = o.id ? trips.get(aktuell).data.records['p:' + id].v : {};
    const notizNeu = k.querySelector('#oNotiz').value.trim().slice(0, 1000);
    const nameSpeichern = o.orig && n === o.n ? o.orig : n.slice(0, 80);
    const notizSpeichern = o.id && notizNeu === (o.notiz || '').trim() ? (o.origNotiz ?? notizNeu) : notizNeu;
    schreiben(aktuell, 'p:' + id, { ...alt, n: nameSpeichern, nl: nameSpeichern === alt.n ? alt.nl : null, k: katWahl, notiz: notizSpeichern, lat: o.lat ?? null, lng: o.lng ?? null, o: o.id ? alt.o : naechsteOrdnung() });
    modalSchliessen();
    sound.plopp(); fuehlen('mittel');
    toast(neu ? t('„{ort}“ hinzugefügt', { ort: n }) : t('Gespeichert'));
    if (neu) setTimeout(() => (ui.tab === 'karte' && o.lat != null ? kartenOrtWaehlen(id, true) : ortOeffnen(id)), 300);
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
  sound.weg(); fuehlen('weg');
  for (const tab of Object.keys(ui.stapel)) { const st = ui.stapel[tab]; if (st[st.length - 1].s === 'ort' && st[st.length - 1].ort === id) zurueck(tab); }
  toast(t('„{ort}“ gelöscht', { ort: rec.v.n }), t('Rückgängig'), () => { schreiben(aktuell, 'p:' + id, { ...rec.v, weg: false }); sound.zurueck(); fuehlen('leicht'); }, 5000);
}

// Menü nach langem Drücken auf einen Ort (Liste, Karussell oder Pin)
function ortMenue(id) {
  const v = ansicht(aktuell);
  const o = v && v.orte.find((x) => x.id === id);
  if (!o) return;
  const k = modal(`
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:18px;padding-right:40px">
      ${ortBild(o, false)}
      <div style="min-width:0"><div class="klein">Nr. ${o.nr} · ${esc(kat(o.k).name)}</div><h2 style="margin:2px 0 0;padding:0">${esc(o.n)}</h2></div>
    </div>
    <div class="knopf-reihe" style="margin-top:0">
      <button class="knopf voll ${o.check ? '' : 'akzent'}" id="mStempel">${icon('haken', 20, 2.4)} ${esc(o.check ? t('Stempel entfernen') : t('Abstempeln'))}</button>
      <button class="knopf voll" id="mTag">${icon('kalender', 19)} ${esc(o.tag ? t('Tag ändern (jetzt Tag {n})', { n: o.tag }) : t('Tag einplanen'))}</button>
      <button class="knopf voll" id="mVerorten">${icon('sonst', 19)} ${esc(o.lat == null ? t('Ort festlegen') : t('Position ändern'))}</button>
      <button class="knopf voll" id="mBearbeiten">${icon('stift', 19)} ${esc(t('Bearbeiten'))}</button>
      <button class="knopf voll rot" id="mLoeschen">${icon('muell', 19)} ${esc(t('Ort löschen'))}</button>
    </div>`);
  k.querySelector('#mLoeschen').onclick = () => { modalSchliessen(); ortLoeschen(id); };
  k.querySelector('#mStempel').onclick = () => { modalSchliessen(); stempeln(id); };
  k.querySelector('#mBearbeiten').onclick = () => ortEditor(o);
  k.querySelector('#mVerorten').onclick = () => ortVerorten(id);
  k.querySelector('#mTag').onclick = () => tagWahlDialog(id);
}

// Position eines bestehenden Orts festlegen oder ändern: suchen, auf der Karte setzen oder Link einfügen
function ortVerorten(id) {
  const v = ansicht(aktuell);
  const o = v && v.orte.find((x) => x.id === id);
  if (!o) return;
  const setzen = (lat, lng) => {
    const rec = trips.get(aktuell).data.records['p:' + id];
    schreiben(aktuell, 'p:' + id, { ...rec.v, lat, lng });
    modalSchliessen();
    sound.plopp(); fuehlen('mittel');
    toast(t('Position von „{ort}“ gespeichert', { ort: o.n }));
  };
  const k = modal(`
    <h2>${esc(o.lat == null ? t('Ort festlegen') : t('Position ändern'))}</h2>
    <p class="lead">${esc(t('Wo ist „{ort}“? Such den Ort, setz ihn auf der Karte oder füg einen Google-Maps-Link ein.', { ort: o.n }))}</p>
    <input class="eingabe" id="vSuche" type="search" enterkeyhint="search" autocomplete="off" value="${esc(o.n)}">
    <ul class="treffer" id="vTreffer"></ul>
    <p class="klein" id="vInfo"></p>
    <div class="knopf-reihe">
      <button class="knopf voll" id="vKarte">${icon('karteTab', 19)} ${esc(t('Auf der Karte setzen'))}</button>
      <input class="eingabe" id="vLink" placeholder="${esc(t('Google-Maps-Link oder Koordinaten'))}">
    </div>`);
  const feld = k.querySelector('#vSuche');
  let treffer = [], nr = 0, timer;
  const los = async () => {
    const q = feld.value.trim();
    if (q.length < 3) return;
    const meine = ++nr;
    k.querySelector('#vInfo').textContent = t('Suche …');
    try {
      treffer = await suchen(q);
      if (meine !== nr) return;
      k.querySelector('#vInfo').textContent = treffer.length ? '' : t('Nichts gefunden. Anders schreiben oder auf der Karte setzen.');
      k.querySelector('#vTreffer').innerHTML = treffer.map((r, i) => `<li><button data-i="${i}">${katKachel(r.k)}<span style="min-width:0"><b>${esc(r.n)}</b><small>${esc(r.ort)}</small></span></button></li>`).join('');
    } catch { k.querySelector('#vInfo').textContent = t('Offline – Suche geht nur mit Internet. Du kannst den Ort aber auf der Karte setzen.'); }
  };
  feld.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(los, 650); });
  feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); los(); } });
  k.querySelector('#vTreffer').onclick = (e) => { const b = e.target.closest('[data-i]'); if (b) { const r = treffer[+b.dataset.i]; setzen(r.lat, r.lng); } };
  k.querySelector('#vKarte').onclick = () => { modalSchliessen(); auswahlStarten(o); };
  k.querySelector('#vLink').addEventListener('change', (e) => {
    const p = koordinatenLesen(e.target.value);
    if (p) setzen(p.lat, p.lng); else toast(t('Keine Koordinaten im Link gefunden'));
  });
  setTimeout(() => { feld.focus(); feld.select(); }, 350);
}

// Langes Drücken (Finger ~0,5 s) bzw. Rechtsklick auf Ortskarten
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
      fuehlen('mittel'); sound.tick();
      fn(id);
    }, 520);
  });
  document.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) ab(); });
  ['pointerup', 'pointercancel', 'scroll'].forEach((ty) => document.addEventListener(ty, () => { if (timer) ab(); }, true));
  document.addEventListener('contextmenu', (e) => {
    const ziel = e.target.closest(selektor);
    if (!ziel) return;
    e.preventDefault();
    if (Date.now() - langGedrueckt < 1200) return;
    langGedrueckt = Date.now();
    fn(ziel.dataset.id);
  });
  document.addEventListener('click', (e) => { if (Date.now() - langGedrueckt < 800 && e.target.closest(selektor)) { e.stopPropagation(); e.preventDefault(); } }, true);
}
langDrueckbar('.ort, .k-karte', ortMenue);

// Punkt in der Kartenmitte wählen
let auswahlAktiv = false;
function auswahlStarten(bestehend) {
  auswahlAktiv = true;
  if (ui.tab !== 'karte') tabZeigen('karte');
  while (ui.stapel.karte.length > 1) zurueck('karte', true);
  document.body.classList.add('auf-karte');
  $('#auswahl').hidden = false;
  $('#tab-karte').style.visibility = 'hidden';
  $('#tabbar').classList.add('weg');
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  if (bestehend && bestehend.lat != null) map.easeTo({ center: [bestehend.lng, bestehend.lat], zoom: 16 });
  else { const m = tripMitte(ansicht(aktuell)); if (m) map.easeTo({ center: [m.lng, m.lat], zoom: 13 }); }
  const ende = () => { auswahlAktiv = false; $('#auswahl').hidden = true; $('#tab-karte').style.visibility = ''; $('#tabbar').classList.remove('weg'); };
  $('#auswahlAbbruch').onclick = () => { sound.tick(); ende(); };
  $('#auswahlOk').onclick = () => {
    const c = map.getCenter();
    ende();
    fuehlen('mittel');
    if (bestehend) {
      const rec = trips.get(aktuell).data.records['p:' + bestehend.id];
      schreiben(aktuell, 'p:' + bestehend.id, { ...rec.v, lat: c.lat, lng: c.lng });
      sound.plopp();
      toast(t('Position geändert'));
    } else ortEditor({ lat: c.lat, lng: c.lng });
  };
}

// ---------- Standort ----------
let ortungId = null;
function ortungStarten(zentrieren) {
  if (!('geolocation' in navigator)) return toast(t('Standort wird nicht unterstützt'));
  let erstes = true;
  if (ortungId == null) {
    ortungId = navigator.geolocation.watchPosition((p) => {
      pos = { lat: p.coords.latitude, lng: p.coords.longitude, genau: p.coords.accuracy };
      ichZeichnen();
      if (zentrieren && erstes && ui.tab === 'karte') map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 14), padding: polster(), duration: 800 });
      if (erstes && ui.route && !ui.route.daten && (ui.route.von === 'ich' || ui.route.nach === 'ich')) routeBerechnen();
      erstes = false;
      ortsDrossel();
    }, (e) => {
      ortungId = null;
      if (e.code === 1) toast(t('Standort-Freigabe fehlt – in den Einstellungen erlauben'));
      neuZeichnen();
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
    neuZeichnen();
  } else if (pos && zentrieren && ui.tab === 'karte') {
    map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 14), padding: polster(), duration: 800 });
  }
}
// Erst erklären, dann fragen – und zwar genau dann, wenn der Standort gebraucht wird (Mobbin: "ask at the right moment").
// Die Systemabfrage kommt nur einmal; wer dort ablehnt, muss es in den Einstellungen ändern.
async function standortFragen(zentrieren) {
  if (!('geolocation' in navigator)) return toast(t('Standort wird nicht unterstützt'));
  let status = 'prompt';
  try { status = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch {}
  if (ortungId != null || status !== 'prompt') return ortungStarten(zentrieren);
  const k = modal(`
    <div class="frage-kopf">${stempi({ stimmung: 'staunen', groesse: 84 })}</div>
    <h2 style="text-align:center;padding:0">${esc(t('Darf Stempi sehen, wo du bist?'))}</h2>
    <p class="lead" style="text-align:center">${esc(t('Dann kann er dir mehr zeigen:'))}</p>
    <ul class="gruende">
      <li><span class="e-ico" style="background:#0a84ff">${icon('navi', 18)}</span>${esc(t('Wie weit es zu jedem Ort ist'))}</li>
      <li><span class="e-ico" style="background:#30c25a">${icon('ortung', 18)}</span>${esc(t('„In der Nähe“ – die nächsten Orte zuerst'))}</li>
      <li><span class="e-ico" style="background:#bf5af2">${icon('route', 18)}</span>${esc(t('Routen ab deinem Standort'))}</li>
    </ul>
    <p class="klein" style="display:flex;gap:6px;align-items:center;justify-content:center;text-align:center;margin:0 0 14px">${icon('schloss', 14)}<span>${esc(t('Dein Standort bleibt auf deinem Handy und wird nie geteilt.'))}</span></p>
    <button class="knopf voll akzent" id="sJa">${esc(t('Standort erlauben'))}</button>
    <button class="knopf voll" data-zu style="margin-top:8px;background:none;border:0;box-shadow:none;color:var(--text-2)">${esc(t('Nicht jetzt'))}</button>`);
  k.querySelector('#sJa').onclick = () => { modalSchliessen(); fuehlen('leicht'); ortungStarten(zentrieren); };
}

// Interessen und Reisetempo nachträglich ändern
function vorliebenDialog() {
  const k = modal(`
    <h2>${esc(t('Interessen & Reisetempo'))}</h2>
    <p class="lead">${esc(t('Danach wählt Stempi bei neuen Reisen die Sehenswürdigkeiten vor und verteilt sie auf die Tage.'))}</p>
    <div id="vBox">${vorliebenHtml(ich, { t, icon, esc })}</div>
    <div class="knopf-reihe"><button class="knopf voll akzent" data-zu>${esc(t('Fertig'))}</button></div>`);
  k.querySelector('#vBox').onclick = (e) => {
    const was = vorliebenKlick(e, ich, k);
    if (!was) return;
    ichSpeichern(); fuehlen('leicht');
    if (was === 'interesse') sound.plopp(); else sound.tick();
  };
  modalZu = () => allesZeichnen();
}

// Stimme für den Audio-Guide auswählen, mit Hörprobe
function stimmeDialog() {
  const lang = ich.sprache;
  const tipp = istIOS ? t('Am iPhone gibt es viel natürlichere Stimmen gratis: Einstellungen › Bedienungshilfen › Gesprochene Inhalte › Stimmen › Deutsch – dort z. B. „Anna (Premium)“ laden. Danach erscheint sie hier.')
    : /Android/i.test(navigator.userAgent) ? t('Bessere Stimmen: Android-Einstellungen › Bedienungshilfen › Sprachausgabe › Google › Stimmen installieren.')
      : t('Am Computer klingen die „Natural“-Stimmen in Microsoft Edge am besten.');
  const k = modal(`
    <div class="frage-kopf" id="sKopf">${stempi({ groesse: 72, kopfhoerer: true })}</div>
    <h2 style="text-align:center;padding:0">${esc(t('Stimme des Audio-Guides'))}</h2>
    <p class="lead" style="text-align:center">${esc(t('Such dir die Stimme aus, die dir am besten gefällt – mit ▶ hörst du eine Probe.'))}</p>
    <ul class="stimmen" id="sListe"></ul>
    <div class="ios-hinweis">${esc(tipp)}</div>`);
  const kopf = k.querySelector('#sKopf');
  const zeichnen = () => {
    const box = k.querySelector('#sListe');
    if (!box) return;
    const liste = stimmenFuer(lang);
    const gewaehlt = (ich.stimmen || {})[lang] || (liste[0] && liste[0].name);
    const q = (v) => { const n = stimmQualitaet(v); return `<span class="qualitaet ${n === 3 ? '' : n === 2 ? 'mittel' : 'einfach'}">${esc(n === 3 ? t('Natürlich') : n === 2 ? t('Gut') : t('Einfach'))}</span>`; };
    box.innerHTML = liste.length
      ? liste.map((v) => `<li class="${v.name === gewaehlt ? 'an' : ''}"><button class="wahl" data-stimme="${esc(v.name)}"><b>${esc(v.name.replace(/^(Microsoft|Google)\s+/, ''))}</b><small>${esc(v.lang)} ${q(v)}</small></button>
          <button class="kreisknopf" data-probe="${esc(v.name)}" aria-label="${esc(t('Probe hören'))}">${icon('play', 16, 2.4)}</button></li>`).join('')
      : `<p class="klein">${esc(t('Auf diesem Gerät wurden keine Stimmen gefunden.'))}</p>`;
  };
  zeichnen();
  const neu = () => zeichnen();
  speechSynthesis.addEventListener?.('voiceschanged', neu);
  modalZu = () => { speechSynthesis.removeEventListener?.('voiceschanged', neu); sprecher.stop(); allesZeichnen(); };
  const probe = (name) => { kopf.classList.add('spricht'); sprecher.probe(lang, name, () => kopf.classList.remove('spricht')); fuehlen('leicht'); };
  k.onclick = (e) => {
    const p = e.target.closest('[data-probe]');
    if (p) return probe(p.dataset.probe);
    const s = e.target.closest('[data-stimme]');
    if (s) { ich.stimmen = { ...(ich.stimmen || {}), [lang]: s.dataset.stimme }; ichSpeichern(); sound.tick(); zeichnen(); probe(s.dataset.stimme); }
  };
}

let ortsZeit = 0;
function ortsDrossel() { if (Date.now() - ortsZeit > 8000) { ortsZeit = Date.now(); neuZeichnen(); } }

// ---------- Offline-Karte ----------
let laedt = false;
let ladeAnteil = 0;
async function karteHerunterladen() {
  if (laedt || offlineKarte) return;
  if (!navigator.onLine) return toast(t('Dafür braucht es Internet – am besten WLAN'));
  laedt = true; ladeAnteil = 0;
  toast(t('Offline-Karte wird gespeichert …'));
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
      if (ladeAnteil - zuletzt > 0.03) { zuletzt = ladeAnteil; neuZeichnen(); }
    }
    const blob = new Blob(teile, { type: 'application/octet-stream' });
    const c = await caches.open(KARTEN_CACHE);
    await c.put(abs(REGION.datei), new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }));
    protokoll.add(new pmtiles.PMTiles(new pmtiles.FileSource(new File([blob], REGION.name))));
    kartenUrl = 'pmtiles://' + REGION.name;
    const quelle = map.getSource('protomaps');
    if (quelle && quelle.setUrl) quelle.setUrl(kartenUrl);
    offlineKarte = true;
    laedt = false;
    neuZeichnen();
    sound.erfolg(); fuehlen('erfolg');
    erfolg({ icon: 'wolkeOk', titel: t('Offline bereit'), text: esc(t('Die Karte von Bangkok bis Ayutthaya liegt jetzt auf deinem Handy – sie funktioniert auch ganz ohne Internet.')), knopf: t('Super') });
  } catch (e) {
    console.warn(e);
    laedt = false;
    neuZeichnen();
    toast(t('Download abgebrochen – später nochmal versuchen'));
  }
}

// ---------- Installation ----------
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

addEventListener('online', () => { if (map) osmUmschalten(); syncAnzeige(); });
addEventListener('offline', () => { if (map) osmUmschalten(); syncAnzeige(); });
addEventListener('storage', (e) => {
  if (!e.key || !e.key.startsWith('sp.trip.')) return;
  const id = e.key.slice(8);
  const tr = trips.get(id);
  if (tr && e.newValue) { try { tr.data = JSON.parse(e.newValue); neuZeichnen(); } catch {} }
});
// Ortszeiten und Wetter regelmäßig auffrischen
setInterval(() => { if (!document.hidden) neuZeichnen(); }, 60e3);

// Reisepass-Karte kippt unter dem Finger, der Holo-Glanz wandert mit (wie die Karten bei Revolut)
function passKippen() {
  document.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.pass-karte');
    if (!k || e.target.closest('button')) return;
    k.classList.add('greift');
    const bewegen = (ev) => {
      const r = k.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      k.style.setProperty('--ry', ((x - 0.5) * 16).toFixed(1) + 'deg');
      k.style.setProperty('--rx', ((0.5 - y) * 12).toFixed(1) + 'deg');
      k.style.setProperty('--mx', Math.round(x * 100) + '%');
      k.style.setProperty('--my', Math.round(y * 100) + '%');
    };
    const loslassen = () => {
      k.classList.remove('greift');
      k.style.setProperty('--rx', '0deg'); k.style.setProperty('--ry', '0deg');
      removeEventListener('pointermove', bewegen); removeEventListener('pointerup', loslassen); removeEventListener('pointercancel', loslassen);
    };
    bewegen(e);
    fuehlen('leicht');
    addEventListener('pointermove', bewegen, { passive: true });
    addEventListener('pointerup', loslassen);
    addEventListener('pointercancel', loslassen);
  });
}

// ---------- Einführung ----------
function einfuehrung(einladung) {
  return starteOnboarding({
    ich, t, icon, scheibe, sound, fuehlen, flagge, orteSuchen, esc, tonAn, tonSetzen,
    farben: FARBEN, akzente: AKZENTE,
    bilder: ['bilder/orte/wat-arun.webp', 'bilder/orte/grand-palace.webp', 'bilder/orte/chao-phraya.webp', 'bilder/orte/floating-market.webp'],
    speichern: () => { ichSpeichern(); },
    spracheSetzen: (s) => { ich.sprache = s; setzeSprache(s); ichSpeichern(); tabLeisteZeichnen(); },
    designSetzen: () => { ichSpeichern(); designAnwenden(); },
    konfetti,
  }).then(() => {
    ich.eingerichtet = true; ichSpeichern();
    trips.forEach((_, id) => mitgliedEintragen(id));
    if (map) karteNeuStylen();
    allesZeichnen();
    if (einladung) tripBeitreten(einladung);
  });
}

// ---------- Start ----------
async function start() {
  for (const code of LS.get('sp.trips', [])) { try { await tripLaden(code); } catch (e) { console.warn(e); } }
  if (aktuell && !trips.has(aktuell)) aktuell = null;
  if (!aktuell && trips.size) aktuell = [...trips.keys()][0];
  designAnwenden();
  tabLeisteZeichnen();
  for (const tab of Object.keys(ui.stapel)) seiteAnlegen(tab, ui.stapel[tab][0]);
  randWischen();
  stempiLeben({ beimAntippen: () => { sound.quietsch(); fuehlen('leicht'); } });
  passKippen();
  await karteStarten();
  map.once('load', () => allesZeigen(false));
  allesZeichnen();
  sync.start();

  // Einladungslink: #code=XXXX-XXXX-XXXX
  const para = new URLSearchParams(location.search);
  if (ich.eingerichtet && aktuell && (para.get('tab') || para.get('ansicht'))) {
    if (para.get('tab') === 'karte') tabZeigen('karte');
    else { ui.reiseAnsicht = para.get('ansicht') || 'orte'; oeffnen({ s: 'reise', trip: aktuell }, 'reisen'); }
    history.replaceState(null, '', location.pathname);
  }
  const m = location.hash.match(/code=([A-Za-z0-9-]+)/);
  if (m) history.replaceState(null, '', location.pathname + location.search);
  const einladung = m && normCode(m[1]);
  let schonDa = false;
  if (einladung) { const keys = await deriveKeys(einladung); schonDa = trips.has(keys.id); if (schonDa) { aktuell = keys.id; oeffnen({ s: 'reise', trip: keys.id }, 'reisen'); } }
  if (!ich.eingerichtet) einfuehrung(einladung && !schonDa ? einladung : null);
  else if (einladung && !schonDa) tripBeitreten(einladung);

  trips.forEach((_, id) => mitgliedEintragen(id));
  if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') ortungStarten(false); }).catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /[?&]sw=1/.test(location.search))) {
    // Neue Version aktiv: einmal neu laden, damit sie sofort gilt (nicht beim allerersten Besuch)
    const hatteSW = !!navigator.serviceWorker.controller;
    let neuGeladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hatteSW || neuGeladen || !$('#modal').hidden || $('#erfolg') || $('.onb')) return;
      neuGeladen = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

start();

// Für Tests in der Konsole
window.sp = { trips, sync, ansicht: () => ansicht(aktuell), ich, ui, get map() { return map; }, einfuehrung };
