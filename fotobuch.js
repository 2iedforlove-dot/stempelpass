// Fotobuch: setzt eine Reise automatisch als Buch im Format 21 × 28 cm – Titel, Reiseübersicht mit Route,
// ein Kapitel pro Tag, Stempelpass und Schluss. Vorbild sind gedruckte Reisebücher (Polarsteps, Artifact Uprising):
// ruhiges Papier, große Fotos ohne abgeschnittene Köpfe, eine Schriftfamilie für Titel und eine Serife für Texte.
// Ein Seitenplan in Millimetern dient zwei Zeichnern: SVG für die Ansicht in der App, Canvas für das PDF.
import { PFADE } from './icons.js';

export const B = 210, H = 280;
const RAND = 16, INNEN = B - 2 * RAND, SPALT = 3, UNTEN = 260;
export const KARTE = { y: 75, h: 152, verh: (B - 2 * RAND) / 152 }; // Kartenfeld auf der Übersichtsseite

export const STILE = {
  papier: { name: 'Papier', hg: '#fbf8f2', text: '#1f1c18', leise: '#8b8378', akzent: '#e4561c', linie: '#e6ddcd', foto: '#ece4d6' },
  sand: { name: 'Sand', hg: '#efe4d0', text: '#2c241d', leise: '#7a6c5c', akzent: '#b04e27', linie: '#d9c9ad', foto: '#e0d2ba' },
  nacht: { name: 'Nacht', hg: '#151517', text: '#f4efe6', leise: '#9a948a', akzent: '#ff7a3d', linie: '#2c2c31', foto: '#232327' },
};

const FAM = {
  titel: "Bricolage, 'SF Pro Display', system-ui, sans-serif",
  text: "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Noto Serif', serif",
};
// Schriftstile in mm: Familie, Gewicht, Größe, Zeilenabstand, Sperrung (em), kursiv, Versalien
const S = {
  marke: { f: 'titel', g: 700, gr: 2.8, lh: 3.8, sp: 0.16, gross: true },
  markeKlein: { f: 'titel', g: 700, gr: 2.45, lh: 3.4, sp: 0.12, gross: true },
  riesig: { f: 'titel', g: 800, gr: 15, lh: 15.2, sp: -0.035 },
  kapitel: { f: 'titel', g: 800, gr: 10.5, lh: 11.2, sp: -0.03 },
  zahl: { f: 'titel', g: 800, gr: 11, lh: 12, sp: -0.03 },
  name: { f: 'titel', g: 700, gr: 3.4, lh: 4.4 },
  zitat: { f: 'text', g: 400, gr: 4.5, lh: 6.6, kursiv: true },
  lauf: { f: 'text', g: 400, gr: 4.3, lh: 6, kursiv: true },
  klein: { f: 'text', g: 400, gr: 2.5, lh: 3.5 },
};

// ---------- Text messen und umbrechen (dieselben Maße für SVG und PDF) ----------
const mess = document.createElement('canvas').getContext('2d');
const schrift = (s, px) => `${s.kursiv ? 'italic ' : ''}${s.g} ${s.gr * px}px ${FAM[s.f]}`;
function zeichenBreiten(text, s) {
  mess.font = schrift(s, 10);
  return [...text].map((c) => mess.measureText(c).width / 10);
}
function breite(text, s) {
  mess.font = schrift(s, 10);
  const n = [...text].length;
  return mess.measureText(text).width / 10 + (s.sp || 0) * s.gr * Math.max(0, n - 1);
}
function umbrechen(text, s, max, maxZeilen = 40) {
  const zeilen = [];
  for (const absatz of String(text || '').split('\n')) {
    let z = '';
    for (const wort of absatz.split(/\s+/).filter(Boolean)) {
      const probe = z ? z + ' ' + wort : wort;
      if (!z || breite(probe, s) <= max) z = probe; else { zeilen.push(z); z = wort; }
    }
    if (z) zeilen.push(z);
  }
  if (zeilen.length > maxZeilen) {
    zeilen.length = maxZeilen;
    let l = zeilen[maxZeilen - 1];
    while (l.length > 1 && breite(l + ' …', s) > max) l = l.slice(0, -1);
    zeilen[maxZeilen - 1] = l.replace(/[\s,.;:–-]+$/, '') + ' …';
  }
  return zeilen;
}
// Textblock oben links bei (x, y), Breite w; liefert Element und Höhe
function text(inhalt, stil, x, y, w, { ausr = 'l', farbe, max = 40, halo } = {}) {
  const s = { ...stil };
  const roh = s.gross ? String(inhalt).toLocaleUpperCase() : String(inhalt);
  const zeilen = umbrechen(roh, s, w, max);
  return { el: { t: 'text', x, y, w, zeilen, s, ausr, farbe, halo, br: zeilen.map((z) => breite(z, s)) }, h: zeilen.length * s.lh };
}

// Buchstaben entlang eines Kreisbogens (für die Stempel): oben im Uhrzeigersinn, unten von links nach rechts
function bogen(inhalt, stil, r, oben) {
  const s = { ...stil };
  let zeichen = [...(s.gross ? inhalt.toLocaleUpperCase() : inhalt)];
  let w = zeichenBreiten(zeichen.join(''), s);
  const luft = (s.sp || 0) * s.gr;
  const gesamt = () => w.reduce((a, b) => a + b, 0) + luft * (w.length - 1);
  while (zeichen.length > 3 && gesamt() / r > Math.PI * 1.05) { zeichen = zeichen.slice(0, -2).concat('…'); w = zeichenBreiten(zeichen.join(''), s); }
  const winkel = gesamt() / r;
  let a = oben ? -Math.PI / 2 - winkel / 2 : Math.PI / 2 + winkel / 2;
  return zeichen.map((c, i) => {
    const mitte = a + (oben ? 1 : -1) * (w[i] / 2) / r;
    a += (oben ? 1 : -1) * (w[i] + luft) / r;
    return { c, x: Math.cos(mitte) * r, y: Math.sin(mitte) * r, dreh: (mitte * 180) / Math.PI + (oben ? 90 : -90), w: w[i] };
  });
}

// ---------- Fotos in Reihen setzen (Blocksatz wie bei Google Fotos: nichts wird abgeschnitten) ----------
const seite = (f) => Math.min(3, Math.max(0.4, (f.w || 4) / (f.h || 3)));
const reihenHoehe = (r) => (INNEN - SPALT * (r.length - 1)) / r.reduce((s, f) => s + seite(f), 0);
function reihe(r, maxH = 128) {
  const h = Math.min(reihenHoehe(r), maxH);
  const breit = h * r.reduce((s, f) => s + seite(f), 0) + SPALT * (r.length - 1);
  let x = RAND + (INNEN - breit) / 2;
  return { n: r.length, h, fotos: r.map((f) => { const b = { f, x, w: h * seite(f) }; x += b.w + SPALT; return b; }) };
}
// Nächste Reihe mit einer Zielhöhe; ein einzelnes übrig bleibendes Foto kommt noch mit hinein
function naechsteReihe(fotos, ziel) {
  let r = [];
  for (const f of fotos) {
    const mit = [...r, f];
    if (reihenHoehe(mit) > ziel) { r = mit; continue; }
    r = r.length && Math.abs(reihenHoehe(r) - ziel) < Math.abs(reihenHoehe(mit) - ziel) ? r : mit;
    break;
  }
  if (fotos.length - r.length === 1 && reihenHoehe(fotos) >= 40) r = fotos;
  return reihe(r);
}
// Passt die nächste Reihe nicht mehr, nehmen wir so viele Fotos, dass sie niedriger wird und den Rest der Seite füllt
function reiheFuer(fotos, platz) {
  for (let k = 2; k <= Math.min(6, fotos.length); k++) {
    if (fotos.length - k === 1) continue;
    const h = reihenHoehe(fotos.slice(0, k));
    if (h <= platz) return h >= 40 ? reihe(fotos.slice(0, k)) : null;
  }
  // Sonst die übliche Reihe etwas kleiner und mittig – lieber das als eine halb leere Seite
  const r = naechsteReihe(fotos, 64);
  return platz >= Math.max(42, r.h * 0.6) ? reihe(fotos.slice(0, r.n), platz) : null;
}

