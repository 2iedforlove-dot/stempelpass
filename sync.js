// Sync über öffentliche Nostr-Relays: kein eigener Server, kein Konto.
// Jeder Trip hat einen Code. Daraus werden Signierschlüssel, AES-Schlüssel und
// Trip-ID abgeleitet. Die Relays sehen nur verschlüsselte Datensätze.
// Jeder Datensatz (Ort, Häkchen, Mitglied, Trip-Infos) ist ein eigenes
// ersetzbares Event (kind 30078), zusammengeführt wird per "letzte Änderung gewinnt".

const NT = window.NostrTools;

export const RELAYS = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://nostr.oxtr.dev',
];

const KIND = 30078;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const enc = new TextEncoder();
const dec = new TextDecoder();

export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] & 31];
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

export function normCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1');
  if (s.length !== 12 || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8);
}

async function sha(...parts) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(parts.join('|'))));
}
const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// Alles, was sich aus einem Code ableiten lässt
export async function deriveKeys(code) {
  const base = 'stempelpass/v1/' + code;
  const sk = await sha(base, 'sign');
  const aesRaw = await sha(base, 'aes');
  const dSalt = hex(await sha(base, 'd'));
  return {
    id: hex(await sha(base, 'id')).slice(0, 16),
    sk,
    pk: NT.getPublicKey(sk),
    aes: await crypto.subtle.importKey('raw', aesRaw, 'AES-GCM', false, ['encrypt', 'decrypt']),
    dSalt,
  };
}

async function seal(keys, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv); out.set(ct, 12);
  return b64(out);
}

async function open(keys, content) {
  const raw = unb64(content);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, keys.aes, raw.subarray(12));
  return JSON.parse(dec.decode(pt));
}

// Gewinnt der neue Stand gegen den alten?
export function newer(a, b) {
  if (!b) return true;
  if (a.t !== b.t) return a.t > b.t;
  return String(a.by) > String(b.by);
}

