// Öffentliche Reisepläne: teilen, finden, übernehmen, bewerten – ohne eigenen Server.
// Ein Plan ist ein öffentliches, signiertes Nostr-Event (kind 30078, ersetzbar über das d-Tag) mit dem
// Schlagwort "stempelpass-plan" und Geohash-Tags, damit die Relays nach Gegend filtern können.
// Bewertungen und Übernahmen sind eigene kleine Events, die per 'a'-Tag auf den Plan zeigen.
// Jedes Handy hat dafür einen eigenen Schlüssel (sp.schluessel) – ohne Konto, ohne Namen außer dem,
// den man selbst angibt. Nie veröffentlicht werden: Unterkünfte, Notizen, Fotos, Tagebuch, Mitreisende, Stempel.
import { RELAYS } from './sync.js';
import { KATEGORIEN } from './vorlagen.js';

const NT = window.NostrTools;
const KIND = 30078;
const T_PLAN = 'stempelpass-plan', T_BEWERTUNG = 'stempelpass-bewertung', T_KOPIE = 'stempelpass-kopie';
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------- Eigener Schlüssel ----------
let sk = null;
function schluessel() {
  if (sk) return sk;
  let h = null;
  try { h = localStorage.getItem('sp.schluessel'); } catch {}
  if (!h || !/^[0-9a-f]{64}$/.test(h)) {
    h = hex(NT.generateSecretKey());
    try { localStorage.setItem('sp.schluessel', h); } catch {}
  }
  sk = Uint8Array.from(h.match(/../g), (x) => parseInt(x, 16));
  return sk;
}
export const meinPk = () => NT.getPublicKey(schluessel());

// ---------- Geohash (für die Suche nach Gegend) ----------
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
export function geohash(lat, lng, laenge) {
  const la = [-90, 90], lo = [-180, 180];
  let h = '', bit = 0, ch = 0, gerade = true;
  while (h.length < laenge) {
    const r = gerade ? lo : la, v = gerade ? lng : lat, mitte = (r[0] + r[1]) / 2;
    if (v >= mitte) { ch = ch * 2 + 1; r[0] = mitte; } else { ch *= 2; r[1] = mitte; }
    gerade = !gerade;
    if (++bit === 5) { h += B32[ch]; bit = 0; ch = 0; }
  }
  return h;
}
// Alle Geohash-Zellen (je ~150 km), die ein Gebiet um den Punkt berühren
function zellen(lat, lng, km) {
  const s = new Set();
  const dLat = km / 111, dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) s.add(geohash(Math.max(-89, Math.min(89, lat + (dLat * i) / 2)), ((lng + (dLng * j) / 2 + 540) % 360) - 180, 3));
  return [...s];
}
function abstandKm(a, b) {
  const r = Math.PI / 180, x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

// ---------- Relays: kurze Abfragen und Senden ----------
function abfragen(filter, warten = 5000) {
  return new Promise((fertig) => {
    const events = new Map();
    const sockets = [];
    let offen = RELAYS.length, vorbei = false, nachfrist = null;
    const ende = () => {
      if (vorbei) return;
      vorbei = true; clearTimeout(timer); clearTimeout(nachfrist);
      sockets.forEach((ws) => { try { ws.close(); } catch {} });
      fertig([...events.values()]);
    };
    const timer = setTimeout(ende, warten);
    const sub = 'pl' + Math.random().toString(36).slice(2, 9);
    for (const url of RELAYS) {
      let ws, fertigHier = false;
      // Sobald die Hälfte geantwortet hat, nur noch kurz auf die langsamen warten (Pläne liegen auf mehreren Relays)
      const relayFertig = () => {
        if (fertigHier) return;
        fertigHier = true;
        if (--offen <= 0) return ende();
        if (!nachfrist && offen <= RELAYS.length / 2) nachfrist = setTimeout(ende, 900);
      };
      try { ws = new WebSocket(url); } catch { relayFertig(); continue; }
      sockets.push(ws);
      ws.onopen = () => ws.send(JSON.stringify(['REQ', sub, filter]));
      ws.onmessage = (m) => {
        let d;
        try { d = JSON.parse(m.data); } catch { return; }
        if (d[0] === 'EVENT' && d[1] === sub && d[2] && !events.has(d[2].id)) events.set(d[2].id, d[2]);
        else if ((d[0] === 'EOSE' || d[0] === 'CLOSED') && d[1] === sub) relayFertig();
      };
      ws.onerror = relayFertig;
      ws.onclose = relayFertig;
    }
  }).then((liste) => {
    // Echtheit prüfen und bei ersetzbaren Events nur den neuesten Stand je Autor + d-Tag behalten
    const neueste = new Map();
    for (const e of liste) {
      if (e.kind !== KIND || !NT.verifyEvent(e)) continue;
      const k = e.pubkey + '|' + tag(e, 'd');
      const alt = neueste.get(k);
      if (!alt || e.created_at > alt.created_at) neueste.set(k, e);
    }
    return [...neueste.values()];
  });
}

function senden(e, warten = 6000) {
  return new Promise((fertig) => {
    let ok = 0, offen = RELAYS.length, vorbei = false, nachfrist = null;
    const sockets = [];
    const ende = () => { if (vorbei) return; vorbei = true; clearTimeout(timer); clearTimeout(nachfrist); sockets.forEach((ws) => { try { ws.close(); } catch {} }); fertig(ok); };
    const timer = setTimeout(ende, warten);
    for (const url of RELAYS) {
      let ws, fertigHier = false;
      // Nach drei Bestätigungen reicht es – die übrigen bekommen noch einen Moment
      const relayFertig = () => {
        if (fertigHier) return;
        fertigHier = true;
        if (--offen <= 0) return ende();
        if (!nachfrist && ok >= 3) nachfrist = setTimeout(ende, 800);
      };
      try { ws = new WebSocket(url); } catch { relayFertig(); continue; }
      sockets.push(ws);
      ws.onopen = () => ws.send(JSON.stringify(['EVENT', e]));
      ws.onmessage = (m) => {
        let d;
        try { d = JSON.parse(m.data); } catch { return; }
        if (d[0] === 'OK' && d[1] === e.id) { if (d[2]) ok++; relayFertig(); }
      };
      ws.onerror = relayFertig;
      ws.onclose = relayFertig;
    }
  });
}

const tag = (e, name) => (e.tags.find((x) => x[0] === name) || [])[1] || '';
const signieren = (vorlage) => NT.finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), ...vorlage }, schluessel());

