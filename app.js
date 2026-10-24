import { Sync, deriveKeys, newCode, normCode } from './sync.js';
import { KATEGORIEN, BANGKOK } from './vorlagen.js';

const maplibregl = window.maplibregl;
const pmtiles = window.pmtiles;
const basemaps = window.basemaps;

// Offline-Karte: Ausschnitt aus Protomaps (OpenStreetMap), Bangkok bis Ayutthaya
const REGION = { datei: 'karte/bangkok.pmtiles', name: 'bangkok.pmtiles', bbox: [99.85, 13.45, 100.75, 14.45], mb: 64 };
const KARTEN_CACHE = 'sp-karte';
const FARBEN = ['#e4572e', '#16806a', '#7b5ea7', '#2f7cf6', '#d6336c', '#b7791f', '#0e7490'];

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
function entfernung(o) {
  if (!pos || o.lat == null) return null;
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (o.lat - pos.lat) * r, dLng = (o.lng - pos.lng) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(pos.lat * r) * Math.cos(o.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const meter = (m) => m == null ? '' : m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toLocaleString('de-AT', { maximumFractionDigits: m < 10000 ? 1 : 0 }) + ' km';
const wann = (ms) => {
  const d = new Date(ms), heute = new Date();
  const uhr = d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === heute.toDateString()) return 'heute ' + uhr;
  return d.toLocaleDateString('de-AT', { weekday: 'short', day: 'numeric', month: 'numeric' }) + ' ' + uhr;
};
const kat = (k) => KATEGORIEN[k] || KATEGORIEN.sonst;

function toast(text, aktion, fn, dauer = 3200) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${aktion ? `<button>${esc(aktion)}</button>` : ''}`;
  if (aktion) el.querySelector('button').onclick = () => { el.classList.remove('zeigen'); fn(); };
  el.classList.add('zeigen');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('zeigen'), dauer);
}

function stempelSvg() {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="leer" cx="50" cy="50" r="44"/>
    <path class="haken-leer" d="M36 51l10 10 19-22"/>
    <g class="abdruck">
      <circle cx="50" cy="50" r="45" stroke-width="3.5"/>
      <circle cx="50" cy="50" r="23" stroke-width="2"/>
      <text><textPath href="#stempelKreis" startOffset="0">WAR DA ✦ WAR DA ✦ WAR DA ✦</textPath></text>
      <path class="haken" d="M39 51l8 8 15-18"/>
    </g>
  </svg>`;
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
  const f = basemaps.namedFlavor('light');
  Object.assign(f, {
    background: '#efe9dd', earth: '#f4efe5', water: '#9fd2dc', park_a: '#d8e8c8', park_b: '#bfdca8',
    wood_a: '#d6e6c6', wood_b: '#b8d8a0', scrub_a: '#dbe6cc', scrub_b: '#c4dcae', buildings: '#e6ddcd',
    pedestrian: '#ece4d4', school: '#efe3d3', hospital: '#f1dcd8', industrial: '#e6e2db', zoo: '#d3e6cf',
    beach: '#f2e8c8', sand: '#eee5cc', aerodrome: '#e6e2da', runway: '#f1eee8',
    other: '#fbf8f2', minor_a: '#fbf8f2', minor_b: '#ffffff', minor_service: '#fbf8f2', major: '#fffdf8', highway: '#fde7b8',
    highway_casing_early: '#f1c97a', highway_casing_late: '#f1c97a', bridges_highway: '#fde7b8',
    city_label: '#3a3546', subplace_label: '#7d7688', roads_label_major: '#7d7688',
  });
  const schichten = basemaps.layers('protomaps', f, { lang: 'en' }).filter((l) => l.id !== 'background');
  return {
    version: 8,
    glyphs: abs('karte/fonts/') + '{fontstack}/{range}.pbf',
    sprite: abs('karte/sprites/light'),
    sources: {
      osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' },
      protomaps: { type: 'vector', url, attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    layers: [
      { id: 'grund', type: 'background', paint: { 'background-color': '#efe9dd' } },
      { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.35 } },
      ...schichten,
    ],
  };
}

const imGebiet = (lng, lat) => lng > REGION.bbox[0] && lng < REGION.bbox[2] && lat > REGION.bbox[1] && lat < REGION.bbox[3];

let map;
const marker = new Map(); // id -> { m, el }
let ichMarker = null;

async function karteStarten() {
  map = new maplibregl.Map({
    container: 'map',
    style: kartenStil(await kartenQuelle()),
    center: [100.53, 13.74], zoom: 11.3, minZoom: 3, maxZoom: 18.5,
    attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false,
  });
  map.touchZoomRotate.disableRotation();
  map.on('moveend', osmUmschalten);
  map.on('load', osmUmschalten);
  map.on('click', (e) => { if (!e.originalEvent.target.closest('.pin') && ui.ansicht === 'detail' && !auswahlAktiv) zurListe(); });
  map.on('contextmenu', (e) => langDruck(e.lngLat));
  langDruckErkennen();
}

function osmUmschalten() {
  if (!map.getLayer('osm')) return;
  const c = map.getCenter();
  const sichtbar = !imGebiet(c.lng, c.lat) || map.getZoom() < 7;
  map.setLayoutProperty('osm', 'visibility', sichtbar && navigator.onLine ? 'visible' : 'none');
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
      langDruck(map.unproject([start.x - r.left, start.y - r.top]));
    }, 550);
  }, { passive: true });
  el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (start && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) ab(); }, { passive: true });
  el.addEventListener('touchend', ab);
  el.addEventListener('touchcancel', ab);
}

