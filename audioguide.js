// Audio-Guide für jede Sehenswürdigkeit der Welt – ohne KI-Schlüssel:
// Text aus dem Wikipedia-Artikel (Überblick, Geschichte, Architektur), Fun Facts aus Wikidata
// (Baujahr, UNESCO, Höhe, Architekt …), vorgelesen von der Stimme des Handys (Web Speech API).

const WD_API = 'https://www.wikidata.org/w/api.php';
const LS_PREFIX = 'sp.guide.v1.';

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Wie ähnlich sind zwei Namen? (Anteil gemeinsamer Wörter)
function aehnlich(a, b) {
  const x = new Set(norm(a).split(' ').filter((w) => w.length > 1)), y = new Set(norm(b).split(' ').filter((w) => w.length > 1));
  if (!x.size || !y.size) return 0;
  let gleich = 0;
  x.forEach((w) => { if (y.has(w)) gleich++; });
  return gleich / Math.min(x.size, y.size);
}

// Wikidata-ID eines Orts finden: gespeichert, über einen bekannten Wikipedia-Titel oder über Artikel in der Nähe
async function qidFinden(ort, sprache) {
  if (ort.wd) return ort.wd;
  if (ort.wiki) {
    const j = await json(`https://en.wikipedia.org/w/api.php?action=query&prop=pageprops&redirects=1&format=json&origin=*&titles=${encodeURIComponent(ort.wiki)}`);
    const s = Object.values(j.query.pages)[0];
    if (s && s.pageprops && s.pageprops.wikibase_item) return s.pageprops.wikibase_item;
  }
  if (ort.lat == null) return null;
  let best = null;
  for (const l of [...new Set([sprache, 'en'])]) {
    const j = await json(`https://${l}.wikipedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${ort.lat}|${ort.lng}&ggsradius=600&ggslimit=15&prop=pageprops|coordinates&format=json&origin=*`);
    for (const s of Object.values((j.query && j.query.pages) || {})) {
      const qid = s.pageprops && s.pageprops.wikibase_item;
      if (!qid) continue;
      const wert = aehnlich(ort.n, s.title) + (ort.orig ? aehnlich(ort.orig, s.title) : 0);
      if (wert >= 0.5 && (!best || wert > best.wert)) best = { qid, wert };
    }
    if (best) return best.qid;
  }
  return null;
}

// Text in Abschnitte zerlegen: { '': Einleitung, 'Geschichte': …, … }
function abschnitte(text) {
  const teile = {};
  let titel = '', ebene2 = '';
  for (const zeile of text.split('\n')) {
    const m = /^(=+)\s*(.+?)\s*=+$/.exec(zeile.trim());
    if (m) { if (m[1].length === 2) ebene2 = m[2]; titel = m[1].length === 2 ? m[2] : ebene2; continue; }
    if (!zeile.trim()) continue;
    teile[titel] = (teile[titel] ? teile[titel] + ' ' : '') + zeile.trim();
  }
  return teile;
}