// ---------- Pläne lesen (alles von außen gilt als ungeprüft) ----------
const text = (s, n) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const zahl = (x, min, max) => (typeof x === 'number' && isFinite(x) && x >= min && x <= max ? x : null);
const ganz = (x, min, max) => { const z = zahl(x, min, max); return z == null ? null : Math.round(z); };
const KATS = Object.keys(KATEGORIEN);

function planLesen(e) {
  let c;
  try { c = JSON.parse(e.content); } catch { return null; }
  if (!c || c.v !== 1 || c.geloescht) return null;
  const orte = (Array.isArray(c.orte) ? c.orte : []).slice(0, 80).map((o) => {
    if (!o || typeof o !== 'object') return null;
    const lat = zahl(o.lat, -90, 90), lng = zahl(o.lng, -180, 180);
    const nl = o.nl && typeof o.nl === 'object' ? { de: text(o.nl.de, 80) || undefined, en: text(o.nl.en, 80) || undefined } : null;
    if (o.k === 'hotel') return null; // Unterkünfte werden nie angezeigt, auch wenn jemand sie mitschickt
    return {
      n: text(o.n, 80), nl, k: KATS.includes(o.k) ? o.k : 'sonst', lat, lng,
      wd: typeof o.wd === 'string' && /^Q\d{1,12}$/.test(o.wd) ? o.wd : null,
      bf: text(o.bf, 200) || null, tag: ganz(o.tag, 1, 60), reihe: ganz(o.reihe, 0, 200),
    };
  }).filter((o) => o && o.n && o.lat != null && o.lng != null);
  if (orte.length < 2) return null;
  const z = c.ziel && typeof c.ziel === 'object' ? c.ziel : {};
  const ziel = {
    n: text(z.n, 60) || text(c.n, 60), land: text(z.land, 60), cc: typeof z.cc === 'string' && /^[a-z]{2}$/.test(z.cc) ? z.cc : '',
    lat: zahl(z.lat, -90, 90) ?? orte[0].lat, lng: zahl(z.lng, -180, 180) ?? orte[0].lng, radius: zahl(z.radius, 1, 600) || 15,
  };
  const d = tag(e, 'd');
  // Wanderstempel-Runden: Abstand für Vor-Ort-Stempel, Wandernadel-Stufen, anonyme Statistik für den Ersteller
  const nadel = Array.isArray(c.nadel) && c.nadel.length === 3 && c.nadel.every((x, i) => Number.isInteger(x) && x >= 1 && x <= orte.length && (!i || x >= c.nadel[i - 1])) ? c.nadel : null;
  return {
    addr: `${KIND}:${e.pubkey}:${d}`, pk: e.pubkey, d, at: e.created_at,
    n: text(c.n, 60) || ziel.n || '?', e: text(c.e, 8), autor: text(c.autor, 30), text: text(c.text, 400),
    ziel, tage: ganz(c.tage, 1, 60), bf: text(c.bf, 200) || null, orte,
    vorOrt: ganz(c.vorOrt, 30, 2000), nadel, statistik: c.statistik === true,
  };
}