function langDruck(lngLat) {
  if (!aktuell || $('#modal').hidden === false) return;
  if (navigator.vibrate) navigator.vibrate(15);
  ortEditor({ lat: lngLat.lat, lng: lngLat.lng });
}

function pinsZeichnen(v) {
  const da = new Set();
  for (const o of v ? v.orte : []) {
    if (o.lat == null) continue;
    da.add(o.id);
    let p = marker.get(o.id);
    if (!p) {
      const el = document.createElement('button');
      el.className = 'pin';
      el.setAttribute('aria-label', o.n);
      el.addEventListener('click', (e) => { e.stopPropagation(); detailOeffnen(el.dataset.id, true); });
      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([o.lng, o.lat]).addTo(map);
      p = { m, el };
      marker.set(o.id, p);
    }
    p.el.dataset.id = o.id;
    p.m.setLngLat([o.lng, o.lat]);
    const inhalt = `<span class="pin-koerper"><span class="pin-emo">${kat(o.k).emoji}</span></span><span class="pin-nr"><span>${o.nr}</span></span>`;
    if (p.el.dataset.inhalt !== inhalt) { p.el.innerHTML = inhalt; p.el.dataset.inhalt = inhalt; }
    p.el.classList.toggle('erledigt', !!o.check);
    p.el.classList.toggle('aktiv', ui.ansicht === 'detail' && ui.ortId === o.id);
    const gefiltert = (ui.filter === 'offen' && o.check) || (ui.filter === 'erledigt' && !o.check);
    p.el.classList.toggle('gedimmt', gefiltert);
    p.el.style.zIndex = ui.ortId === o.id ? 5 : o.check ? 1 : 2;
  }
  for (const [id, p] of marker) if (!da.has(id)) { p.m.remove(); marker.delete(id); }
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
  return { top: 70 + extra, bottom: breit ? extra : sichtbarHoehe() + extra, left: breit ? 432 + extra : extra, right: extra + 40 };
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
      if (!ichMarker) {
        const el = document.createElement('div'); el.className = 'ich';
        ichMarker = new maplibregl.Marker({ element: el }).setLngLat([pos.lng, pos.lat]).addTo(map);
      } else ichMarker.setLngLat([pos.lng, pos.lat]);
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
  return Math.round(H * 0.5);
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
        // Tippen auf den Griff klappt auf bzw. zu
        if (e.target.closest('.griff')) return sheetSetzen(ui.snap === 'zu' ? 'mitte' : ui.snap === 'mitte' ? 'voll' : 'mitte');
        return sheetSetzen(ui.snap, false);
      }
      const [t1, y1] = zuletzt[0];
      const tempo = (ev.clientY - y1) / Math.max(1, performance.now() - t1); // px/ms
      const ziel = y0 + dy + tempo * 220;
      const stufen = ['voll', 'mitte', 'zu'];
      let best = stufen[0];
      for (const s of stufen) if (Math.abs(snapY(s) - ziel) < Math.abs(snapY(best) - ziel)) best = s;
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
}

