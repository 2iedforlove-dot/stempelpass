// Weltkarte und Offline-Karten für jedes Reiseziel – ohne eigenen Server, ohne Schlüssel.
// Quelle: OpenFreeMap (Vektorkacheln im OpenMapTiles-Schema). Offline-Downloads sind dort ausdrücklich
// erlaubt, solange ein Download höchstens 3.000 Kacheln oder 50 MB groß ist und höchstens 4 Anfragen
// gleichzeitig laufen (openfreemap.org). Daran halten wir uns.
// Die Kacheln laufen über ein eigenes Protokoll "welt://z/x/y": erst der Offline-Speicher, dann das Netz.
// Gespeichert wird gzip-komprimiert (Vektorkacheln schrumpfen dabei auf etwa ein Drittel).

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const CACHE = 'sp-welt';
const SCHLUESSEL = (z, x, y) => `https://kacheln.stempelpass.invalid/${z}/${x}/${y}`;
export const MAX_KACHELN = 3000;
export const MAX_BYTES = 50e6;
export const ATTRIBUTION = '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Daten von <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// ---------- Kachel-Adresse (wechselt bei OpenFreeMap wöchentlich) ----------
let vorlage = null;
async function kachelVorlage() {
  if (vorlage) return vorlage;
  try {
    const alt = JSON.parse(localStorage.getItem('sp.welt.vorlage') || 'null');
    if (alt && Date.now() - alt.at < 864e5) return (vorlage = alt.url);
  } catch {}
  const j = await (await fetch(TILEJSON)).json();
  vorlage = j.tiles[0];
  try { localStorage.setItem('sp.welt.vorlage', JSON.stringify({ url: vorlage, at: Date.now() })); } catch {}
  return vorlage;
}
const kachelUrl = (v, z, x, y) => v.replace('{z}', z).replace('{x}', x).replace('{y}', y);

// ---------- gzip im Speicher ----------
const kannGzip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
async function packen(buf) {
  if (!kannGzip) return { body: buf, gz: false };
  return { body: await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer(), gz: true };
}
async function auspacken(r) {
  if (r.headers.get('x-gz') !== '1') return r.arrayBuffer();
  return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

// ---------- Protokoll für MapLibre ----------
let cache = null;
const cacheOffen = () => (cache = cache || caches.open(CACHE));
export function weltProtokoll() {
  return async (params, abbruch) => {
    const [z, x, y] = params.url.slice('welt://'.length).split('/').map(Number);
    try {
      const r = await (await cacheOffen()).match(SCHLUESSEL(z, x, y));
      if (r) return { data: await auspacken(r) };
    } catch {}
    // Fehlt eine Kachel offline, melden wir einen Fehler statt einer leeren Kachel:
    // dann zeigt MapLibre die gröbere Kachel darüber vergrößert an, statt eine leere Fläche
    if (!navigator.onLine) throw new Error('offline');
    const v = await kachelVorlage();
    const res = await fetch(kachelUrl(v, z, x, y), { signal: abbruch && abbruch.signal });
    if (res.status === 204 || res.status === 404) return { data: new ArrayBuffer(0) }; // dort ist wirklich nichts (z. B. Meer)
    if (!res.ok) throw new Error('Kachel ' + res.status);
    return { data: await res.arrayBuffer() };
  };
}

// ---------- Welche Kacheln braucht eine Reise? ----------
function kachelXY(lat, lng, z) {
  const n = 2 ** z, r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return [Math.min(n - 1, Math.max(0, Math.floor(((lng + 180) / 360) * n))), Math.min(n - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)))];
}
function bereich(set, s, w, n, o, zVon, zBis) {
  for (let z = zVon; z <= zBis; z++) {
    const [x1, y1] = kachelXY(n, w, z), [x2, y2] = kachelXY(s, o, z);
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) set.add(`${z}/${x}/${y}`);
  }
}
const umkreis = (set, p, km, zVon, zBis) => {
  const dLat = km / 111, dLng = km / (111 * Math.max(0.15, Math.cos((p.lat * Math.PI) / 180)));
  bereich(set, p.lat - dLat, p.lng - dLng, p.lat + dLat, p.lng + dLng, zVon, zBis);
};

