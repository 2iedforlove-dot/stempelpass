// Lädt freie Bilder (Wikipedia-Hauptbild bzw. Wikimedia-Commons-Suche) für die Bangkok-Orte
// nach bilder/orte/<schluessel>.jpg und schreibt die Bildnachweise nach bilder/nachweise.json.
// Aufruf: node werkzeug/bilder.mjs [schluessel ...]
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';

const UA = { 'User-Agent': 'Stempelpass/1.0 (https://github.com/2iedforlove-dot/stempelpass; private Familien-Reise-App)' };
const warten = (ms) => new Promise((res) => setTimeout(res, ms));
const ZIEL = new URL('../bilder/quelle/', import.meta.url);
const NACHWEISE = new URL('../bilder/nachweise.json', import.meta.url);
mkdirSync(ZIEL, { recursive: true });

// Schlüssel -> Wikipedia-Titel (en) oder "commons:Suchbegriff"
export const QUELLEN = {
  'titel-bangkok': ['commons:Wat Arun Chao Phraya dusk'],
  hotel: ['commons:Bangkok Marriott Marquis Queen\'s Park', 'commons:Benchakitti Park lake skyline'],
  chatuchak: ['Chatuchak Weekend Market'],
  'wat-arun': ['Wat Arun'],
  'grand-palace': ['Grand Palace'],
  'wat-pho': ['Wat Pho'],
  benjakitti: ['Benchakitti Park', 'commons:Benchakitti Forest Park'],
  lumpini: ['Lumphini Park'],
  'ancient-city': ['Ancient Siam', 'Muang Boran'],
  massage: ['Thai massage'],
  rooftop: ['commons:Sky Bar lebua Bangkok night', 'State Tower'],
  'chao-phraya': ['Chao Phraya Express Boat'],
  'floating-market': ['Damnoen Saduak Floating Market'],
  'food-tour': ['Yaowarat Road'],
  'talat-noi': ['Talat Noi'],
  iconsiam: ['Iconsiam', 'commons:ICONSIAM'],
  emsphere: ['EmSphere', 'commons:EmSphere Bangkok'],
  mahanakhon: ['King Power Mahanakhon'],
  'bang-krachao': ['Bang Krachao'],
  ayutthaya: ['Ayutthaya Historical Park'],
  'golden-mount': ['Wat Saket'],
};

// Wikimedia drosselt schnell (429): langsam anfragen und bei 429 abwarten
async function holen(url) {
  for (let versuch = 0; versuch < 5; versuch++) {
    const r = await fetch(url, { headers: UA });
    if (r.status !== 429) return r;
    const pause = (+r.headers.get('retry-after') || 15) * 1000;
    console.log('  gedrosselt, warte', pause / 1000, 's');
    await warten(pause);
  }
  throw new Error('429 ' + url);
}
async function json(url) {
  await warten(1500);
  const r = await holen(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}

async function dateiAusWikipedia(titel) {
  const u = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=name&pilicense=free&redirects=1&format=json&titles=${encodeURIComponent(titel)}`;
  const j = await json(u);
  const seite = Object.values(j.query?.pages || {})[0];
  return seite?.pageimage ? 'File:' + seite.pageimage : null;
}

async function dateiAusCommons(suche) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=6&srlimit=8&format=json&srsearch=${encodeURIComponent(suche + ' filetype:bitmap')}`;
  const j = await json(u);
  return (j.query?.search || []).map((s) => s.title);
}

async function info(datei) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=800&format=json&titles=${encodeURIComponent(datei)}`;
  const j = await json(u);
  const s = Object.values(j.query?.pages || {})[0];
  const i = s?.imageinfo?.[0];
  if (!i) return null;
  const m = i.extmetadata || {};
  const text = (x) => String(x?.value || '').replace(/<[^>]+>/g, '').trim();
  return { datei, url: i.thumburl || i.url, seite: i.descriptionurl, breite: i.width, hoehe: i.height, urheber: text(m.Artist), lizenz: text(m.LicenseShortName) };
}

const nachweise = existsSync(NACHWEISE) ? JSON.parse(readFileSync(NACHWEISE, 'utf8')) : {};
const nur = process.argv.slice(2);
// "schluessel=Datei:..." erzwingt eine bestimmte Datei
const erzwungen = Object.fromEntries(nur.filter((a) => a.includes('=')).map((a) => a.split(/=(.*)/s).slice(0, 2)));
const schluessel = nur.length ? nur.map((a) => a.split('=')[0]) : Object.keys(QUELLEN).filter((k) => !existsSync(new URL(k + '.jpg', ZIEL)));

for (const k of schluessel) {
  let gefunden = null;
  const kandidaten = erzwungen[k] ? [erzwungen[k]] : [];
  if (!kandidaten.length) {
    for (const q of QUELLEN[k]) {
      try {
        if (q.startsWith('commons:')) kandidaten.push(...(await dateiAusCommons(q.slice(8))));
        else { const d = await dateiAusWikipedia(q); if (d) kandidaten.push(d); }
      } catch (e) { console.log('  Fehler', q, e.message); }
      if (kandidaten.length) break;
    }
  }
  for (const d of kandidaten) {
    const i = await info(d).catch(() => null);
    if (i && i.breite >= 600 && /^(CC|Public domain|PD)/i.test(i.lizenz)) { gefunden = i; break; }
  }
  if (!gefunden) { console.log('✗', k); continue; }
  const r = await holen(gefunden.url);
  writeFileSync(new URL(k + '.jpg', ZIEL), Buffer.from(await r.arrayBuffer()));
  nachweise[k] = { datei: gefunden.datei, seite: gefunden.seite, urheber: gefunden.urheber, lizenz: gefunden.lizenz };
  console.log('✓', k.padEnd(16), gefunden.lizenz.padEnd(14), gefunden.datei.slice(0, 70));
  await new Promise((res) => setTimeout(res, 400));
}
writeFileSync(NACHWEISE, JSON.stringify(nachweise, null, 2));