function syncAnzeige() {
  const el = $('#syncKnopf');
  const v = ansicht(aktuell);
  const offen = v ? v.ausstehend : 0;
  const live = sync.online > 0;
  el.classList.toggle('live', live && !offen);
  el.classList.toggle('wartet', offen > 0);
  el.querySelector('span').textContent = live ? (offen ? 'Sync …' : 'Live') : offen ? `Offline · ${offen} warten` : 'Offline';
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
  const offen = n - v.erledigt;
  let liste = v.orte;
  if (ui.filter === 'offen') liste = liste.filter((o) => !o.check);
  if (ui.filter === 'erledigt') liste = liste.filter((o) => o.check).sort((a, b) => b.check.at - a.check.at);
  if (ui.filter === 'naehe') liste = [...liste].filter((o) => o.lat != null).sort((a, b) => entfernung(a) - entfernung(b));

  const leute = v.leute.slice(0, 6).map((l) => `<span style="background:${esc(l.c || '#888')}" title="${esc(l.n)}">${esc((l.n || '?').slice(0, 1).toUpperCase())}</span>`).join('');
  const karten = liste.map((o) => {
    const d = entfernung(o);
    const unten = o.check
      ? `<p class="von">✓ ${esc(name(v, o.check.by) === 'dir' ? 'Von dir' : 'Von ' + name(v, o.check.by))} · ${esc(wann(o.check.at))}</p>`
      : `<p>${esc(kat(o.k).name)}${d != null ? ' · ' + meter(d) : ''}${o.notiz ? ' · ' + esc(o.notiz) : ''}</p>`;
    return `<article class="ort ${o.check ? 'erledigt' : ''}" data-id="${esc(o.id)}">
      <div class="ort-emo">${kat(o.k).emoji}<span class="nr">${o.nr}</span></div>
      <div class="ort-text"><h3>${esc(o.n)}${o.lat == null ? '<span class="ohne-ort">ohne Ort</span>' : ''}</h3>${unten}</div>
      <button class="stempel" data-stempel="${esc(o.id)}" aria-label="${o.check ? 'Stempel entfernen' : 'Abstempeln'}">${stempelSvg()}</button>
    </article>`;
  }).join('');

  const leer = !v.meta
    ? `<div class="leer-hinweis"><span class="gross">⏳</span>Trip wird von den anderen Handys geladen…<br><span class="klein">Dafür braucht es kurz Internet.</span></div>`
    : !n ? `<div class="leer-hinweis"><span class="gross">🗺️</span>Noch keine Orte. Füg den ersten hinzu!</div>`
      : !liste.length ? `<div class="leer-hinweis">${ui.filter === 'naehe' ? 'Tippe oben rechts auf ◎, damit die Entfernungen berechnet werden.' : ui.filter === 'offen' ? '<span class="gross">🎉</span>Alles gestempelt!' : 'Noch nichts gestempelt.'}</div>` : '';

  box.innerHTML = `
    <div class="griff-zone">
      <div class="griff"></div>
      <div class="kopf-zeile">
        <div class="titel">
          <div class="eyebrow">Stempelpass</div>
          <h1>${esc(v.meta ? v.meta.n : '…')}</h1>
          <div class="unterzeile"><span>${v.erledigt} gestempelt · ${offen} offen</span>${leute ? `<span class="leute">${leute}</span>` : ''}</div>
        </div>
        <div class="ring" style="--p:${n ? v.erledigt / n : 0}"><span>${v.erledigt}<small>/${n}</small></span></div>
      </div>
      <div class="chips">
        <button class="chip ${ui.filter === 'alle' ? 'an' : ''}" data-filter="alle">Alle <b>${n}</b></button>
        <button class="chip ${ui.filter === 'offen' ? 'an' : ''}" data-filter="offen">Offen <b>${offen}</b></button>
        <button class="chip ${ui.filter === 'erledigt' ? 'an' : ''}" data-filter="erledigt">Gestempelt <b>${v.erledigt}</b></button>
        <button class="chip ${ui.filter === 'naehe' ? 'an' : ''}" data-filter="naehe">📍 In der Nähe</button>
      </div>
    </div>
    <div class="scroll">
      ${karten}${leer}
      ${v.meta ? `<button class="hinzu" data-aktion="hinzu"><span style="font-size:20px">＋</span> Ort hinzufügen</button>` : ''}
    </div>`;
  const s = box.querySelector('.scroll');
  if (s) s.scrollTop = merk;
}