// Grobe Schätzung der Downloadgröße (gzip-Übertragung) – gemessen in Lissabon, Kyoto, Paris, Bangkok
const SCHAETZUNG = { 11: 40e3, 12: 70e3, 13: 60e3, 14: 220e3 };
export const schaetzeBytes = (kacheln) => kacheln.reduce((n, k) => n + (SCHAETZUNG[+k.split('/')[0]] || 15e3), 0);

// Volle Details (z14) rund um jeden Ort, mittlere Auflösung (z13) um die Orte und bei Stadtreisen um die Mitte,
// dazu eine Übersicht des ganzen Gebiets – je größer das Gebiet, desto gröber (Rundreise ≠ Städtetrip).
// Alles muss in 3.000 Kacheln und gut 45 MB passen, sonst werden die Ringe schrittweise kleiner.
export function regionKacheln(mitte, orte) {
  const punkte = orte.length ? orte : [mitte];
  const alle = [mitte, ...punkte].filter((p) => p && p.lat != null);
  const lats = alle.map((p) => p.lat), lngs = alle.map((p) => p.lng);
  const rand = 0.08;
  const box = [Math.min(...lats) - rand, Math.min(...lngs) - rand, Math.max(...lats) + rand, Math.max(...lngs) + rand];
  let ueberblick = new Set();
  for (let z = 12; z >= 5; z--) {
    const s = new Set();
    bereich(s, ...box, 0, z);
    if (s.size <= 900 || z === 5) { ueberblick = s; break; }
  }
  const stadt = punkte.every((p) => Math.abs(p.lat - mitte.lat) < 0.4 && Math.abs(p.lng - mitte.lng) < 0.4 / Math.max(0.2, Math.cos((mitte.lat * Math.PI) / 180)));
  let ergebnis = [];
  for (const [kern, ring13, ring14] of [[8, 3, 1.2], [5, 2, 1], [3, 1.5, 0.8], [0, 1, 0.5], [0, 0.5, 0.3]]) {
    const set = new Set(ueberblick);
    if (kern && stadt) umkreis(set, mitte, kern, 13, 13);
    // Lückenlose Zoomkette um jeden Ort, damit beim Hineinzoomen offline nichts leer bleibt
    punkte.forEach((o) => { umkreis(set, o, ring13 * 2, 11, 12); umkreis(set, o, ring13, 13, 13); umkreis(set, o, ring14, 14, 14); });
    ergebnis = [...set];
    if (ergebnis.length <= MAX_KACHELN && schaetzeBytes(ergebnis) <= 45e6) return ergebnis;
  }
  // Notfalls die gröbsten Kacheln zuerst behalten
  return ergebnis.sort((a, b) => +a.split('/')[0] - +b.split('/')[0]).slice(0, MAX_KACHELN);
}

// ---------- Herunterladen ----------
// fortschritt({ fertig, gesamt, bytes }) wird regelmäßig aufgerufen; Ergebnis: { kacheln, bytes, voll }
export async function regionLaden(kacheln, fortschritt, abbruch) {
  const v = await kachelVorlage();
  const c = await cacheOffen();
  let i = 0, fertig = 0, bytes = 0, gespeichert = 0, voll = false, fehler = null;
  const geladen = [];
  const arbeiter = () => arbeiten().catch((e) => { fehler = e; voll = true; });
  const arbeiten = async () => {
    while (i < kacheln.length && !voll && !(abbruch && abbruch.abgebrochen)) {
      const k = kacheln[i++];
      const [z, x, y] = k.split('/');
      if (!(await c.match(SCHLUESSEL(z, x, y)))) {
        let res = null;
        for (let versuch = 0; versuch < 3 && !res; versuch++) {
          try { const r = await fetch(kachelUrl(v, z, x, y)); if (r.ok || r.status === 204 || r.status === 404) res = r; } catch {}
          if (!res) await new Promise((s) => setTimeout(s, 800 * (versuch + 1)));
        }
        if (!res) throw new Error('Kachel ' + k);
        const roh = res.ok ? await res.arrayBuffer() : new ArrayBuffer(0);
        bytes += +res.headers.get('content-length') || roh.byteLength / 2.5;
        const { body, gz } = await packen(roh);
        gespeichert += body.byteLength;
        await c.put(SCHLUESSEL(z, x, y), new Response(body, { headers: { 'x-gz': gz ? '1' : '0' } }));
        if (bytes >= MAX_BYTES) voll = true;
      }
      geladen.push(k);
      fertig++;
      fortschritt && fortschritt({ fertig, gesamt: kacheln.length, bytes });
    }
  };
  await Promise.all([arbeiter(), arbeiter(), arbeiter(), arbeiter()]);
  // Ohne eine einzige Kachel war es ein Fehler; sonst zählt, was geschafft ist (teilweise = Netz weg oder 50-MB-Grenze)
  if (fehler && !geladen.length) throw fehler;
  return { kacheln: geladen, bytes: Math.round(bytes), gespeichert, teilweise: geladen.length < kacheln.length };
}

