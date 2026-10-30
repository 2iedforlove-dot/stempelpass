// Fortschritt und Belohnungen (nach Tim Gabe, "How To Scientifically Design Addictive Apps"):
// - Eine sichtbare Kernzahl statt vieler Abzeichen: deine Stempel. Dazu Reisepass-Stufen ohne Ende –
//   nach "Legende" geht es mit Legende II, III … weiter, es gibt keinen "fertig"-Zustand.
// - Kontrollierte Überraschung auf einem durchschaubaren System: jeder Stempel zählt gleich,
//   manche sind aber selten (Silber, Gold). Für alle in der Gruppe gleich, weil aus Reise und Ort berechnet.
// - Sichtbarer Vergleich in der eigenen Reisegruppe: wer hat am meisten gestempelt?

const STUFEN = [[0, 'Neuling'], [3, 'Entdecker'], [10, 'Abenteurer'], [25, 'Weltenbummler'], [50, 'Globetrotter'], [100, 'Legende']];
const ROEMISCH = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function stufeNr(nr) {
  if (nr < STUFEN.length) return { nr, ab: STUFEN[nr][0], name: STUFEN[nr][1], zusatz: '' };
  const extra = nr - STUFEN.length + 2; // Legende II ab 150, III ab 200 …
  return { nr, ab: 100 + (extra - 1) * 50, name: 'Legende', zusatz: ROEMISCH[extra] || String(extra) };
}

// Stufe zu einer Stempelzahl, mit Fortschritt zur nächsten
export function stufe(n) {
  let nr = 0;
  while (stufeNr(nr + 1).ab <= n) nr++;
  const jetzt = stufeNr(nr), naechste = stufeNr(nr + 1);
  return { ...jetzt, naechste, fehlen: naechste.ab - n, anteil: (n - jetzt.ab) / (naechste.ab - jetzt.ab) };
}

export const stufenName = (s, t) => t(s.name) + (s.zusatz ? ' ' + s.zusatz : '');

// FNV-1a: gleiche Eingabe gibt auf jedem Handy denselben Wert
function streuwert(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % 1000;
}

// ca. 8 % Gold, 20 % Silber, Rest normal; Unterkünfte sind nie selten
export function seltenheit(tripId, ort) {
  if (!ort || ort.k === 'hotel') return 'normal';
  const w = streuwert(tripId + '|' + ort.id);
  return w < 80 ? 'gold' : w < 280 ? 'silber' : 'normal';
}

// Wer hat in dieser Reise wie viele Orte gestempelt?
export function bestenliste(v) {
  const zahl = new Map();
  for (const o of v.orte) if (o.check) zahl.set(o.check.by, (zahl.get(o.check.by) || 0) + 1);
  const leute = new Map(v.leute.map((l) => [l.id, l]));
  return [...zahl.entries()].map(([id, n]) => ({ id, n, name: leute.get(id)?.n || '?', farbe: leute.get(id)?.c || '#888' }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