// Vorlesetext säubern: Klammern mit fremder Schrift oder Lautschrift, eckige Klammern, doppelte Leerzeichen
function saeubern(s) {
  let t = s;
  for (let i = 0; i < 3; i++) t = t.replace(/\s*\([^()]*\)/g, (m) => (/[^\u0000-ɏ -⁯]|\[|;|ˈ|ʔ/.test(m) || m.length > 70 ? '' : m));
  return t.replace(/\[[^\]]*\]/g, '').replace(/[^\u0000-ɏḀ-ỿ -⁯€]+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

// In Sätze teilen, ohne bei "19. Jahrhundert", "z. B." oder "St." zu trennen
const ABK = new Set(['z', 'b', 'st', 'jh', 'nr', 'bzw', 'ca', 'dr', 'u', 'a', 'v', 'chr', 'n', 'mr', 'mrs', 'ms', 'vs', 'etc', 'ff', 'vgl', 'inkl', 'hl', 'gest', 'geb', 'sog', 'ggf', 'evtl', 'usw', 'dt', 'engl', 'frz', 'lat', 'jan', 'feb', 'aug', 'sept', 'okt', 'nov', 'dez', 'no', 'mt', 'ft']);
export function saetze(text) {
  const raus = [];
  let start = 0;
  const re = /[.!?]["“”»«]?\s+(?=[A-ZÄÖÜ"„“«»(])/g;
  let m;
  while ((m = re.exec(text))) {
    const vorher = text.slice(start, m.index).split(/\s+/).pop() || '';
    const wort = vorher.replace(/[^\p{L}\d]/gu, '').toLowerCase();
    // "19. Jahrhundert" ist eine Ordnungszahl, "1782. The king" ein Satzende (Jahreszahlen haben 3–4 Stellen)
    if ((/^\d{1,2}$/.test(wort)) || ABK.has(wort) || (wort.length === 1 && !/\d/.test(wort))) continue;
    raus.push(text.slice(start, m.index + 1).trim());
    start = m.index + m[0].length;
  }
  const rest = text.slice(start).trim();
  if (rest) raus.push(rest);
  return raus.filter((x) => x.length > 2);
}

// Nur ganze Sätze bis ungefähr zur gewünschten Länge
function kuerzen(text, max) {
  const liste = [];
  let laenge = 0;
  for (const s of saetze(text)) {
    if (laenge && laenge + s.length > max) break;
    liste.push(s); laenge += s.length;
  }
  return liste;
}

function jahrAus(zeit) {
  const m = /^([+-])(\d+)-/.exec(zeit.time || '');
  if (!m) return null;
  const j = +m[2] * (m[1] === '-' ? -1 : 1);
  return { jahr: j, genau: zeit.precision };
}

// Fun Facts aus Wikidata-Aussagen bauen
async function fakten(ent, name, sprache, t) {
  const c = ent.claims || {};
  const wert = (p) => (c[p] && c[p][0] && c[p][0].mainsnak.datavalue ? c[p][0].mainsnak.datavalue.value : null);
  const liste = [];
  const ids = ['P84', 'P149', 'P138', 'P112'].map((p) => wert(p)).filter((x) => x && x.id).map((x) => x.id);
  let labels = {};
  if (ids.length) {
    const e = await json(`${WD_API}?action=wbgetentities&ids=${ids.join('|')}&props=labels&languages=${sprache}|en&format=json&origin=*`);
    labels = Object.fromEntries(Object.entries(e.entities).map(([k, v]) => [k, (v.labels[sprache] || v.labels.en || {}).value]));
  }
  const inception = wert('P571');
  if (inception) {
    const j = jahrAus(inception);
    if (j && j.genau >= 9) liste.push(t('{ort} entstand im Jahr {jahr}.', { ort: name, jahr: j.jahr < 0 ? t('{n} vor Christus', { n: -j.jahr }) : j.jahr }));
    else if (j && j.genau === 7) liste.push(t('{ort} entstand im {n}. Jahrhundert.', { ort: name, n: Math.ceil(Math.abs(j.jahr) / 100) }));
    if (j && j.genau >= 9 && j.jahr > 0) {
      const alter = new Date().getFullYear() - j.jahr;
      if (alter > 50) liste.push(t('Das ist {n} Jahre her – ungefähr {g} Generationen.', { n: alter, g: Math.round(alter / 25) }));
    }
  }
  const erbe = (c.P1435 || []).find((x) => x.mainsnak.datavalue && x.mainsnak.datavalue.value.id === 'Q9259');
  if (erbe) {
    const seit = erbe.qualifiers && erbe.qualifiers.P580 && jahrAus(erbe.qualifiers.P580[0].datavalue.value);
    liste.push(seit ? t('Seit {jahr} gehört der Ort zum UNESCO-Welterbe.', { jahr: seit.jahr }) : t('Der Ort gehört zum UNESCO-Welterbe.'));
  }
  const hoehe = wert('P2048');
  if (hoehe && /Q11573$/.test(hoehe.unit)) {
    const h = Math.round(+hoehe.amount);
    if (h > 5) liste.push(t('Er ragt {h} Meter in die Höhe – das sind etwa {s} Stockwerke.', { h, s: Math.round(h / 3) }));
  }
  const stock = wert('P1101');
  if (stock && +stock.amount > 3) liste.push(t('Das Gebäude hat {n} Stockwerke.', { n: Math.round(+stock.amount) }));
  const besucher = (c.P1174 || []).map((x) => x.mainsnak.datavalue && +x.mainsnak.datavalue.value.amount).filter(Boolean).sort((a, b) => b - a)[0];
  if (besucher) liste.push(t('Jedes Jahr kommen rund {n} Besucher – das sind etwa {t} pro Tag.', { n: besucher.toLocaleString(sprache === 'en' ? 'en-GB' : 'de-AT'), t: Math.round(besucher / 365).toLocaleString(sprache === 'en' ? 'en-GB' : 'de-AT') }));
  const architekt = wert('P84');
  if (architekt && labels[architekt.id]) liste.push(t('Entworfen hat es {name}.', { name: labels[architekt.id] }));
  const stil = wert('P149');
  if (stil && labels[stil.id]) liste.push(t('Der Baustil: {stil}.', { stil: labels[stil.id] }));
  const nach = wert('P138');
  if (nach && labels[nach.id]) liste.push(t('Benannt ist es nach {name}.', { name: labels[nach.id] }));
  const gruender = wert('P112');
  if (gruender && labels[gruender.id]) liste.push(t('Gegründet wurde es von {name}.', { name: labels[gruender.id] }));
  const sprachen = Object.keys(ent.sitelinks || {}).filter((k) => /wiki$/.test(k) && !/commons|species|wikidata/.test(k)).length;
  if (sprachen >= 20) liste.push(t('Über {ort} gibt es Wikipedia-Artikel in {n} Sprachen – es ist weltweit bekannt.', { ort: name, n: sprachen }));
  return liste;
}

const KAPITEL = [
  { id: 'geschichte', muster: /geschicht|histor|history|background|entstehung|baugeschichte|origins?/i, max: 1500 },
  { id: 'architektur', muster: /architekt|architecture|gebäude|anlage|bauwerk|design|beschreibung|description|layout|aufbau|structure|features?/i, max: 900 },
  { id: 'legenden', muster: /myth|legend|sage|trivia|wissenswert|kurios|rezeption|popular culture|in culture/i, max: 600 },
];

// Fertigen Guide laden (aus dem Speicher oder neu aus dem Netz)
export async function guideLaden(ort, sprache, t) {
  const schluessel = LS_PREFIX + (ort.wd || norm(ort.orig || ort.n)) + '.' + sprache;
  try { const g = JSON.parse(localStorage.getItem(schluessel)); if (g) return g; } catch {}
  const qid = await qidFinden(ort, sprache);
  if (!qid) return null;
  const e = await json(`${WD_API}?action=wbgetentities&ids=${qid}&props=sitelinks|claims|labels&languages=${sprache}|en&format=json&origin=*`);
  const ent = e.entities[qid];
  const sl = ent.sitelinks || {};
  const wikiSprache = sl[sprache + 'wiki'] ? sprache : sl.enwiki ? 'en' : null;
  if (!wikiSprache) return null;
  const titel = sl[wikiSprache + 'wiki'].title;
  const j = await json(`https://${wikiSprache}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&origin=*&titles=${encodeURIComponent(titel)}`);
  const seite = Object.values(j.query.pages)[0];
  const teile = abschnitte(seite.extract || '');
  const name = ort.n;
  const kapitel = [];
  const intro = kuerzen(saeubern(teile[''] || ''), 900);
  if (intro.length) kapitel.push({ id: 'ueberblick', saetze: intro });
  const benutzt = new Set(['']);
  for (const k of KAPITEL) {
    const ueberschrift = Object.keys(teile).find((h) => !benutzt.has(h) && k.muster.test(h));
    if (!ueberschrift) continue;
    benutzt.add(ueberschrift);
    const s = kuerzen(saeubern(teile[ueberschrift]), k.max);
    if (s.length) kapitel.push({ id: k.id, saetze: s });
  }
  const f = await fakten(ent, name, sprache, t);
  if (f.length) kapitel.push({ id: 'fakten', saetze: f });
  if (!kapitel.length) return null;
  const zeichen = kapitel.reduce((n, k) => n + k.saetze.join(' ').length, 0);
  const guide = {
    qid, sprache: wikiSprache, titel, kapitel, sekunden: Math.round(zeichen / 14),
    quelle: `https://${wikiSprache}.wikipedia.org/wiki/${encodeURIComponent(titel.replace(/ /g, '_'))}`,
    fremdsprache: wikiSprache !== sprache,
  };
  try { localStorage.setItem(schluessel, JSON.stringify(guide)); } catch {}
  return guide;
}

// ---------- Vorlesen ----------
// Satz für Satz sprechen: so lässt sich der aktuelle Satz hervorheben, springen und pausieren
// (lange Texte am Stück bricht Chrome nach ~15 s ab).
export class Sprecher {
  constructor(beiAenderung) {
    this.beiAenderung = beiAenderung;
    this.liste = []; // [{kapitel, text}]
    this.i = 0;
    this.laeuft = false;
    this.tempo = 1;
    this.ortId = null;
    this.guide = null;
    this.verfuegbar = 'speechSynthesis' in window;
    if (this.verfuegbar) speechSynthesis.addEventListener?.('voiceschanged', () => { this.stimmeCache = null; });
  }

  laden(ortId, guide) {
    this.stop();
    this.ortId = ortId; this.guide = guide;
    this.liste = guide.kapitel.flatMap((k) => k.saetze.map((text) => ({ kapitel: k.id, text })));
    this.i = 0;
  }

  stimme(lang) {
    if (this.stimmeCache && this.stimmeCache.lang === lang) return this.stimmeCache.v;
    const alle = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
    // Hochwertige Stimmen bevorzugen (Apple "Premium/Enhanced", Google, Microsoft "Natural")
    const punkte = (v) => (/premium|enhanced|natural|neural|siri/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0) + (/de-de|en-gb/i.test(v.lang) ? 1 : 0);
    const v = alle.sort((a, b) => punkte(b) - punkte(a))[0] || null;
    this.stimmeCache = { lang, v };
    return v;
  }

  sprechen() {
    const satz = this.liste[this.i];
    if (!satz) { this.laeuft = false; this.i = 0; this.beiAenderung(); return; }
    const u = new SpeechSynthesisUtterance(satz.text);
    const lang = this.guide.sprache === 'en' ? 'en' : 'de';
    u.lang = lang === 'en' ? 'en-GB' : 'de-DE';
    const v = this.stimme(lang);
    if (v) u.voice = v;
    u.rate = this.tempo;
    u.onend = () => { if (this.u !== u || !this.laeuft) return; this.i++; this.beiAenderung(); this.sprechen(); };
    u.onerror = (e) => { if (this.u === u && e.error !== 'interrupted' && e.error !== 'canceled') { this.laeuft = false; this.beiAenderung(); } };
    this.u = u; // Referenz halten, sonst feuert onend in Chrome manchmal nicht
    speechSynthesis.speak(u);
  }

  start(ab) {
    if (!this.verfuegbar || !this.liste.length) return;
    if (ab != null) this.i = Math.max(0, Math.min(this.liste.length - 1, ab));
    speechSynthesis.cancel();
    this.laeuft = true;
    this.beiAenderung();
    this.sprechen();
  }

  pause() { this.laeuft = false; this.u = null; speechSynthesis.cancel(); this.beiAenderung(); }
  umschalten() { if (this.laeuft) this.pause(); else this.start(); }
  springen(n) { const war = this.laeuft; this.i = Math.max(0, Math.min(this.liste.length - 1, this.i + n)); if (war) this.start(); else this.beiAenderung(); }
  kapitel(id) { const i = this.liste.findIndex((s) => s.kapitel === id); if (i >= 0) this.start(i); }
  tempoWechseln() { this.tempo = this.tempo >= 1.5 ? 0.9 : this.tempo >= 1.2 ? 1.5 : this.tempo >= 1 ? 1.25 : 1; if (this.laeuft) this.start(); else this.beiAenderung(); }
  stop() { this.laeuft = false; this.u = null; if (this.verfuegbar) speechSynthesis.cancel(); }
}
