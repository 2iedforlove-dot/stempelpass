// Interessen und Reisetempo aus der Einführung (Mobbin, "I Studied 1,460 Onboarding Flows":
// personalisieren und das Ergebnis sofort zeigen). Damit werden Sehenswürdigkeiten vorausgewählt
// und der Tagesplan dichter oder lockerer verteilt.

export const INTERESSEN = [
  { id: 'kultur', name: 'Tempel & Kultur', ico: 'tempel', farbe: '#e3a21a', k: ['tempel', 'kultur', 'viertel'] },
  { id: 'essen', name: 'Essen & Märkte', ico: 'essen', farbe: '#ff6b3d', k: ['essen', 'markt'] },
  { id: 'natur', name: 'Natur & Parks', ico: 'park', farbe: '#30c25a', k: ['park', 'ausflug'] },
  { id: 'aussicht', name: 'Aussichten', ico: 'aussicht', farbe: '#0a84ff', k: ['aussicht'] },
  { id: 'shopping', name: 'Shopping', ico: 'shopping', farbe: '#ff2d78', k: ['shopping'] },
  { id: 'wasser', name: 'Wasser & Strand', ico: 'wasser', farbe: '#19a7c4', k: ['wasser'] },
  { id: 'erholung', name: 'Wellness', ico: 'erholung', farbe: '#bf5af2', k: ['erholung'] },
  { id: 'nacht', name: 'Bars & Nachtleben', ico: 'bar', farbe: '#5e5ce6', k: ['bar'] },
];

export const TEMPI = [['gemuetlich', 'Gemütlich', 3], ['ausgewogen', 'Ausgewogen', 4], ['vollgas', 'Vollgas', 5]];

export const orteProTag = (tempo) => (TEMPI.find((x) => x[0] === tempo) || TEMPI[1])[2];

export function passtZu(kategorie, interessen) {
  if (!interessen || !interessen.length) return false;
  return INTERESSEN.some((i) => interessen.includes(i.id) && i.k.includes(kategorie));
}

// Passende Orte rücken nach vorne, bleiben aber grob in der Reihenfolge ihrer Bekanntheit
export function nachInteressen(liste, interessen) {
  if (!interessen || !interessen.length) return liste;
  return liste.map((s, i) => [s, i - (passtZu(s.k, interessen) ? 10 : 0)]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

// Auswahl-Kacheln (Mehrfachauswahl) und Tempo-Schalter; data-interesse / data-tempo werten die Aufrufer aus
export function vorliebenHtml(ich, { t, icon, esc }) {
  const gewaehlt = ich.interessen || [];
  const tempo = ich.tempo || 'ausgewogen';
  const i = Math.max(0, TEMPI.findIndex((x) => x[0] === tempo));
  return `<div class="interessen">${INTERESSEN.map((x) => `<button class="interesse ${gewaehlt.includes(x.id) ? 'an' : ''}" data-interesse="${x.id}" style="--f:${x.farbe}" aria-pressed="${gewaehlt.includes(x.id)}">
      <span class="i-ico">${icon(x.ico, 18, 2)}</span><span>${esc(t(x.name))}</span><span class="i-haken">${icon('haken', 12, 3.2)}</span></button>`).join('')}</div>
    <div class="abschnitt" style="margin:18px 0 8px">${esc(t('Dein Reisetempo'))}</div>
    <div class="segmente tempo-wahl" style="--n:3;--i:${i};background:var(--flaeche)"><span class="schieber"></span>${TEMPI.map(([k, n, z]) => `<button class="${tempo === k ? 'an' : ''}" data-tempo="${k}"><span>${esc(t(n))}<small>${esc(t('{n} Orte/Tag', { n: z }))}</small></span></button>`).join('')}</div>`;
}

// Klick in vorliebenHtml auswerten; gibt true zurück, wenn sich etwas geändert hat
export function vorliebenKlick(e, ich, box) {
  const b = e.target.closest('[data-interesse]');
  if (b) {
    const id = b.dataset.interesse;
    const liste = new Set(ich.interessen || []);
    if (liste.has(id)) liste.delete(id); else liste.add(id);
    ich.interessen = [...liste];
    b.classList.toggle('an', liste.has(id));
    b.setAttribute('aria-pressed', String(liste.has(id)));
    return 'interesse';
  }
  const tp = e.target.closest('[data-tempo]');
  if (tp) {
    ich.tempo = tp.dataset.tempo;
    const seg = box.querySelector('.tempo-wahl');
    seg.style.setProperty('--i', TEMPI.findIndex((x) => x[0] === ich.tempo));
    seg.querySelectorAll('[data-tempo]').forEach((x) => x.classList.toggle('an', x === tp));
    return 'tempo';
  }
  return false;
}

// "Tempel & Kultur und Essen & Märkte" – für den persönlichen Abschluss der Einführung
export function interessenText(ich, t) {
  const n = INTERESSEN.filter((x) => (ich.interessen || []).includes(x.id)).map((x) => t(x.name));
  if (!n.length) return '';
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' ' + t('und') + ' ' + n[n.length - 1];
}