const erstesFotoGross = (f) => seite(f) >= 1.2; // das erste Querformat eines Tages steht allein und groß

// ---------- Seiten setzen ----------
export function setzen(m) {
  const st = STILE[m.einst.stil] || STILE.papier;
  const tt = m.t;
  const seiten = [];
  const neueSeite = (art) => { const p = { art, el: [], nr: seiten.length + 1 }; seiten.push(p); return p; };
  const fuss = (p) => p.el.push(text(String(p.nr), S.markeKlein, 0, 268, B, { ausr: 'm', farbe: st.leise }).el);
  const datumLang = (ms) => new Date(ms).toLocaleDateString(m.loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const datumKurz = (ms, jahr) => new Date(ms).toLocaleDateString(m.loc, { day: 'numeric', month: 'long', ...(jahr ? { year: 'numeric' } : {}) });

  const aus = new Set(m.einst.aus || []);
  const eintraege = m.eintraege.map((e) => ({ ...e, fotos: e.fotos.filter((f) => !aus.has(f.id)) })).filter((e) => e.text || e.fotos.length);
  const alleFotos = eintraege.flatMap((e) => e.fotos);
  const zeiten = [...alleFotos.map((f) => f.at), ...eintraege.map((e) => e.at), ...m.stempel.map((s) => s.at)].filter(Boolean);
  const erster = zeiten.length ? Math.min(...zeiten) : Date.now(), letzter = zeiten.length ? Math.max(...zeiten) : Date.now();
  const zeitraum = new Date(erster).toDateString() === new Date(letzter).toDateString() ? datumKurz(erster, true)
    : new Date(erster).getFullYear() === new Date(letzter).getFullYear() ? `${datumKurz(erster)} – ${datumKurz(letzter, true)}` : `${datumKurz(erster, true)} – ${datumKurz(letzter, true)}`;
  const nachweise = new Map();

  // --- Titel ---
  const titelFoto = alleFotos.find((f) => f.id === m.einst.titelFoto) || alleFotos.find((f) => seite(f) >= 1.2) || alleFotos[0] || m.titelBild;
  {
    const p = neueSeite('titel');
    const fh = 182;
    if (titelFoto) p.el.push({ t: 'bild', x: RAND, y: RAND, w: INNEN, h: fh, src: titelFoto.src, hd: titelFoto.id });
    else {
      p.el.push({ t: 'rechteck', x: RAND, y: RAND, w: INNEN, h: fh, farbe: st.akzent });
      p.el.push(text(m.reise.e || '✦', { ...S.riesig, gr: 46, lh: 50 }, RAND, RAND + fh / 2 - 26, INNEN, { ausr: 'm', farbe: '#fff' }).el);
    }
    if (titelFoto && titelFoto.quelle) nachweise.set(titelFoto.src, titelFoto.quelle);
    const titel = text(m.einst.titel || m.reise.n, S.riesig, RAND, RAND + fh + 14, INNEN, { max: 2, farbe: st.text });
    p.el.push(titel.el);
    const u = text(m.einst.unter || zeitraum, S.lauf, RAND, titel.el.y + titel.h + 2.5, INNEN, { max: titel.el.zeilen.length > 1 ? 1 : 2, farbe: st.leise });
    p.el.push(u.el);
    p.el.push({ t: 'linie', pkte: [[RAND, 252], [RAND + 14, 252]], farbe: st.akzent, d: 0.7 });
    p.el.push(text([m.einst.unter ? zeitraum : null, m.leute.map((l) => l.n).join(', ')].filter(Boolean).join('  ·  ') || 'Stempelpass', S.marke, RAND, 256.5, INNEN, { max: 2, farbe: st.leise }).el);
  }

  // --- Unsere Reise: Zahlen und Route auf einer echten Karte ---
  const tage = new Set([...alleFotos.map((f) => f.at), ...m.stempel.map((s) => s.at), ...eintraege.map((e) => e.at)].map((z) => new Date(z).toDateString())).size;
  {
    const p = neueSeite('uebersicht');
    p.el.push(text(tt('Unsere Reise'), S.marke, RAND, 20, INNEN, { farbe: st.akzent }).el);
    p.el.push(text(m.reise.n, S.kapitel, RAND, 25.5, INNEN, { max: 1, farbe: st.text }).el);
    const zahlen = [[tage, tage === 1 ? tt('Tag') : tt('Tage')], [m.stempel.length, tt('Stempel')], ...(m.meter >= 1000 ? [[Math.round(m.meter / 1000), tt('Kilometer')]] : []), [alleFotos.length, tt('Fotos')]];
    const y0 = KARTE.y - 30, sw = INNEN / zahlen.length;
    zahlen.forEach(([z, l], i) => {
      const x = RAND + i * sw + (i ? 5 : 0);
      p.el.push(text(Number(z).toLocaleString(m.loc), S.zahl, x, y0, sw - 6, { farbe: st.text }).el);
      p.el.push(text(l, S.markeKlein, x, y0 + 13.5, sw - 6, { farbe: st.leise }).el);
      if (i) p.el.push({ t: 'linie', pkte: [[RAND + i * sw, y0 + 1], [RAND + i * sw, y0 + 17]], farbe: st.linie, d: 0.35 });
    });
    const route = m.stempel.filter((s) => s.lat != null);
    const { y: ky, h: kh } = KARTE;
    if (route.length >= 2) {
      let pt;
      const karte = m.karte && m.karte.hell === (st !== STILE.nacht) ? m.karte : null;
      if (karte) {
        p.el.push({ t: 'bild', x: RAND, y: ky, w: INNEN, h: kh, src: karte.src, r: 2 });
        pt = karte.pos.map(([fx, fy]) => [RAND + fx * INNEN, ky + fy * kh]);
        p.el.push(text('© OpenStreetMap · OpenFreeMap', { ...S.klein, gr: 1.9 }, RAND, ky + kh + 1.6, INNEN, { ausr: 'r', farbe: st.leise }).el);
      } else {
        // Ohne Karte (offline): Punkte auf ruhigem Raster, maßstabsgetreu projiziert
        p.el.push({ t: 'rechteck', x: RAND, y: ky, w: INNEN, h: kh, farbe: st.foto, r: 2 });
        for (let x = RAND + 6; x < RAND + INNEN - 2; x += 8) for (let y = ky + 6; y < ky + kh - 2; y += 8) p.el.push({ t: 'kreis', x, y, r: 0.32, fuell: st.linie });
        const lats = route.map((s) => s.lat), lngs = route.map((s) => s.lng);
        const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
        const k = Math.cos(((a + b) / 2) * Math.PI / 180);
        const bw = Math.max((d - c) * k, 1e-5), bh = Math.max(b - a, 1e-5);
        const iw = INNEN - 36, ih = kh - 34;
        const f = Math.min(iw / bw, ih / bh);
        pt = route.map((s) => [RAND + 18 + (s.lng - c) * k * f + (iw - bw * f) / 2, ky + 17 + (b - s.lat) * f + (ih - bh * f) / 2]);
      }
      const unterlage = karte ? (karte.hell ? '#ffffff' : '#161618') : st.foto; // Rand um Linie und Namen, damit sie auf der Karte lesbar bleiben
      p.el.push({ t: 'linie', pkte: pt, farbe: unterlage, d: 2.2, rund: true, deck: 0.85 });
      p.el.push({ t: 'linie', pkte: pt, farbe: st.akzent, d: 0.9, strich: [2.2, 1.6], rund: true });
      // Liegen Stationen eng beieinander, nur Punkte ohne Nummern – sonst überdecken sie sich
      let eng = false;
      for (let i = 0; i < pt.length && !eng; i++) for (let j = i + 1; j < pt.length; j++) if (Math.hypot(pt[i][0] - pt[j][0], pt[i][1] - pt[j][1]) < 6) { eng = true; break; }
      pt.forEach((q, i) => {
        const rand = i === 0 || i === pt.length - 1;
        p.el.push({ t: 'kreis', x: q[0], y: q[1], r: eng ? (rand ? 2 : 1.4) : 2.6, fuell: rand ? st.akzent : '#ffffff', rand: rand ? '#ffffff' : st.akzent, d: 0.6 });
        if (!eng) p.el.push(text(String(i + 1), { ...S.markeKlein, gr: 2, sp: 0 }, q[0] - 3, q[1] - 1, 6, { ausr: 'm', farbe: rand ? '#fff' : st.akzent }).el);
      });
      const schild = (q, n, unten) => {
        const tx = text(n, S.name, 0, 0, 70, { max: 1, farbe: st.text, halo: unterlage });
        const w = tx.el.br[0];
        tx.el.x = Math.min(Math.max(q[0] - w / 2, RAND + 3), RAND + INNEN - 3 - w); tx.el.w = w;
        tx.el.y = Math.min(Math.max(unten ? q[1] + 4 : q[1] - 8, ky + 2), ky + kh - 6);
        p.el.push(tx.el);
      };
      schild(pt[0], route[0].n, pt[0][1] > pt[pt.length - 1][1]);
      schild(pt[pt.length - 1], route[route.length - 1].n, pt[pt.length - 1][1] >= pt[0][1]);
    } else {
      // Ohne Route: die gestempelten Orte als ruhige Liste
      p.el.push(text(m.stempel.map((s) => s.n).join('  ·  ') || tt('Eure Reise beginnt gerade.'), S.zitat, RAND, ky + 4, INNEN, { max: 14, farbe: st.text }).el);
    }
    if (m.leute.length) {
      p.el.push(text(tt('Mit dabei'), S.markeKlein, RAND, 236, INNEN, { farbe: st.leise }).el);
      p.el.push(text(m.leute.map((l) => l.n).join(', '), S.lauf, RAND, 241, INNEN, { max: 2, farbe: st.text }).el);
    }
    fuss(p);
  }

  // --- Ein Kapitel pro Tag ---
  const tagListe = new Map();
  const tagVon = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); const k = d.getTime(); if (!tagListe.has(k)) tagListe.set(k, { k, bloecke: [], stempel: [], fotos: 0 }); return tagListe.get(k); };
  for (const s of m.stempel) tagVon(s.at).stempel.push(s);
  for (const e of eintraege) {
    // Fotos landen am Tag ihrer Aufnahme, der Text am Tag des Eintrags
    const nachTag = new Map();
    for (const f of e.fotos) { const tg = tagVon(f.at || e.at); if (!nachTag.has(tg)) nachTag.set(tg, []); nachTag.get(tg).push(f); }
    const textTag = tagVon(e.at);
    if (e.text && !nachTag.has(textTag)) nachTag.set(textTag, []);
    for (const [tg, fotos] of nachTag) { tg.bloecke.push({ e, fotos, mitText: tg === textTag && !!e.text, at: tg === textTag ? e.at : Math.min(...fotos.map((f) => f.at || e.at)) }); tg.fotos += fotos.length; }
  }
  const startTag = m.von ? new Date(m.von + 'T00:00:00').getTime() : Math.min(...[...tagListe.keys()]);
  const tagNr = (k) => Math.round((k - startTag) / 864e5) + 1;

  let p = null, y = 0, unten = 0, aufSeite = [];
  const platz = () => UNTEN - y;
  const setze = (els, h, abstand, wachsen = false) => { p.el.push(...els); aufSeite.push({ els, h, wachsen }); unten = y + h; y = unten + abstand; };
  // Seite abschließen: Fotoreihen dürfen etwas höher werden (minimal beschnitten), der Rest geht in die Abstände
  const seiteZu = (fuellen) => {
    if (!p) return;
    let frei = UNTEN - unten;
    // Die letzte Seite eines Tages nur auffüllen, wenn sie schon gut zu zwei Dritteln voll ist
    if (fuellen === 'fast') fuellen = frei < (UNTEN - 20) * 0.34;
    if (fuellen && frei > 1) {
      const kap = aufSeite.reduce((s, b) => s + (b.wachsen ? b.h * 0.2 : 0), 0);
      const g = Math.min(frei, kap);
      let versatz = 0;
      for (const b of aufSeite) {
        b.els.forEach((el) => verschieben(el, versatz));
        if (b.wachsen && kap) { const plus = (g * b.h * 0.2) / kap; b.els.forEach((el) => { if (el.t === 'bild') el.h += plus; }); versatz += plus; }
      }
      frei -= g;
      if (frei > 1 && aufSeite.length > 1) { const plus = Math.min(frei / (aufSeite.length - 1), 8); aufSeite.forEach((b, i) => b.els.forEach((el) => verschieben(el, plus * i))); }
    }
    fuss(p); p = null;
  };
  const neueTagSeite = (lauf) => {
    p = neueSeite('tag'); aufSeite = []; y = 20;
    if (lauf) { p.el.push(text(lauf, S.markeKlein, RAND, 11, INNEN, { max: 1, farbe: st.leise }).el); y = 21; }
  };

  for (const tg of [...tagListe.values()].sort((a, b) => a.k - b.k)) {
    if (!tg.bloecke.length && !tg.stempel.length) continue;
    const nr = tagNr(tg.k);
    const kopfText = (nr >= 1 ? tt('Tag {n}', { n: nr }) + '  ·  ' : '') + datumLang(tg.k);
    const umbruch = () => { seiteZu(true); neueTagSeite(kopfText); };

    // Kopf des Tages: Tag, Datum, gestempelte Orte und ein kurzer Strich
    const kopfEls = [text(nr >= 1 ? tt('Tag {n}', { n: nr }) : tt('Vor der Reise'), S.marke, RAND, 0, INNEN, { farbe: st.akzent }).el];
    const kopf = text(datumLang(tg.k), S.kapitel, RAND, 5.5, INNEN, { max: 2, farbe: st.text });
    kopfEls.push(kopf.el);
    let kh = 5.5 + kopf.h + 2;
    if (tg.stempel.length) {
      const orte = text(tg.stempel.map((s) => s.n).join('  ·  '), S.lauf, RAND, kh + 1, INNEN, { max: 3, farbe: st.leise });
      kopfEls.push(orte.el); kh += orte.h + 1.5;
    }
    kopfEls.push({ t: 'linie', pkte: [[RAND, kh + 3], [RAND + 14, kh + 3]], farbe: st.akzent, d: 0.7 });
    kh += 10;
    // Kleine Tage teilen sich eine Seite, sonst beginnt der Tag oben auf einer neuen.
    // Unter dem Kopf muss mindestens der Anfang des ersten Blocks Platz haben, sonst stünde er allein am Seitenende.
    const bloecke = tg.bloecke.sort((a, b) => a.at - b.at);
    const erstBedarf = (() => {
      const bl = bloecke[0];
      if (!bl) return tg.stempel.some((x) => x.bild) ? 62 : 10;
      const f0 = bl.fotos[0];
      if (bl.mitText && bl.fotos.length === 1 && seite(f0) < 0.95) return Math.min(86 / seite(f0), 120);
      let h = bl.mitText ? text(bl.e.text, S.zitat, 0, 0, INNEN - 7).h + 10 : 0;
      if (f0) h += erstesFotoGross(f0) ? Math.min(INNEN / seite(f0), 125) * 0.8 : Math.min(naechsteReihe(bl.fotos, 64).h, 42);
      return h;
    })();
    if (p && y > 30 && y + 12 + kh + erstBedarf <= UNTEN) {
      p.el.push({ t: 'linie', pkte: [[RAND, y + 2], [RAND + INNEN, y + 2]], farbe: st.linie, d: 0.3 });
      y += 12;
    } else { seiteZu('fast'); neueTagSeite(null); }
    kopfEls.forEach((el) => verschieben(el, y));
    setze(kopfEls, kh, 0);

    let erstesFoto = true;
    for (const bl of bloecke) {
      const unter = [bl.e.wer, new Date(bl.e.at).toLocaleTimeString(m.loc, { hour: '2-digit', minute: '2-digit' }), bl.e.ort].filter(Boolean).join('  ·  ');
      // Ein Hochformat mit Text: Foto links, Text rechts daneben
      if (bl.mitText && bl.fotos.length === 1 && seite(bl.fotos[0]) < 0.95) {
        const f = bl.fotos[0], fw = 86, fh = Math.min(fw / seite(f), 120), tw = INNEN - fw - 15;
        const z = text(bl.e.text, S.zitat, 0, 0, tw, { max: Math.floor((fh - 8) / S.zitat.lh), farbe: st.text });
        const u = text(unter, S.markeKlein, 0, 0, tw, { max: 2, farbe: st.leise });
        if (fh > platz()) umbruch();
        const ty = y + Math.max(0, (fh - z.h - u.h - 3) / 2);
        setze([
          { t: 'bild', x: RAND, y, w: fw, h: fh, src: f.src, hd: f.id },
          { t: 'rechteck', x: RAND + fw + 9, y: ty + 0.6, w: 0.8, h: z.h + 2 + u.h, farbe: st.akzent },
          { ...z.el, x: RAND + fw + 15, y: ty },
          { ...u.el, x: RAND + fw + 15, y: ty + z.h + 3 },
        ], fh, 8);
        erstesFoto = false;
        continue;
      }
      if (bl.mitText) {
        const z = text(bl.e.text, S.zitat, 0, 0, INNEN - 7, { farbe: st.text });
        const u = text(unter, S.markeKlein, 0, 0, INNEN - 7, { max: 2, farbe: st.leise });
        const qh = z.h + 2.5 + u.h;
        // Das Zitat bleibt bei seinen Fotos: passt die erste Reihe nicht mehr dazu, beginnt beides auf der nächsten Seite
        const passt = (pl) => {
          if (!bl.fotos.length) return true;
          const f0 = bl.fotos[0];
          if (erstesFoto && erstesFotoGross(f0)) return Math.min(INNEN / seite(f0), 125) * 0.8 <= pl;
          return naechsteReihe(bl.fotos, 64).h <= pl || !!reiheFuer(bl.fotos, pl);
        };
        if (qh > platz() || !passt(platz() - qh - 5)) umbruch();
        setze([
          { t: 'rechteck', x: RAND, y: y + 0.6, w: 0.8, h: qh - 1, farbe: st.akzent },
          { ...z.el, x: RAND + 7, y },
          { ...u.el, x: RAND + 7, y: y + z.h + 2.5 },
        ], qh, bl.fotos.length ? 5 : 8);
      }
      let rest = [...bl.fotos];
      // Das erste querformatige Foto des Tages kommt groß allein in eine Reihe
      if (erstesFoto && rest.length && erstesFotoGross(rest[0])) {
        const f = rest[0];
        let h = Math.min(INNEN / seite(f), 125);
        if (h > platz() && platz() >= h * 0.8) h = platz();
        if (h > platz()) umbruch();
        setze([{ t: 'bild', x: RAND, y, w: INNEN, h, src: f.src, hd: f.id }], h, rest.length > 1 ? SPALT : 8, true);
        rest = rest.slice(1);
      }
      if (bl.fotos.length) erstesFoto = false;
      while (rest.length) {
        let r = naechsteReihe(rest, 64);
        if (r.h > platz()) r = reiheFuer(rest, platz()) || (umbruch(), naechsteReihe(rest, 64));
        setze(r.fotos.map((b) => ({ t: 'bild', x: b.x, y, w: b.w, h: r.h, src: b.f.src, hd: b.f.id })), r.h, rest.length > r.n ? SPALT : 8, true);
        rest = rest.slice(r.n);
      }
    }
    // Tage nur mit Stempeln: Bilder der Orte als Karten
    if (!tg.fotos && tg.stempel.some((s) => s.bild)) {
      const mit = tg.stempel.filter((s) => s.bild).slice(0, 6);
      const proReihe = mit.length === 1 ? 1 : mit.length === 2 || mit.length === 4 ? 2 : 3;
      const kw = (INNEN - 4 * (proReihe - 1)) / proReihe, kbh = proReihe === 1 ? 104 : kw * (proReihe === 2 ? 0.7 : 0.75);
      for (let i = 0; i < mit.length; i += proReihe) {
        let bh = kbh;
        if (proReihe === 1 && bh + 13 > platz() && platz() - 13 >= 64) bh = platz() - 13;
        if (bh + 13 > platz()) umbruch();
        setze(mit.slice(i, i + proReihe).flatMap((s, j) => {
          nachweise.set(s.bild, s.quelle || null);
          const x = RAND + j * (kw + 4);
          return [
            { t: 'bild', x, y, w: kw, h: bh, src: s.bild, r: 1.4 },
            text(s.n, { ...S.name, gr: 3, lh: 3.8 }, x, y + bh + 2.6, kw, { max: 1, farbe: st.text }).el,
            text(new Date(s.at).toLocaleTimeString(m.loc, { hour: '2-digit', minute: '2-digit' }) + (s.wer ? '  ·  ' + s.wer : ''), S.markeKlein, x, y + bh + 7, kw, { max: 1, farbe: st.leise }).el,
          ];
        }), bh + 11, 6);
      }
    }
  }
  seiteZu('fast');

  // --- Stempelpass ---
  if (m.stempel.length) {
    const sp = 3, zh = 58, r = 21.5;
    let p = null, zeile = 0, y0 = 0;
    m.stempel.forEach((s, i) => {
      const spalte = i % sp;
      if (spalte === 0) {
        const maxZeilen = p ? (p.art === 'stempel1' ? 3 : 4) : 0;
        if (!p || zeile >= maxZeilen) {
          if (p) fuss(p);
          const erst = !p;
          p = neueSeite(erst ? 'stempel1' : 'stempel');
          if (erst) {
            p.el.push(text(tt('Unser Stempelpass'), S.marke, RAND, 20, INNEN, { farbe: st.akzent }).el);
            p.el.push(text(m.stempel.length === 1 ? tt('Ein Stempel') : tt('{n} Stempel', { n: m.stempel.length }), S.kapitel, RAND, 25.5, INNEN, { max: 1, farbe: st.text }).el);
          }
          zeile = 0; y0 = erst ? 50 : 22;
        }
        zeile++;
      }
      const cx = RAND + INNEN / sp * (spalte + 0.5), cy = y0 + (zeile - 1) * zh + zh / 2;
      let hsh = 0; for (const c of s.n + s.at) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
      const farbe = s.farbe || st.akzent;
      p.el.push({ t: 'gruppe', x: cx, y: cy, dreh: (hsh % 25) - 12, deck: 0.92, kinder: [
        { t: 'kreis', x: 0, y: 0, r, rand: farbe, d: 1.1 },
        { t: 'kreis', x: 0, y: 0, r: r - 5.6, rand: farbe, d: 0.45 },
        { t: 'bogen', zeichen: bogen(s.n, { ...S.markeKlein, gr: 2.35, sp: 0.06 }, r - 2.8, true), s: { ...S.markeKlein, gr: 2.35 }, farbe },
        { t: 'bogen', zeichen: bogen(new Date(s.at).toLocaleDateString(m.loc, { day: '2-digit', month: '2-digit', year: 'numeric' }), { ...S.markeKlein, gr: 2.1, sp: 0.1 }, r - 2.8, false), s: { ...S.markeKlein, gr: 2.1 }, farbe },
        { t: 'icon', x: -5.5, y: -5.5, g: 11, name: s.k, farbe, d: 1.5 },
      ] });
    });
    if (p) fuss(p);
  }

  // --- Schluss ---
  {
    const p = neueSeite('schluss');
    const kmText = m.meter >= 1000 ? tt('{km} km', { km: Math.round(m.meter / 1000).toLocaleString(m.loc) }) : null;
    p.el.push(text(m.stempel.length && m.stempel.length === m.orteZahl ? tt('Was für eine Reise.') : tt('Bis zum nächsten Mal.'), S.kapitel, RAND, 86, INNEN, { ausr: 'm', max: 2, farbe: st.text }).el);
    p.el.push(text([tt('{n} Orte gestempelt', { n: m.stempel.length }), kmText, tage === 1 ? tt('ein Tag') : tt('{n} Tage', { n: tage }), tt('{n} Fotos', { n: alleFotos.length })].filter(Boolean).join('  ·  '), S.lauf, RAND, 101, INNEN, { ausr: 'm', max: 2, farbe: st.leise }).el);
    const r = 24;
    p.el.push({ t: 'gruppe', x: B / 2, y: 150, dreh: -8, deck: 0.95, kinder: [
      { t: 'kreis', x: 0, y: 0, r, rand: st.akzent, d: 1.2 },
      { t: 'kreis', x: 0, y: 0, r: r - 6, rand: st.akzent, d: 0.45 },
      { t: 'bogen', zeichen: bogen('Stempelpass', { ...S.markeKlein, gr: 2.6, sp: 0.2 }, r - 3, true), s: { ...S.markeKlein, gr: 2.6 }, farbe: st.akzent },
      { t: 'bogen', zeichen: bogen(new Date(letzter).toLocaleDateString(m.loc, { month: 'long', year: 'numeric' }), { ...S.markeKlein, gr: 2.3, sp: 0.12 }, r - 3, false), s: { ...S.markeKlein, gr: 2.3 }, farbe: st.akzent },
      { t: 'icon', x: -6.5, y: -6.5, g: 13, name: 'haken', farbe: st.akzent, d: 2 },
    ] });
    const liste = [...nachweise.entries()];
    if (liste.length) {
      const zeilen = liste.map(([src, q]) => q ? `${q.datei.replace(/^File:/, '')} – ${q.urheber || 'Wikimedia Commons'}, ${q.lizenz}` : decodeURIComponent(src.split('/').pop().split('?')[0].replace(/^\d+px-/, '')).replace(/_/g, ' ') + ' – Wikimedia Commons');
      const kopfN = text(tt('Bildnachweise der Orte (Wikimedia Commons)'), S.markeKlein, RAND, 200, INNEN, { farbe: st.leise });
      const nw = text(zeilen.join('\n'), S.klein, RAND, 205, INNEN, { max: 15, farbe: st.leise });
      p.el.push(kopfN.el, nw.el);
    }
    p.el.push(text(tt('Gestaltet mit Stempelpass'), S.markeKlein, RAND, 262, INNEN, { ausr: 'm', farbe: st.leise }).el);
  }
  return { seiten, stil: st };
}