function detailZeichnen(v, o, box) {
  const d = entfernung(o);
  const wer = o.check ? name(v, o.check.by) : '';
  const fakten = [
    `<span class="fakt">${kat(o.k).emoji} ${esc(kat(o.k).name)}</span>`,
    d != null ? `<span class="fakt">📍 ${meter(d)} entfernt</span>` : '',
    o.lat == null ? `<span class="fakt">Ohne festen Ort</span>` : '',
  ].join('');
  box.innerHTML = `
    <div class="griff-zone">
      <div class="griff"></div>
      <div class="detail-oben">
        <button class="textknopf" data-aktion="liste">‹ Alle Orte</button>
        <button class="textknopf" data-aktion="bearbeiten">Bearbeiten</button>
      </div>
    </div>
    <div class="scroll ${o.check ? 'erledigt-detail' : ''}">
      <div class="held">
        <div class="held-emo">${kat(o.k).emoji}</div>
        <div><div class="eyebrow">Nr. ${o.nr} von ${v.orte.length}</div><h2>${esc(o.n)}</h2></div>
      </div>
      ${o.notiz ? `<p class="notiz">${esc(o.notiz)}</p>` : ''}
      <div class="fakten">${fakten}</div>
      <button class="gross-stempel ${o.check ? 'gestempelt' : ''}" data-stempel="${esc(o.id)}">
        <span class="stempel">${stempelSvg()}</span>
        <span>${o.check
          ? `<strong>Gestempelt!</strong><small>von ${esc(wer)} · ${esc(wann(o.check.at))} – tippen zum Entfernen</small>`
          : `<strong>Abstempeln</strong><small>Hier gewesen? Dann drauf tippen.</small>`}</span>
      </button>
      ${o.lat != null ? `<div class="zeile">
        <a class="knopf" href="${routeLink(o)}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg> Route
        </a>
        <button class="knopf leise" data-aktion="zentrieren">Auf Karte zeigen</button>
      </div>` : ''}
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

function stempeln(id, knopf) {
  const v = ansicht(aktuell);
  const o = v.orte.find((x) => x.id === id);
  if (!o) return;
  if (o.check) {
    const alt = o.check;
    schreiben(aktuell, 'c:' + id, { ok: false, by: ich.id, at: Date.now() });
    toast(`Stempel bei „${o.n}“ entfernt`, 'Rückgängig', () => schreiben(aktuell, 'c:' + id, alt));
    return;
  }
  schreiben(aktuell, 'c:' + id, { ok: true, by: ich.id, at: Date.now() });
  if (navigator.vibrate) navigator.vibrate([12, 40, 24]);
  // Nach dem Neuzeichnen die Stempel-Animation auf dem frischen Element abspielen
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const neu = document.querySelector(`[data-stempel="${CSS.escape(id)}"]`);
    if (!neu) return;
    (neu.classList.contains('stempel') ? neu : neu.querySelector('.stempel')).classList.add('knall');
    neu.closest('.ort')?.classList.add('wackeln');
  }));
  const nach = ansicht(aktuell);
  if (nach.erledigt === nach.orte.length && nach.orte.length > 1) setTimeout(feiern, 450);
}

function feiern() {
  const box = $('#konfetti');
  const zeichen = ['🎉', '✨', '🛕', '🥭', '🌺', '⭐', '🐘'];
  box.innerHTML = Array.from({ length: 36 }, () => {
    const x = Math.random() * 100, dx = (Math.random() - .5) * 200;
    return `<span style="left:${x}vw;--x:${dx}px;--r:${Math.random() * 720 - 360}deg;--d:${2 + Math.random() * 1.8}s;animation-delay:${Math.random() * .6}s">${zeichen[Math.floor(Math.random() * zeichen.length)]}</span>`;
  }).join('');
  toast('Alles gestempelt – was für eine Reise! 🎉', null, null, 4500);
  setTimeout(() => { box.innerHTML = ''; }, 4500);
}

// Klicks im Sheet
sheet.addEventListener('click', (e) => {
  const st = e.target.closest('[data-stempel]');
  if (st) { e.stopPropagation(); return stempeln(st.dataset.stempel, st); }
  const f = e.target.closest('[data-filter]');
  if (f) {
    ui.filter = f.dataset.filter;
    if (ui.filter === 'naehe' && !pos) ortungStarten(false);
    return allesZeichnen();
  }
  const a = e.target.closest('[data-aktion]');
  if (a) {
    const was = a.dataset.aktion;
    if (was === 'liste') return zurListe();
    if (was === 'hinzu') return hinzufuegenDialog();
    if (was === 'bearbeiten') { const v = ansicht(aktuell); const o = v.orte.find((x) => x.id === ui.ortId); return o && ortEditor(o); }
    if (was === 'zentrieren') { const v = ansicht(aktuell); const o = v.orte.find((x) => x.id === ui.ortId); if (o) { if (ui.snap === 'voll') sheetSetzen('mitte', false); map.flyTo({ center: [o.lng, o.lat], zoom: 16, padding: polster(), duration: 900 }); } return; }
    return;
  }
  const karte = e.target.closest('.ort');
  if (karte) detailOeffnen(karte.dataset.id);
});

// ---------- Modal ----------
let modalZu = null;
function modal(html, nachher) {
  const m = $('#modal');
  const k = $('#modalKarte');
  m.classList.remove('weg');
  k.innerHTML = `<button class="modal-zu" data-zu aria-label="Schließen">✕</button>` + html;
  m.hidden = false;
  modalZu = null;
  if (nachher) nachher(k);
  return k;
}
function modalSchliessen() {
  const m = $('#modal');
  if (m.hidden) return;
  m.classList.add('weg');
  setTimeout(() => { m.hidden = true; m.classList.remove('weg'); $('#modalKarte').innerHTML = ''; }, 230);
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
  kartenChip();
  return id;
}

async function tripBeitreten(code) {
  const id = await tripLaden(code);
  aktuell = id;
  tripListeSpeichern();
  sync.watch(id, trips.get(id).keys);
  mitgliedEintragen(id);
  speichern(id, true);
  ui.ansicht = 'liste'; ui.filter = 'alle';
  allesZeichnen();
  // Sobald Orte da sind, Karte darauf ausrichten
  let n = 0;
  const warten = setInterval(() => {
    const v = ansicht(id);
    if ((v && v.orte.length) || ++n > 40) { clearInterval(warten); if (v && v.orte.length) allesZeigen(); }
  }, 500);
  kartenChip();
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
      <img class="willkommen-logo" src="icons/icon-192.png" alt="">
      <h2>${einladung ? 'Du bist eingeladen!' : 'Stempelpass'}</h2>
      <p class="lead">${einladung ? 'Tritt dem Trip bei – dann seht ihr alle dieselbe Karte und dieselben Stempel.' : 'Eure Reiseziele auf einer Karte. Gemeinsam abstempeln – auch offline.'}</p>
      <label class="feld"><span>Wie heißt du?</span><input class="eingabe" id="wName" autocomplete="given-name" placeholder="z. B. Mama, Papa, Adam" value="${esc(ich.name)}"></label>
      ${einladung ? `
        <button class="knopf voll safran" id="wBeitreten">Trip beitreten</button>
      ` : `
        <button class="knopf voll safran" id="wBangkok">🇹🇭 Bangkok-Trip anlegen</button>
        <p class="klein" style="text-align:center;margin:6px 0 0">Mit allen 19 Zielen von eurem Zettel</p>
        <div class="oder">oder</div>
        <button class="knopf voll" id="wCode">Ich habe einen Einladungscode</button>
        <button class="knopf voll leise" id="wLeer" style="margin-top:8px">Leeren Trip anlegen</button>
        ${istIOS && !istApp ? `<div class="ios-hinweis"><b>Tipp fürs iPhone:</b> Tippe unten auf <b>Teilen</b> ⎙ und dann <b>„Zum Home-Bildschirm“</b>. Danach die App vom Home-Bildschirm öffnen und dort den Code eingeben.</div>` : ''}
      `}
    </div>`);
  k.dataset.pflicht = '1';
  k.querySelector('.modal-zu').hidden = true;
  const nameNehmen = () => {
    const n = k.querySelector('#wName').value.trim();
    if (!n) { k.querySelector('#wName').focus(); toast('Bitte gib deinen Namen ein'); return false; }
    ich.name = n.slice(0, 24); LS.set('sp.ich', ich);
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}
    return true;
  };
  const fertig = () => { delete k.dataset.pflicht; modalSchliessen(); };
  if (einladung) {
    k.querySelector('#wBeitreten').onclick = async () => { if (!nameNehmen()) return; fertig(); await tripBeitreten(einladung); toast('Beigetreten – lade Orte …'); };
  } else {
    k.querySelector('#wBangkok').onclick = async () => { if (!nameNehmen()) return; fertig(); await tripAnlegen(BANGKOK.name, BANGKOK.emoji, BANGKOK); setTimeout(() => einladenDialog(true), 1300); };
    k.querySelector('#wCode').onclick = () => { if (!nameNehmen()) return; fertig(); codeDialog(); };
    k.querySelector('#wLeer').onclick = () => { if (!nameNehmen()) return; fertig(); neuerTripDialog(); };
  }
}