// Pläne in der Nähe eines Ziels oder die neuesten weltweit
export async function planeSuchen(ziel) {
  const filter = { kinds: [KIND], limit: 80 };
  if (ziel) filter['#g'] = zellen(ziel.lat, ziel.lng, Math.max(ziel.radius || 15, 60));
  else filter['#t'] = [T_PLAN];
  const events = await abfragen(filter);
  let plaene = events.filter((e) => e.tags.some((x) => x[0] === 't' && x[1] === T_PLAN)).map(planLesen).filter(Boolean);
  if (ziel) plaene = plaene.filter((p) => abstandKm(p.ziel, ziel) <= Math.max((ziel.radius || 15) * 1.5, 80));
  return plaene.sort((a, b) => b.at - a.at);
}

// Adresse kind:pubkey:d – das d-Tag enthält selbst einen Doppelpunkt
const zerlegen = (addr) => { const [, pk, ...rest] = addr.split(':'); return { pk, d: rest.join(':') }; };

export async function planHolen(addr) {
  const { pk, d } = zerlegen(addr);
  const events = await abfragen({ kinds: [KIND], authors: [pk], '#d': [d] });
  return events.map(planLesen).find(Boolean) || null;
}

export async function meinePlaene() {
  const events = await abfragen({ kinds: [KIND], authors: [meinPk()], '#t': [T_PLAN] });
  return events.map(planLesen).filter(Boolean);
}

// Sterne, Bewertungen und Übernahmen zu mehreren Plänen auf einmal
export async function statistik(addrs) {
  const aus = {};
  addrs.forEach((a) => { aus[a] = { sterne: 0, anzahl: 0, kopien: 0, bewertungen: [] }; });
  if (!addrs.length) return aus;
  const events = await abfragen({ kinds: [KIND], '#a': addrs.slice(0, 100), limit: 1000 });
  for (const e of events) {
    const a = tag(e, 'a'), s = aus[a];
    if (!s || zerlegen(a).pk === e.pubkey) continue; // eigene Pläne kann man nicht selbst bewerten
    const art = tag(e, 't');
    if (art === T_KOPIE) { s.kopien++; continue; }
    if (art !== T_BEWERTUNG) continue;
    let c;
    try { c = JSON.parse(e.content); } catch { continue; }
    const sterne = ganz(c && c.sterne, 1, 5);
    if (!sterne) continue;
    s.bewertungen.push({ pk: e.pubkey, sterne, text: text(c.text, 280), name: text(c.name, 30), erledigt: ganz(c.erledigt, 0, 200), gesamt: ganz(c.gesamt, 0, 200), at: e.created_at });
  }
  for (const s of Object.values(aus)) {
    s.bewertungen.sort((a, b) => b.at - a.at);
    s.anzahl = s.bewertungen.length;
    s.sterne = s.anzahl ? s.bewertungen.reduce((n, b) => n + b.sterne, 0) / s.anzahl : 0;
    // Wer bewertet hat, hat den Plan auch übernommen
    s.kopien = Math.max(s.kopien, s.anzahl);
  }
  return aus;
}