function verschieben(el, dy) {
  if (el.pkte) el.pkte = el.pkte.map(([x, y]) => [x, y + dy]);
  else el.y += dy;
}

// ---------- SVG für die Ansicht ----------
const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n2 = (z) => Math.round(z * 100) / 100;
let clipNr = 0;
function svgEl(e, st) {
  switch (e.t) {
    case 'rechteck': return `<rect x="${n2(e.x)}" y="${n2(e.y)}" width="${n2(e.w)}" height="${n2(e.h)}" rx="${e.r || 0}" fill="${e.farbe}"/>`;
    case 'bild': {
      const id = 'fbc' + (++clipNr);
      const rand = `<rect x="${n2(e.x)}" y="${n2(e.y)}" width="${n2(e.w)}" height="${n2(e.h)}" rx="${e.r || 0}" fill="${st.foto}"/>`;
      if (!e.src) return rand;
      return `${rand}${e.r ? `<clipPath id="${id}"><rect x="${n2(e.x)}" y="${n2(e.y)}" width="${n2(e.w)}" height="${n2(e.h)}" rx="${e.r}"/></clipPath>` : ''}<image href="${xml(e.src)}" x="${n2(e.x)}" y="${n2(e.y)}" width="${n2(e.w)}" height="${n2(e.h)}" preserveAspectRatio="xMidYMid slice"${e.r ? ` clip-path="url(#${id})"` : ''}/>`;
    }
    case 'linie': return `<polyline points="${e.pkte.map((q) => n2(q[0]) + ',' + n2(q[1])).join(' ')}" fill="none" stroke="${e.farbe}" stroke-width="${e.d}"${e.strich ? ` stroke-dasharray="${e.strich.join(' ')}"` : ''}${e.deck ? ` stroke-opacity="${e.deck}"` : ''}${e.rund ? ' stroke-linecap="round" stroke-linejoin="round"' : ''}/>`;
    case 'kreis': return `<circle cx="${n2(e.x)}" cy="${n2(e.y)}" r="${e.r}" fill="${e.fuell || 'none'}"${e.rand ? ` stroke="${e.rand}" stroke-width="${e.d}"` : ''}/>`;
    case 'icon': return `<path d="${PFADE[e.name] || PFADE.sonst}" transform="translate(${n2(e.x)} ${n2(e.y)}) scale(${n2(e.g / 24)})" fill="none" stroke="${e.farbe}" stroke-width="${e.d}" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'text': {
      const s = e.s;
      const attr = `font-family="${xml(FAM[s.f])}" font-weight="${s.g}" font-size="${s.gr}"${s.kursiv ? ' font-style="italic"' : ''}${s.sp ? ` letter-spacing="${n2(s.sp * s.gr)}"` : ''} fill="${e.farbe}"${e.halo ? ` stroke="${e.halo}" stroke-width="${n2(s.gr * 0.5)}" paint-order="stroke" stroke-linejoin="round"` : ''}`;
      return e.zeilen.map((z, i) => `<text x="${n2(startX(e, i))}" y="${n2(e.y + i * s.lh + s.gr * 0.8)}" ${attr}>${xml(z)}</text>`).join('');
    }
    case 'bogen': {
      const s = e.s;
      return e.zeichen.map((z) => `<text transform="translate(${n2(z.x)} ${n2(z.y)}) rotate(${n2(z.dreh)})" x="${n2(-z.w / 2)}" y="${n2(s.gr * 0.36)}" font-family="${xml(FAM[s.f])}" font-weight="${s.g}" font-size="${s.gr}" fill="${e.farbe}">${xml(z.c)}</text>`).join('');
    }
    case 'gruppe': return `<g transform="translate(${n2(e.x)} ${n2(e.y)}) rotate(${e.dreh || 0})" opacity="${e.deck || 1}">${e.kinder.map((k) => svgEl(k, st)).join('')}</g>`;
  }
  return '';
}
const startX = (e, i) => e.ausr === 'm' ? e.x + (e.w - e.br[i]) / 2 : e.ausr === 'r' ? e.x + e.w - e.br[i] : e.x;
export const seiteSvg = (p, st) => `<svg viewBox="0 0 ${B} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"><rect width="${B}" height="${H}" fill="${st.hg}"/>${p.el.map((e) => svgEl(e, st)).join('')}</svg>`;

// ---------- Canvas fürs PDF ----------
async function seiteZeichnen(ctx, p, st, px, bild) {
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.fillStyle = st.hg; ctx.fillRect(0, 0, B, H);
  const bilder = new Map();
  await Promise.all(p.el.flatMap(sammeln).map(async (e) => { bilder.set(e, await bild(e)); }));
  const zeichnen = (e) => {
    ctx.save();
    switch (e.t) {
      case 'rechteck': ctx.fillStyle = e.farbe; ctx.beginPath(); ctx.roundRect(e.x, e.y, e.w, e.h, e.r || 0); ctx.fill(); break;
      case 'bild': {
        ctx.beginPath(); ctx.roundRect(e.x, e.y, e.w, e.h, e.r || 0); ctx.fillStyle = st.foto; ctx.fill(); ctx.clip();
        const img = bilder.get(e);
        if (img) {
          const s = Math.max(e.w / img.naturalWidth, e.h / img.naturalHeight);
          const sw = e.w / s, sh = e.h / s;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, e.x, e.y, e.w, e.h);
        }
        break;
      }
      case 'linie':
        ctx.strokeStyle = e.farbe; ctx.lineWidth = e.d; ctx.setLineDash(e.strich || []); ctx.globalAlpha = e.deck || 1;
        if (e.rund) { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
        ctx.beginPath(); e.pkte.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); break;
      case 'kreis':
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        if (e.fuell) { ctx.fillStyle = e.fuell; ctx.fill(); }
        if (e.rand) { ctx.strokeStyle = e.rand; ctx.lineWidth = e.d; ctx.stroke(); }
        break;
      case 'icon':
        ctx.translate(e.x, e.y); ctx.scale(e.g / 24, e.g / 24);
        ctx.strokeStyle = e.farbe; ctx.lineWidth = e.d; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.stroke(new Path2D(PFADE[e.name] || PFADE.sonst)); break;
      case 'text': {
        // Text in echten Pixeln zeichnen: winzige Schriftgrößen mit großer Skalierung setzen manche Browser ungenau
        const s = e.s;
        ctx.scale(1 / px, 1 / px);
        ctx.font = schrift(s, px); ctx.fillStyle = e.farbe; ctx.textBaseline = 'alphabetic';
        const luft = (s.sp || 0) * s.gr * px;
        if (e.halo) { ctx.strokeStyle = e.halo; ctx.lineWidth = s.gr * 0.5 * px; ctx.lineJoin = 'round'; }
        const malen = (z, x, y) => { if (e.halo) ctx.strokeText(z, x, y); ctx.fillText(z, x, y); };
        e.zeilen.forEach((z, i) => {
          const y = (e.y + i * s.lh + s.gr * 0.8) * px;
          let x = startX(e, i) * px;
          if (!luft) return malen(z, x, y);
          if ('letterSpacing' in ctx) { ctx.letterSpacing = luft + 'px'; return malen(z, x, y); }
          for (const c of z) { malen(c, x, y); x += ctx.measureText(c).width + luft; }
        });
        break;
      }
      case 'bogen':
        ctx.scale(1 / px, 1 / px);
        ctx.font = schrift(e.s, px); ctx.fillStyle = e.farbe;
        for (const z of e.zeichen) { ctx.save(); ctx.translate(z.x * px, z.y * px); ctx.rotate((z.dreh * Math.PI) / 180); ctx.fillText(z.c, -z.w / 2 * px, e.s.gr * 0.36 * px); ctx.restore(); }
        break;
      case 'gruppe':
        ctx.translate(e.x, e.y); ctx.rotate(((e.dreh || 0) * Math.PI) / 180); ctx.globalAlpha = e.deck || 1;
        e.kinder.forEach(zeichnen); break;
    }
    ctx.restore();
  };
  p.el.forEach(zeichnen);
}
const sammeln = (e) => (e.t === 'bild' && e.src ? [e] : e.kinder ? e.kinder.flatMap(sammeln) : []);

// ---------- PDF: jede Seite als JPEG, von Hand zusammengesetzt (keine Bibliothek nötig) ----------
function pdfAusJpegs(bilder, titel) {
  const enc = new TextEncoder();
  const teile = [], ab = [];
  let laenge = 0;
  const dazu = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; teile.push(b); laenge += b.length; };
  const objekt = (n, inhalt) => { ab[n] = laenge; dazu(`${n} 0 obj\n`); inhalt(); dazu('\nendobj\n'); };
  const pt = (mm) => (mm * 72 / 25.4).toFixed(2);
  const utf16 = (s) => '<FEFF' + [...String(s)].map((c) => { const k = c.codePointAt(0); return k > 0xffff ? c.split('').map((u) => u.charCodeAt(0).toString(16).padStart(4, '0')).join('') : k.toString(16).padStart(4, '0'); }).join('').toUpperCase() + '>';
  dazu(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const n = bilder.length, info = 3 + 3 * n;
  objekt(1, () => dazu('<< /Type /Catalog /Pages 2 0 R >>'));
  objekt(2, () => dazu(`<< /Type /Pages /Count ${n} /Kids [${bilder.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`));
  bilder.forEach((b, i) => {
    const s = 3 + 3 * i;
    objekt(s, () => dazu(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(B)} ${pt(H)}] /Resources << /XObject << /Im0 ${s + 2} 0 R >> >> /Contents ${s + 1} 0 R >>`));
    const inhalt = `q ${pt(B)} 0 0 ${pt(H)} 0 0 cm /Im0 Do Q`;
    objekt(s + 1, () => dazu(`<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`));
    objekt(s + 2, () => { dazu(`<< /Type /XObject /Subtype /Image /Width ${b.w} /Height ${b.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.daten.length} >>\nstream\n`); dazu(b.daten); dazu('\nendstream'); });
  });
  objekt(info, () => dazu(`<< /Title ${utf16(titel)} /Producer (Stempelpass) /Creator (Stempelpass) >>`));
  const xref = laenge;
  dazu(`xref\n0 ${info + 1}\n0000000000 65535 f \n` + ab.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  dazu(`trailer\n<< /Size ${info + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(teile, { type: 'application/pdf' });
}

export async function pdfErstellen(buch, { hdUrl, fortschritt, px = 7.5 }) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(B * px); cv.height = Math.round(H * px);
  const ctx = cv.getContext('2d');
  const cache = new Map();
  // Commons leitet Special:FilePath ohne CORS-Freigabe weiter; die Bild-API liefert eine Adresse, die ein Canvas lesen darf
  const freigegeben = async (url) => {
    const m = /commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^?]+)\?width=(\d+)/.exec(url);
    if (!m) return url;
    try {
      const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&iiurlwidth=${Math.max(+m[2], 1200)}&titles=${encodeURIComponent('File:' + decodeURIComponent(m[1]))}`;
      const seite = Object.values((await (await fetch(api)).json()).query.pages)[0];
      return seite.imageinfo[0].thumburl || seite.imageinfo[0].url;
    } catch { return url; }
  };
  const laden = (url) => {
    if (!cache.has(url)) cache.set(url, freigegeben(url).then((ziel) => new Promise((ok) => {
      const img = new Image();
      if (/^https?:/.test(ziel) && !ziel.startsWith(location.origin)) img.crossOrigin = 'anonymous';
      img.onload = () => ok(img); img.onerror = () => ok(null);
      img.src = ziel;
    })));
    return cache.get(url);
  };
  // Eigene Fotos in der großen Fassung, falls sie auf diesem Gerät liegt
  const bild = async (e) => (e.hd && (await laden((await hdUrl(e.hd)) || e.src))) || laden(e.src);
  const jpegs = [];
  for (let i = 0; i < buch.seiten.length; i++) {
    fortschritt && fortschritt(i, buch.seiten.length);
    await seiteZeichnen(ctx, buch.seiten[i], buch.stil, px, bild);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/jpeg', 0.9));
    jpegs.push({ daten: new Uint8Array(await blob.arrayBuffer()), w: cv.width, h: cv.height });
    await new Promise((ok) => setTimeout(ok, 0));
  }
  cv.width = cv.height = 0;
  return pdfAusJpegs(jpegs, buch.titel);
}