function codeDialog() {
  const k = modal(`
    <h2>Mit Code beitreten</h2>
    <p class="lead">Den Code bekommst du von jemandem, der den Trip schon hat (Menü → Einladen).</p>
    <label class="feld"><input class="eingabe code-eingabe" id="cCode" placeholder="XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="16"></label>
    <div class="knopf-reihe">
      <button class="knopf voll safran" id="cOk">Beitreten</button>
      ${navigator.clipboard && navigator.clipboard.readText ? '<button class="knopf voll leise" id="cEinf">Aus Zwischenablage einfügen</button>' : ''}
    </div>`);
  if (!aktuell) modalZu = () => setTimeout(() => !aktuell && willkommen(), 260);
  const feld = k.querySelector('#cCode');
  const los = async () => {
    const c = normCode(feld.value);
    if (!c) return toast('Der Code hat 12 Zeichen, z. B. AB3D-EF7H-JK9M');
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
    <div class="kat-wahl" id="nEmo">${emojis.map((e, i) => `<button data-e="${e}" class="${i ? '' : 'an'}" style="font-size:20px">${e}</button>`).join('')}</div>
    <div class="knopf-reihe"><button class="knopf voll safran" id="nOk">Trip anlegen</button></div>`);
  if (!aktuell) modalZu = () => setTimeout(() => !aktuell && willkommen(), 260);
  k.querySelector('#nEmo').onclick = (e) => {
    const b = e.target.closest('[data-e]'); if (!b) return;
    wahl = b.dataset.e;
    k.querySelectorAll('#nEmo button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#nOk').onclick = async () => {
    const n = k.querySelector('#nName').value.trim();
    if (!n) return toast('Gib dem Trip einen Namen');
    modalZu = null;
    modalSchliessen();
    await tripAnlegen(n.slice(0, 40), wahl);
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
      <button class="weg" data-weg="${id}" aria-label="Vom Handy entfernen">🗑</button>
    </li>`;
  }).join('');
  const k = modal(`
    <h2>Deine Trips</h2>
    <p class="lead">Trips bleiben auf diesem Handy gespeichert, bis du sie hier entfernst.</p>
    <ul class="trip-liste">${zeilen}</ul>
    <div class="knopf-reihe">
      <button class="knopf voll safran" id="mEinladen">Familie einladen</button>
      <button class="knopf voll" id="mNeu">＋ Neuer Trip</button>
      <button class="knopf voll leise" id="mCode">Mit Code beitreten</button>
      <button class="knopf voll leise" id="mName">Name ändern (${esc(ich.name || '–')})</button>
      ${installEvent ? '<button class="knopf voll leise" id="mInstall">Als App installieren</button>' : ''}
    </div>`);
  k.onclick = (e) => {
    const w = e.target.closest('[data-wahl]');
    if (w) { modalSchliessen(); tripWechseln(w.dataset.wahl); return; }
    const weg = e.target.closest('[data-weg]');
    if (weg) {
      const v = ansicht(weg.dataset.weg);
      if (confirm(`„${v.meta ? v.meta.n : 'Trip'}“ von diesem Handy entfernen?\n\nBei den anderen bleibt er erhalten. Mit dem Code kannst du jederzeit wieder beitreten.`)) {
        modalSchliessen();
        tripEntfernen(weg.dataset.weg);
      }
    }
  };
  k.querySelector('#mEinladen').onclick = () => einladenDialog();
  k.querySelector('#mNeu').onclick = () => neuerTripDialog();
  k.querySelector('#mCode').onclick = () => codeDialog();
  k.querySelector('#mName').onclick = () => nameDialog();
  const inst = k.querySelector('#mInstall');
  if (inst) inst.onclick = async () => { modalSchliessen(); installEvent.prompt(); installEvent = null; };
}