// ---------- Schreiben ----------
// plan: { id, n, e, autor, text, ziel, tage, bf, orte }
export async function planVeroeffentlichen(plan) {
  const d = 'stempelpass-plan:' + plan.id;
  const z = plan.ziel;
  const tags = [['d', d], ['t', T_PLAN], ['title', plan.n], ['client', 'stempelpass']];
  [2, 3, 4].forEach((n) => tags.push(['g', geohash(z.lat, z.lng, n)]));
  if (z.cc) tags.push(['L', 'ISO-3166-1'], ['l', z.cc.toUpperCase(), 'ISO-3166-1']);
  const { id, ...inhalt } = plan;
  const e = signieren({ tags, content: JSON.stringify({ v: 1, ...inhalt }) });
  const relays = await senden(e);
  return { addr: `${KIND}:${e.pubkey}:${d}`, relays };
}

export async function planZurueckziehen(addr) {
  const { d } = zerlegen(addr);
  const leer = signieren({ tags: [['d', d], ['t', T_PLAN]], content: JSON.stringify({ v: 1, geloescht: true }) });
  const loeschen = NT.finalizeEvent({ kind: 5, created_at: Math.floor(Date.now() / 1000), tags: [['a', addr], ['k', String(KIND)]], content: '' }, schluessel());
  const [a] = await Promise.all([senden(leer), senden(loeschen)]);
  return a;
}

export async function bewerten(addr, { sterne, text: t = '', name = '', erledigt, gesamt }) {
  const e = signieren({ tags: [['d', 'stempelpass-bewertung:' + addr], ['t', T_BEWERTUNG], ['a', addr]], content: JSON.stringify({ v: 1, sterne, text: t.slice(0, 280), name: name.slice(0, 30), erledigt, gesamt }) });
  return senden(e);
}

// ---------- Anonyme Statistik für Wanderstempel-Runden ----------
// Jeder Vor-Ort-Stempel einer Runde mit Statistik geht als kleines Ereignis an den Ersteller der Runde:
// verschlüsselt (NIP-44), nur für ihn lesbar, signiert mit einem Einmal-Schlüssel – so lassen sich die
// Ereignisse eines Handys öffentlich nicht miteinander verknüpfen. Inhalt: Station, Tag, anonyme Kennungen
// für Wanderer und Gruppe, erreichte Wandernadel. Kein Name, kein Standort.
const T_STAT = 'stempelpass-stat';

export function statistikSenden(addr, daten) {
  const { pk } = zerlegen(addr);
  const einmal = NT.generateSecretKey();
  const inhalt = NT.nip44.encrypt(JSON.stringify({ v: 1, ...daten }), NT.nip44.getConversationKey(einmal, pk));
  const e = NT.finalizeEvent({
    kind: KIND, created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'stempelpass-stat:' + hex(NT.generateSecretKey()).slice(0, 16)], ['t', T_STAT], ['p', pk], ['a', addr]], content: inhalt,
  }, einmal);
  return senden(e);
}

// Nur der Ersteller kann das lesen (mit seinem Schlüssel auf diesem Handy)
export async function statistikLaden(addr) {
  const events = await abfragen({ kinds: [KIND], '#p': [meinPk()], '#a': [addr], limit: 5000 }, 8000);
  const sk = schluessel();
  const kennung = (x) => (typeof x === 'string' && /^[0-9a-f]{12}$/.test(x) ? x : null);
  return events.filter((e) => tag(e, 't') === T_STAT).map((e) => {
    let c;
    try { c = JSON.parse(NT.nip44.decrypt(e.content, NT.nip44.getConversationKey(sk, e.pubkey))); } catch { return null; }
    if (!c || c.v !== 1 || !kennung(c.teilnehmer) || !/^\d{4}-\d{2}-\d{2}$/.test(c.tag || '')) return null;
    return {
      station: ganz(c.station, 0, 200), name: text(c.name, 60), tag: c.tag, teilnehmer: c.teilnehmer, gruppe: kennung(c.gruppe) || c.teilnehmer,
      nadel: ['bronze', 'silber', 'gold'].includes(c.nadel) ? c.nadel : null, anzahl: ganz(c.anzahl, 0, 200),
    };
  }).filter(Boolean);
}

export function kopieMelden(addr) {
  const e = signieren({ tags: [['d', 'stempelpass-kopie:' + addr], ['t', T_KOPIE], ['a', addr]], content: '{"v":1}' });
  return senden(e).catch(() => 0);
}