// Verbindung zu allen Relays. trips: Map tripId -> { keys, data }
// data = { records: {key: {v,t,by,ca}}, synced: {key: t} }
export class Sync {
  constructor({ getTrips, onRemote, onStatus, onAck }) {
    this.getTrips = getTrips;
    this.onRemote = onRemote; // (tripId, key) wenn sich durch ein fremdes Event etwas geändert hat
    this.onStatus = onStatus;
    this.onAck = onAck;
    this.relays = RELAYS.map((url) => ({ url, ws: null, open: false, tries: 0, timer: null, has: new Map(), eose: new Set() }));
    this.pendingOk = new Map(); // eventId -> {tripId, key, t, relay}
    addEventListener('online', () => this.kick());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick(); });
  }

  start() { this.relays.forEach((r) => this.connect(r)); }

  kick() {
    this.relays.forEach((r) => {
      if (!r.ws || r.ws.readyState > 1) { clearTimeout(r.timer); r.tries = 0; this.connect(r); }
    });
  }

  get online() { return this.relays.filter((r) => r.open).length; }

  status() { this.onStatus && this.onStatus(this.online); }

  connect(r) {
    if (!navigator.onLine) { this.status(); return; }
    let ws;
    try { ws = new WebSocket(r.url); } catch { return this.retry(r); }
    r.ws = ws;
    ws.onopen = () => {
      r.open = true; r.tries = 0; r.eose.clear(); r.has.clear();
      for (const [tripId, t] of this.getTrips()) this.req(r, tripId, t.keys);
      this.status();
    };
    ws.onclose = () => { if (r.ws !== ws) return; r.open = false; r.warte = []; r.inWarte = new Set(); this.status(); this.retry(r); };
    ws.onerror = () => {};
    ws.onmessage = (m) => { r.q = (r.q || Promise.resolve()).then(() => this.message(r, m.data)).catch(() => {}); };
  }

  retry(r) {
    clearTimeout(r.timer);
    const wait = Math.min(30000, 1000 * 2 ** r.tries++) + Math.random() * 500;
    r.timer = setTimeout(() => this.connect(r), wait);
  }

  send(r, msg) {
    if (!r.open || r.ws.readyState !== 1) return;
    if (msg[0] !== 'EVENT') return r.ws.send(JSON.stringify(msg));
    // Viele Fotostücke auf einmal beantworten manche Relays mit einer Sperre: höchstens 8 Events pro Sekunde
    if (!r.warte) { r.warte = []; r.inWarte = new Set(); }
    if (r.inWarte.has(msg[1].id)) return;
    r.inWarte.add(msg[1].id);
    r.warte.push(msg);
    if (!r.pumpe) this.pumpen(r);
  }

  pumpen(r) {
    const msg = r.warte.shift();
    if (!msg) { r.pumpe = null; return; }
    r.inWarte.delete(msg[1].id);
    if (r.open && r.ws.readyState === 1) r.ws.send(JSON.stringify(msg));
    r.pumpe = setTimeout(() => this.pumpen(r), 125);
  }

  subId(tripId) { return 'sp' + tripId; }

  req(r, tripId, keys) {
    if (!r.has.has(tripId)) r.has.set(tripId, {});
    this.send(r, ['REQ', this.subId(tripId), { authors: [keys.pk], kinds: [KIND] }]);
  }

  // Neuer Trip dazugekommen
  watch(tripId, keys) { this.relays.forEach((r) => r.open && this.req(r, tripId, keys)); }

  unwatch(tripId) {
    this.relays.forEach((r) => { this.send(r, ['CLOSE', this.subId(tripId)]); r.has.delete(tripId); r.eose.delete(tripId); });
  }

  async message(r, raw) {
    let d;
    try { d = JSON.parse(raw); } catch { return; }
    if (d[0] === 'EVENT') {
      const tripId = String(d[1]).slice(2);
      const trip = this.getTrips().get(tripId);
      const ev = d[2];
      if (!trip || !ev || ev.pubkey !== trip.keys.pk) return;
      let w;
      try { w = await open(trip.keys, ev.content); } catch { return; }
      if (!w || typeof w.k !== 'string') return;
      const rec = { v: w.v, t: w.t, by: w.by, ca: ev.created_at };
      const known = r.has.get(tripId);
      if (known && (!known[w.k] || w.t > known[w.k])) known[w.k] = w.t;
      const local = trip.data.records[w.k];
      if (local && local.ca < ev.created_at) local.ca = ev.created_at;
      if (newer(rec, local)) {
        trip.data.records[w.k] = rec;
        trip.data.synced[w.k] = w.t;
        this.onRemote(tripId, w.k);
      } else if (local && local.t === w.t) {
        if ((trip.data.synced[w.k] || 0) < w.t) { trip.data.synced[w.k] = w.t; this.onAck(tripId); }
      }
      // Nach dem ersten Abgleich auftauchende Lücken direkt füllen
      if (r.eose.has(tripId) && local && newer(local, rec)) this.push(r, tripId, w.k);
    } else if (d[0] === 'EOSE') {
      const tripId = String(d[1]).slice(2);
      r.eose.add(tripId);
      this.repair(r, tripId);
    } else if (d[0] === 'OK') {
      const p = this.pendingOk.get(r.url + '|' + d[1]);
      if (!p) return;
      this.pendingOk.delete(r.url + '|' + d[1]);
      const trip = this.getTrips().get(p.tripId);
      if (!trip || !d[2]) return;
      const known = r.has.get(p.tripId);
      if (known) known[p.key] = Math.max(known[p.key] || 0, p.t);
      if ((trip.data.synced[p.key] || 0) < p.t) { trip.data.synced[p.key] = p.t; this.onAck(p.tripId); }
    }
  }

  // Alles, was das Relay nicht (oder älter) hat, nachschieben
  repair(r, tripId) {
    const trip = this.getTrips().get(tripId);
    const known = r.has.get(tripId);
    if (!trip || !known) return;
    for (const [key, rec] of Object.entries(trip.data.records)) {
      if ((known[key] || 0) < rec.t) this.push(r, tripId, key);
    }
  }

  // Lokale Änderung an alle verbundenen Relays, die schon abgeglichen sind
  publish(tripId, key) {
    this.relays.forEach((r) => { if (r.open && r.eose.has(tripId)) this.push(r, tripId, key); });
  }

  async push(r, tripId, key) {
    const trip = this.getTrips().get(tripId);
    if (!trip) return;
    const rec = trip.data.records[key];
    if (!rec) return;
    rec.ev = rec.ev || {};
    // Ein fertig signiertes Event pro Stand wiederverwenden, damit alle Relays dasselbe bekommen
    if (!rec.ev.e || rec.ev.t !== rec.t) {
      const created = Math.max(Math.floor(Date.now() / 1000), (rec.ca || 0) + 1);
      const d = hex(await sha(trip.keys.dSalt, key)).slice(0, 32);
      const content = await seal(trip.keys, { k: key, v: rec.v, t: rec.t, by: rec.by });
      if (trip.data.records[key] !== rec) return;
      const e = NT.finalizeEvent({ kind: KIND, created_at: created, tags: [['d', d]], content }, trip.keys.sk);
      rec.ev = { e, t: rec.t };
      rec.ca = created;
    }
    const e = rec.ev.e;
    this.pendingOk.set(r.url + '|' + e.id, { tripId, key, t: rec.t });
    this.send(r, ['EVENT', e]);
  }
}