function nameDialog() {
  const k = modal(`
    <h2>Dein Name</h2>
    <p class="lead">So sehen die anderen, wer etwas abgestempelt hat.</p>
    <label class="feld"><input class="eingabe" id="dName" value="${esc(ich.name)}"></label>
    <button class="knopf voll safran" id="dOk">Speichern</button>`);
  k.querySelector('#dOk').onclick = () => {
    const n = k.querySelector('#dName').value.trim();
    if (!n) return;
    ich.name = n.slice(0, 24); LS.set('sp.ich', ich);
    trips.forEach((_, id) => mitgliedEintragen(id));
    modalSchliessen();
  };
}

function einladeLink(code) { return abs('./') + '#code=' + code; }

function einladenDialog(nachAnlegen) {
  const t = trips.get(aktuell);
  if (!t) return;
  const v = ansicht(aktuell);
  const link = einladeLink(t.code);
  let qrSvg = '';
  try { const q = window.qrcode(0, 'M'); q.addData(link); q.make(); qrSvg = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch {}
  const k = modal(`
    <h2>${nachAnlegen ? 'Trip angelegt! Jetzt die Familie dazuholen' : 'Familie einladen'}</h2>
    <p class="lead">Scannen, Link schicken oder Code abtippen. Wer dabei ist, sieht alle Orte und Stempel live.</p>
    <div class="qr">${qrSvg}</div>
    <div class="code-gross">${esc(t.code)}</div>
    <p class="klein" style="text-align:center;margin:0">Code für „${esc(v.meta ? v.meta.n : 'Trip')}“</p>
    <div class="knopf-reihe">
      ${navigator.share ? '<button class="knopf voll safran" id="eTeilen">Link senden (WhatsApp …)</button>' : ''}
      <button class="knopf voll ${navigator.share ? 'leise' : 'safran'}" id="eKopie">Link kopieren</button>
    </div>
    <p class="klein" style="margin-top:14px">Am iPhone: Link in Safari öffnen, „Zum Home-Bildschirm“ wählen und in der App „Mit Code beitreten“ – der Code steht auch in der Nachricht. Wer den Code hat, kann mitplanen und abstempeln.</p>`);
  const text = `Komm in unseren Trip „${v.meta ? v.meta.n : ''}“ im Stempelpass! 🗺️\n${link}\n\nCode: ${t.code}`;
  const te = k.querySelector('#eTeilen');
  if (te) te.onclick = async () => { try { await navigator.share({ title: 'Stempelpass', text }); } catch {} };
  k.querySelector('#eKopie').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Kopiert – jetzt in WhatsApp einfügen'); } catch { toast('Kopieren nicht möglich'); }
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
    ${offlineKarte ? '' : '<div class="knopf-reihe"><button class="knopf voll safran" id="sKarte">Offline-Karte jetzt laden (64 MB)</button></div>'}`,
  (k) => { const b = k.querySelector('#sKarte'); if (b) b.onclick = () => { modalSchliessen(); karteHerunterladen(); }; });
}

// ---------- Orte hinzufügen ----------
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
function katRaten(r) {
  const t = (r.type || '') + ' ' + (r.category || r.class || '') + ' ' + (r.name || '');
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

async function suchen(q, beschraenkt) {
  const b = map.getBounds();
  const p = new URLSearchParams({ format: 'jsonv2', q, limit: beschraenkt ? '1' : '8', 'accept-language': 'de,en', viewbox: [b.getWest() - 1, b.getNorth() + 1, b.getEast() + 1, b.getSouth() - 1].join(',') });
  const r = await fetch(NOMINATIM + '?' + p);
  if (!r.ok) throw new Error('Suche fehlgeschlagen');
  return (await r.json()).map((x) => ({ n: x.name || x.display_name.split(',')[0], ort: x.display_name, lat: +x.lat, lng: +x.lon, k: katRaten(x) }));
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
  const k = modal(`
    <h2>Ort hinzufügen</h2>
    <div class="tabs" id="hTabs">
      <button data-tab="suchen">Suchen</button>
      <button data-tab="liste">Liste</button>
      <button data-tab="karte">Karte / Link</button>
      <button data-tab="ohne">Ohne Ort</button>
    </div>
    <div id="hInhalt"></div>`);
  const inhalt = k.querySelector('#hInhalt');
  const zeigen = (t) => {
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
          inhalt.querySelector('#hTreffer').innerHTML = treffer.map((r, i) => `<li><button data-i="${i}"><span class="t-emo">${kat(r.k).emoji}</span><span style="min-width:0"><b>${esc(r.n)}</b><small>${esc(r.ort)}</small></span></button></li>`).join('');
        } catch { inhalt.querySelector('#hInfo').textContent = navigator.onLine ? 'Suche gerade nicht erreichbar.' : 'Offline – Suche geht nur mit Internet. Du kannst den Ort aber auf der Karte setzen.'; }
      };
      feld.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(los, 650); });
      feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(timer); los(); } });
      inhalt.querySelector('#hTreffer').onclick = (e) => {
        const b = e.target.closest('[data-i]'); if (!b) return;
        const r = treffer[+b.dataset.i];
        ortEditor({ n: r.n, k: r.k, lat: r.lat, lng: r.lng });
      };
      setTimeout(() => feld.focus(), 350);
    } else if (t === 'liste') {
      inhalt.innerHTML = `
        <p class="klein" style="margin-top:0">Eine Zeile pro Ort – wie auf eurem Zettel. Jeder Ort wird automatisch gesucht und auf die Karte gesetzt. Was nicht gefunden wird, kommt „ohne Ort“ in die Liste.</p>
        <textarea class="eingabe" id="lText" rows="7" placeholder="Wat Arun&#10;Grand Palace&#10;Lumpini Park"></textarea>
        <label class="feld" style="margin-top:10px"><span>Stadt / Land (hilft beim Finden)</span><input class="eingabe" id="lStadt" placeholder="z. B. Bangkok"></label>
        <button class="knopf voll safran" id="lOk">Alle hinzufügen</button>
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
          log.insertAdjacentHTML('beforeend', `<div>${r ? '✅' : '➖'} ${esc(z)}${r ? '' : ' <span class="klein">– ohne Ort, später bearbeiten</span>'}</div>`);
          log.scrollTop = log.scrollHeight;
          await new Promise((res) => setTimeout(res, 1100)); // Nominatim: höchstens 1 Anfrage pro Sekunde
        }
        e.target.disabled = false;
        e.target.textContent = 'Fertig – schließen';
        e.target.onclick = () => { modalSchliessen(); allesZeigen(); };
      };
    } else if (t === 'karte') {
      inhalt.innerHTML = `
        <button class="knopf voll safran" id="kSetzen">📍 Punkt auf der Karte setzen</button>
        <p class="klein">Tipp: Du kannst auch einfach lange auf die Karte drücken.</p>
        <label class="feld" style="margin-top:16px"><span>Oder Google-Maps-Link / Koordinaten einfügen</span><input class="eingabe" id="kLink" placeholder="https://www.google.com/maps/…@13.75,100.49 oder 13.75, 100.49"></label>
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
      inhalt.innerHTML = `
        <p class="klein" style="margin-top:0">Für Dinge ohne festen Ort – z. B. „Massage“, „Food Tour“ oder „Mango Sticky Rice essen“.</p>`;
      ortEditor({ lat: null, lng: null }, inhalt);
    }
  };
  k.querySelector('#hTabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (b) zeigen(b.dataset.tab); };
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
    <div class="kat-wahl" id="oKat">${Object.entries(KATEGORIEN).map(([k, c]) => `<button data-k="${k}" class="${k === katWahl ? 'an' : ''}">${c.emoji} ${esc(c.name)}</button>`).join('')}</div>
    <label class="feld" style="margin-top:12px"><span>Notiz</span><textarea class="eingabe" id="oNotiz" rows="3" placeholder="Öffnungszeiten, Tipps, wann hin …">${esc(o.notiz || '')}</textarea></label>
    ${o.lat != null ? `<p class="klein">📍 ${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}${neu ? '' : ' · <button class="textknopf" id="oVerschieben" style="height:30px">Position ändern</button>'}</p>` : ''}
    <div class="knopf-reihe">
      <button class="knopf voll safran" id="oOk">${neu ? 'Hinzufügen' : 'Speichern'}</button>
      ${neu ? '' : '<button class="knopf voll rot" id="oWeg">Ort löschen</button>'}
    </div>`;
  const k = ziel || modal(html);
  if (ziel) ziel.insertAdjacentHTML('beforeend', html);
  let vorschau = null;
  if (o.lat != null && neu && !ziel) {
    const el = document.createElement('div'); el.className = 'neu-pin';
    vorschau = new maplibregl.Marker({ element: el }).setLngLat([o.lng, o.lat]).addTo(map);
    map.easeTo({ center: [o.lng, o.lat], zoom: Math.max(map.getZoom(), 14), duration: 600, padding: { top: 60, bottom: innerHeight * 0.55, left: 0, right: 0 } });
    modalZu = () => vorschau && vorschau.remove();
  }
  k.querySelector('#oKat').onclick = (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    katWahl = b.dataset.k;
    k.querySelectorAll('#oKat button').forEach((x) => x.classList.toggle('an', x === b));
  };
  k.querySelector('#oOk').onclick = () => {
    const n = k.querySelector('#oName').value.trim();
    if (!n) return toast('Bitte einen Namen eingeben');
    const id = o.id || zufall(8);
    const alt = o.id ? trips.get(aktuell).data.records['p:' + id].v : {};
    schreiben(aktuell, 'p:' + id, { ...alt, n: n.slice(0, 80), k: katWahl, notiz: k.querySelector('#oNotiz').value.trim().slice(0, 1000), lat: o.lat ?? null, lng: o.lng ?? null, o: o.id ? alt.o : naechsteOrdnung() });
    modalSchliessen();
    if (vorschau) vorschau.remove();
    toast(neu ? `„${n}“ hinzugefügt` : 'Gespeichert');
    if (neu && o.lat != null) setTimeout(() => detailOeffnen(id), 250);
  };
  const weg = k.querySelector('#oWeg');
  if (weg) weg.onclick = () => {
    const rec = trips.get(aktuell).data.records['p:' + o.id];
    schreiben(aktuell, 'p:' + o.id, { ...rec.v, weg: true });
    modalSchliessen();
    zurListe();
    toast(`„${o.n}“ gelöscht`, 'Rückgängig', () => schreiben(aktuell, 'p:' + o.id, { ...rec.v, weg: false }));
  };
  const versch = k.querySelector('#oVerschieben');
  if (versch) versch.onclick = () => { modalSchliessen(); auswahlStarten(o); };
  if (!ziel && neu && !o.n) setTimeout(() => k.querySelector('#oName').focus(), 350);
}

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
  $('#auswahlAbbruch').onclick = ende;
  $('#auswahlOk').onclick = () => {
    const c = map.getCenter();
    ende();
    if (bestehend) {
      const rec = trips.get(aktuell).data.records['p:' + bestehend.id];
      schreiben(aktuell, 'p:' + bestehend.id, { ...rec.v, lat: c.lat, lng: c.lng });
      toast('Position geändert');
    } else ortEditor({ lat: c.lat, lng: c.lng });
  };
}