// Kacheln löschen, die keine andere Region mehr braucht
export async function regionLoeschen(kacheln, nochGebraucht) {
  const c = await cacheOffen();
  await Promise.all(kacheln.filter((k) => !nochGebraucht.has(k)).map((k) => { const [z, x, y] = k.split('/'); return c.delete(SCHLUESSEL(z, x, y)); }));
}

// ---------- Kartenstil im OpenMapTiles-Schema, passend zu den Farben der Protomaps-Karte ----------
export function weltSchichten(f, sprache, hell) {
  // Nur lateinische Namen: für andere Schriften (Japanisch, Arabisch …) gibt es offline keine Schriftzeichen,
  // und eine fehlende Schrift lässt MapLibre die ganze Kachel verwerfen
  const name = ['coalesce', ['get', 'name:' + sprache], ['get', 'name:en'], ['get', 'name:latin'], ''];
  const breite = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], 10, a, 18, b];
  const strasse = (id, klassen, farbe, a, b, min = 5) => ({ id, type: 'line', source: 'welt', 'source-layer': 'transportation', minzoom: min, filter: ['in', ['get', 'class'], ['literal', klassen]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': farbe, 'line-width': breite(a, b) } });
  const halo = hell ? '#ffffff' : (f.city_label_halo || '#161618');
  const text = (id, layer, filter, groesse, farbe, font = 'Noto Sans Regular', extra = {}) => ({
    id, type: 'symbol', source: 'welt', 'source-layer': layer, filter,
    layout: { 'text-field': name, 'text-font': [font], 'text-size': groesse, 'text-max-width': 8, ...extra.layout },
    paint: { 'text-color': farbe, 'text-halo-color': halo, 'text-halo-width': 1.4, ...extra.paint },
    ...(extra.min != null ? { minzoom: extra.min } : {}), ...(extra.max != null ? { maxzoom: extra.max } : {}),
  });
  const ortsklasse = (k) => ['==', ['get', 'class'], k];
  return [
    { id: 'w-wald', type: 'fill', source: 'welt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]], paint: { 'fill-color': f.wood_a, 'fill-opacity': 0.8 } },
    { id: 'w-gruen', type: 'fill', source: 'welt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wetland', 'farmland']]], paint: { 'fill-color': f.park_a, 'fill-opacity': 0.45 } },
    { id: 'w-sand', type: 'fill', source: 'welt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['sand', 'ice']]], paint: { 'fill-color': f.beach || f.other, 'fill-opacity': 0.6 } },
    { id: 'w-park', type: 'fill', source: 'welt', 'source-layer': 'park', paint: { 'fill-color': f.park_b } },
    { id: 'w-nutzung', type: 'fill', source: 'welt', 'source-layer': 'landuse', filter: ['in', ['get', 'class'], ['literal', ['cemetery', 'stadium', 'pitch', 'playground', 'garden']]], paint: { 'fill-color': f.park_a, 'fill-opacity': 0.6 } },
    { id: 'w-wasser', type: 'fill', source: 'welt', 'source-layer': 'water', paint: { 'fill-color': f.water } },
    { id: 'w-fluss', type: 'line', source: 'welt', 'source-layer': 'waterway', paint: { 'line-color': f.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2.5, 18, 6] } },
    { id: 'w-piste', type: 'line', source: 'welt', 'source-layer': 'aeroway', minzoom: 11, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': f.other, 'line-width': breite(1, 30) } },
    { id: 'w-gebaeude', type: 'fill', source: 'welt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': f.buildings, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 1] } },
    { id: 'w-grenze-land', type: 'line', source: 'welt', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': f.boundaries || (hell ? '#b9b9c3' : '#4a4a52'), 'line-width': 1.2, 'line-dasharray': [3, 2] } },
    { id: 'w-grenze-region', type: 'line', source: 'welt', 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': f.boundaries || (hell ? '#cfcfd6' : '#38383f'), 'line-width': 0.8, 'line-dasharray': [2, 2] } },
    { id: 'w-weg', type: 'line', source: 'welt', 'source-layer': 'transportation', minzoom: 14, filter: ['in', ['get', 'class'], ['literal', ['path', 'track', 'pedestrian']]], paint: { 'line-color': f.minor_service || f.minor_a, 'line-width': breite(0.5, 2), 'line-dasharray': [2, 1.5] } },
    { id: 'w-bahn', type: 'line', source: 'welt', 'source-layer': 'transportation', minzoom: 10, filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]], paint: { 'line-color': f.railway || (hell ? '#c3c3cb' : '#3d3d43'), 'line-width': breite(0.6, 2.5), 'line-dasharray': [3, 2] } },
    { id: 'w-faehre', type: 'line', source: 'welt', 'source-layer': 'transportation', filter: ['==', ['get', 'class'], 'ferry'], paint: { 'line-color': hell ? '#7fb3dc' : '#2a4558', 'line-width': 1, 'line-dasharray': [2, 2] } },
    ...(hell ? [{ id: 'w-strasse-rand', type: 'line', source: 'welt', 'source-layer': 'transportation', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'tertiary', 'secondary', 'primary', 'trunk', 'motorway']]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d9dbe3', 'line-width': breite(1.6, 22) } }] : []),
    strasse('w-strasse-klein', ['minor', 'service'], f.minor_a, 0.4, 14, 12),
    strasse('w-strasse-mittel', ['tertiary', 'secondary'], f.minor_b || f.minor_a, 0.7, 18, 9),
    strasse('w-strasse-gross', ['primary', 'trunk'], f.major, 0.9, 22, 6),
    strasse('w-autobahn', ['motorway'], f.highway, 1, 24, 5),
    text('w-wasser-name', 'water_name', ['==', ['geometry-type'], 'Point'], 12, f.ocean_label || (hell ? '#5a86a8' : '#4a5a66'), 'Noto Sans Italic'),
    text('w-strassen-name', 'transportation_name', ['in', ['get', 'class'], ['literal', ['primary', 'secondary', 'tertiary', 'minor', 'trunk']]], ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 13], f.roads_label_minor || f.city_label, 'Noto Sans Regular',
      { min: 13, layout: { 'symbol-placement': 'line', 'text-rotation-alignment': 'map' }, paint: { 'text-halo-color': hell ? '#ffffff' : (f.roads_label_minor_halo || halo) } }),
    text('w-viertel', 'place', ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]], ['interpolate', ['linear'], ['zoom'], 11, 10, 16, 13], f.subplace_label || f.city_label, 'Noto Sans Regular', { min: 11, layout: { 'text-transform': 'uppercase', 'text-letter-spacing': 0.06 } }),
    text('w-dorf', 'place', ['in', ['get', 'class'], ['literal', ['village', 'hamlet']]], ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 13], f.city_label, 'Noto Sans Regular', { min: 10 }),
    text('w-stadt', 'place', ['in', ['get', 'class'], ['literal', ['city', 'town']]], ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 13, 13, 18], f.city_label, 'Noto Sans Medium',
      { layout: { 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99] } }),
    text('w-region', 'place', ortsklasse('state'), ['interpolate', ['linear'], ['zoom'], 4, 10, 8, 13], f.state_label || f.subplace_label || f.city_label, 'Noto Sans Regular', { min: 4, max: 9, layout: { 'text-transform': 'uppercase', 'text-letter-spacing': 0.08 } }),
    text('w-land', 'place', ortsklasse('country'), ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 15], f.country_label || f.city_label, 'Noto Sans Medium', { max: 8 }),
  ];
}