export async function schriftenLaden() {
  try { await Promise.all(['700', '800'].map((g) => document.fonts.load(`${g} 10px Bricolage`))); } catch {}
}

// ---------- Ansicht zum Blättern, Gestalten und PDF ----------
// h: { m (Material ohne einst), einst, speichern(einst), fotos [{id, src}], hdUrl(id), t, esc, icon, sound, toast }
export async function fotobuchZeigen(h) {
  const { t, esc, icon, sound } = h;
  await schriftenLaden();
  let einst = { stil: 'papier', ...h.einst };
  let buch = null, pdf = null;
  const el = document.createElement('div');
  el.className = 'fbuch';
  el.innerHTML = `
    <div class="fb-kopf">
      <button class="fb-rund" data-fb="zu" aria-label="${esc(t('Schließen'))}">${icon('x', 20, 2.4)}</button>
      <div class="fb-titel"><b>${esc(t('Fotobuch'))}</b><small class="fb-info"></small></div>
      <button class="fb-rund" data-fb="gestalten" aria-label="${esc(t('Gestalten'))}">${icon('palette', 20, 2.1)}</button>
    </div>
    <div class="fb-spur"></div>
    <div class="fb-fuss">
      <span class="fb-zahl"></span>
      <button class="knopf akzent fb-pdf" data-fb="pdf"></button>
    </div>`;
  document.body.appendChild(el);
  const spur = el.querySelector('.fb-spur');
  const zahl = el.querySelector('.fb-zahl');
  const knopf = el.querySelector('.fb-pdf');
  const knopfZuruecksetzen = () => { pdf = null; knopf.disabled = false; knopf.innerHTML = `${icon('teilen', 18)} ${esc(t('Als PDF'))}`; };
  const groesse = () => {
    const bw = Math.min((spur.clientHeight - 24) * 0.75, el.clientWidth - 44);
    el.style.setProperty('--bw', Math.max(160, Math.floor(bw)) + 'px');
  };
  const aktuelleSeite = () => {
    const mitte = spur.scrollLeft + spur.clientWidth / 2;
    let beste = 0, abst = Infinity;
    [...spur.children].forEach((b, i) => { const d = Math.abs(b.offsetLeft + b.offsetWidth / 2 - mitte); if (d < abst) { abst = d; beste = i; } });
    return beste;
  };
  const zaehlen = () => { if (buch) zahl.textContent = t('Seite {i} von {n}', { i: aktuelleSeite() + 1, n: buch.seiten.length }); };
  // Die Karte der Übersichtsseite entsteht im Hintergrund (hell für Papier und Sand, dunkel für Nacht)
  const karten = {};
  const zeichnen = (behalten) => {
    const vorher = behalten ? aktuelleSeite() : 0;
    const hell = einst.stil !== 'nacht';
    if (h.karteHolen && !(hell in karten)) {
      karten[hell] = null;
      h.karteHolen(hell, KARTE.verh).then((k) => { karten[hell] = k; if (k && el.isConnected && !knopf.disabled && (einst.stil !== 'nacht') === hell) zeichnen(true); });
    }
    buch = setzen({ ...h.m, einst, karte: karten[hell] });
    buch.titel = einst.titel || h.m.reise.n;
    spur.innerHTML = buch.seiten.map((p, i) => `<div class="fb-blatt ${i === 0 ? 'umschlag' : i % 2 ? 'links' : 'rechts'}">${seiteSvg(p, buch.stil)}</div>`).join('');
    el.querySelector('.fb-info').textContent = t('{n} Seiten · 21 × 28 cm', { n: buch.seiten.length });
    if (behalten) spur.children[Math.min(vorher, buch.seiten.length - 1)].scrollIntoView({ inline: 'center', block: 'nearest' });
    knopfZuruecksetzen();
    zaehlen();
  };
  groesse();
  zeichnen(false);
  spur.addEventListener('scroll', zaehlen, { passive: true });
  const beiGroesse = () => { groesse(); zaehlen(); };
  addEventListener('resize', beiGroesse);

  const blaettern = (r) => { const z = spur.children[Math.max(0, Math.min(buch.seiten.length - 1, aktuelleSeite() + r))]; if (z) z.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); };
  const taste = (e) => {
    if (el.querySelector('.fb-blatt-wahl')) return;
    if (e.key === 'Escape') schliessen();
    if (e.key === 'ArrowRight') blaettern(1);
    if (e.key === 'ArrowLeft') blaettern(-1);
  };
  addEventListener('keydown', taste);
  const schliessen = () => {
    removeEventListener('keydown', taste); removeEventListener('resize', beiGroesse);
    el.classList.add('weg'); setTimeout(() => el.remove(), 300);
  };

  const pdfMachen = async () => {
    if (pdf) return teilen(pdf);
    knopf.disabled = true;
    const fort = (i, n) => { knopf.innerHTML = `<span class="fb-ring" style="--p:${(i / n).toFixed(3)}"></span> ${esc(t('Seite {i} von {n} …', { i: i + 1, n }))}`; };
    fort(0, buch.seiten.length);
    try {
      const blob = await pdfErstellen(buch, { hdUrl: h.hdUrl, fortschritt: fort });
      const name = (buch.titel || 'Fotobuch').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 60) || 'Fotobuch';
      pdf = new File([blob], `${name} – ${t('Fotobuch')}.pdf`, { type: 'application/pdf' });
      knopf.disabled = false;
      knopf.innerHTML = `${icon('haken', 18, 2.4)} ${esc(t('PDF sichern'))} <small>${(blob.size / 1048576).toLocaleString(h.m.loc, { maximumFractionDigits: 1 })} MB</small>`;
      if (sound.erfolg) sound.erfolg();
    } catch (err) {
      console.warn('Fotobuch-PDF', err);
      knopfZuruecksetzen();
      h.toast(t('Das PDF konnte nicht erstellt werden'));
    }
  };
  // Teilen braucht einen frischen Fingertipp, darum erst erstellen und dann mit dem zweiten Tipp sichern
  const teilen = async (datei) => {
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [datei] })) {
      try { await navigator.share({ files: [datei], title: datei.name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(datei); a.download = datei.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  };

  const gestalten = () => {
    const aus = new Set(einst.aus || []);
    const w = document.createElement('div');
    w.className = 'fb-blatt-wahl';
    w.innerHTML = `<div class="fb-wahl-hg" data-fbs="fertig"></div>
      <div class="fb-wahl">
        <h2>${esc(t('Fotobuch gestalten'))}</h2>
        <label class="fb-feld"><span>${esc(t('Titel'))}</span><input id="fbTitel" maxlength="60" value="${esc(einst.titel || '')}" placeholder="${esc(h.m.reise.n)}"></label>
        <label class="fb-feld"><span>${esc(t('Untertitel'))}</span><input id="fbUnter" maxlength="90" value="${esc(einst.unter || '')}" placeholder="${esc(t('z. B. Herbstferien mit der ganzen Familie'))}"></label>
        <div class="fb-gruppe"><span class="fb-label">${esc(t('Stil'))}</span><div class="fb-stile">${Object.entries(STILE).map(([k, s]) => `<button data-stil="${k}" class="${k === einst.stil ? 'an' : ''}" style="--a:${s.hg};--b:${s.text};--c:${s.akzent}"><i><b></b></i>${esc(t(s.name))}</button>`).join('')}</div></div>
        ${h.fotos.length ? `
        <div class="fb-gruppe"><span class="fb-label">${esc(t('Titelbild'))}</span><div class="fb-reihe">${h.fotos.map((f) => `<button data-titel="${esc(f.id)}" class="${f.id === einst.titelFoto ? 'an' : ''}"><img src="${f.src}" alt="" loading="lazy"></button>`).join('')}</div></div>
        <div class="fb-gruppe"><span class="fb-label">${esc(t('Fotos im Buch'))} <small>${esc(t('Antippen blendet ein Foto aus'))}</small></span><div class="fb-raster">${h.fotos.map((f) => `<button data-aus="${esc(f.id)}" class="${aus.has(f.id) ? 'aus' : ''}"><img src="${f.src}" alt="" loading="lazy"><span>${icon('haken', 13, 3)}</span></button>`).join('')}</div></div>` : ''}
        <button class="knopf voll akzent" data-fbs="fertig">${esc(t('Fertig'))}</button>
      </div>`;
    el.appendChild(w);
    const neu = () => { einst = { ...einst, titel: w.querySelector('#fbTitel').value.trim(), unter: w.querySelector('#fbUnter').value.trim(), aus: [...aus] }; zeichnen(true); };
    let tippen;
    w.addEventListener('input', () => { clearTimeout(tippen); tippen = setTimeout(neu, 350); });
    w.onclick = (e) => {
      const b = e.target.closest('button, [data-fbs]');
      if (!b) return;
      if (b.dataset.stil) { einst.stil = b.dataset.stil; w.querySelectorAll('[data-stil]').forEach((x) => x.classList.toggle('an', x === b)); sound.tick(); neu(); }
      if (b.dataset.titel) {
        einst.titelFoto = einst.titelFoto === b.dataset.titel ? null : b.dataset.titel;
        w.querySelectorAll('[data-titel]').forEach((x) => x.classList.toggle('an', x.dataset.titel === einst.titelFoto));
        sound.tick(); neu();
        spur.scrollTo({ left: 0, behavior: 'smooth' });
      }
      if (b.dataset.aus) { const id = b.dataset.aus; if (aus.has(id)) aus.delete(id); else aus.add(id); b.classList.toggle('aus', aus.has(id)); sound.tick(); neu(); }
      if (b.dataset.fbs === 'fertig') {
        clearTimeout(tippen); neu();
        h.speichern(einst);
        w.classList.add('weg'); setTimeout(() => w.remove(), 280);
      }
    };
  };

  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fb]');
    if (!b) return;
    if (b.dataset.fb === 'zu') schliessen();
    if (b.dataset.fb === 'gestalten') { if (sound.auf) sound.auf(); gestalten(); }
    if (b.dataset.fb === 'pdf' && !knopf.disabled) pdfMachen();
  });
  if (sound.auf) sound.auf();
}