// ---------- Offline-Karte ----------
let laedt = false;
async function kartenChip() {
  const chip = $('#kartenChip');
  if (offlineKarte || laedt || !aktuell) { if (!laedt) chip.hidden = true; return; }
  const v = ansicht(aktuell);
  const inBangkok = v && v.orte.some((o) => o.lat != null && imGebiet(o.lng, o.lat));
  if (v && v.orte.length && !inBangkok) { chip.hidden = true; return; }
  chip.hidden = false;
  chip.style.setProperty('--fortschritt', 0);
  chip.innerHTML = `<span class="ico">⬇</span><span>Karte offline speichern · <b>${REGION.mb} MB</b></span>`;
  chip.onclick = karteHerunterladen;
}

async function karteHerunterladen() {
  if (laedt || offlineKarte) return;
  if (!navigator.onLine) return toast('Dafür braucht es Internet – am besten WLAN');
  const chip = $('#kartenChip');
  laedt = true;
  chip.hidden = false;
  chip.onclick = null;
  const zeigen = (p) => { chip.style.setProperty('--fortschritt', p); chip.innerHTML = `<span class="ico">⏳</span><span>Offline-Karte wird gespeichert · <b>${Math.round(p * 100)} %</b></span>`; };
  zeigen(0);
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
      zeigen(Math.min(1, da / gesamt));
    }
    const blob = new Blob(teile, { type: 'application/octet-stream' });
    const c = await caches.open(KARTEN_CACHE);
    await c.put(abs(REGION.datei), new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }));
    // Ab sofort aus dem Speicher lesen statt aus dem Netz
    protokoll.add(new pmtiles.PMTiles(new pmtiles.FileSource(new File([blob], REGION.name))));
    const quelle = map.getSource('protomaps');
    if (quelle && quelle.setUrl) quelle.setUrl('pmtiles://' + REGION.name);
    offlineKarte = true;
    chip.innerHTML = `<span class="ico">✅</span><span>Offline-Karte gespeichert</span>`;
    chip.style.setProperty('--fortschritt', 1);
    setTimeout(() => { chip.hidden = true; }, 3500);
  } catch (e) {
    console.warn(e);
    toast('Download abgebrochen – später nochmal versuchen');
    laedt = false;
    kartenChip();
    return;
  }
  laedt = false;
}

// ---------- Installation ----------
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; });

// ---------- Start ----------
$('#tripKnopf').onclick = () => (aktuell ? tripMenue() : willkommen());
$('#syncKnopf').onclick = () => syncDialog();
$('#einladenKnopf').onclick = () => (aktuell ? einladenDialog() : willkommen());
$('#ortungKnopf').onclick = () => ortungStarten(true);
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
  kartenChip();
  if (navigator.permissions) navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') ortungStarten(false); }).catch(() => {});
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /[?&]sw=1/.test(location.search))) {
    // Neue Version aktiv: einmal neu laden, damit sie sofort gilt (nicht beim allerersten Besuch)
    const hatteSW = !!navigator.serviceWorker.controller;
    let neuGeladen = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hatteSW || neuGeladen || !$('#modal').hidden) return;
      neuGeladen = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }
}

start();

// Für Tests in der Konsole
window.sp = { trips, sync, ansicht: () => ansicht(aktuell), ich, get map() { return map; } };
