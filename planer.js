// Tagesplaner: verteilt Orte automatisch auf Tage.
// - Weit entfernte Ziele (Ayutthaya, Floating Market …) bekommen je einen eigenen Ausflugstag.
// - Die übrigen werden zu räumlich nahen Gruppen zusammengefasst (gleich viele pro Tag).
// - Innerhalb eines Tages: Reihenfolge als kürzester Weg ab der Unterkunft (nächster Nachbar).
// - "Nur am Wochenende"-Orte landen, wenn Daten bekannt sind, auf einem Samstag oder Sonntag.

export function abstand(a, b) {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Datum des Tages n (1-basiert) als Date, wenn ein Startdatum bekannt ist
export function datumVonTag(von, n) {
  if (!von) return null;
  const d = new Date(von + 'T12:00:00');
  d.setDate(d.getDate() + n - 1);
  return d;
}

export function tageAnzahl(meta) {
  if (!meta) return 0;
  if (meta.von && meta.bis) return Math.max(1, Math.round((new Date(meta.bis + 'T12:00:00') - new Date(meta.von + 'T12:00:00')) / 864e5) + 1);
  return meta.tage || 0;
}

// Reihenfolge eines Tages: nächster Nachbar ab Start
export function reihenfolge(orte, start) {
  const rest = orte.filter((o) => o.lat != null);
  const ohne = orte.filter((o) => o.lat == null);
  const weg = [];
  let hier = start || (rest[0] ? { lat: rest[0].lat, lng: rest[0].lng } : null);
  while (rest.length) {
    let best = 0, bestD = Infinity;
    rest.forEach((o, i) => { const d = abstand(hier, o); if (d < bestD) { bestD = d; best = i; } });
    const o = rest.splice(best, 1)[0];
    weg.push(o);
    hier = o;
  }
  // Morgens-Orte an den Anfang, Sonnenuntergangs-Orte ans Ende, sonst kürzester Weg
  const rang = (o) => (o.z === 'frueh' ? 0 : o.z === 'abend' ? 2 : 1);
  return [...weg.map((o, i) => [o, i]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map((x) => x[0]), ...ohne];
}

// orte: [{id, lat, lng, k, z}], start: Unterkunft {lat,lng} oder null, tage: Anzahl, von: 'YYYY-MM-DD' oder null
// Ergebnis: Map id -> {tag, reihe}
// proTag: Orte pro Stadttag, je nach Reisetempo aus der Einführung (3 gemütlich, 4 ausgewogen, 5 Vollgas)
export function autoPlan(orte, { start, tage, von, proTag = 4 }) {
  const plan = new Map();
  const mitOrt = orte.filter((o) => o.lat != null && o.k !== 'hotel');
  if (!mitOrt.length) return plan;
  const mitte = start || { lat: median(mitOrt.map((o) => o.lat)), lng: median(mitOrt.map((o) => o.lng)) };
  const weit = mitOrt.filter((o) => abstand(mitte, o) > 18000);
  const nah = mitOrt.filter((o) => !weit.includes(o));
  let anzahl = tage || Math.max(1, Math.ceil(nah.length / proTag) + weit.length);
  const stadtTage = Math.max(1, anzahl - weit.length);
  const groesse = Math.ceil(nah.length / stadtTage);

  // Räumliche Gruppen: Saat = am weitesten von der Mitte entfernter freier Ort, dazu die nächsten Nachbarn
  const frei = [...nah];
  const gruppen = [];
  while (frei.length) {
    frei.sort((a, b) => abstand(mitte, b) - abstand(mitte, a));
    const saat = frei.shift();
    const g = [saat];
    while (g.length < groesse && frei.length) {
      let best = 0, bestD = Infinity;
      frei.forEach((o, i) => { const d = Math.min(...g.map((x) => abstand(x, o))); if (d < bestD) { bestD = d; best = i; } });
      g.push(frei.splice(best, 1)[0]);
    }
    gruppen.push(g);
  }
  // Ausflüge zuerst nach Entfernung sortiert, je ein Tag; dann die Stadtgruppen
  weit.sort((a, b) => abstand(mitte, a) - abstand(mitte, b)).forEach((o) => gruppen.push([o]));
  while (gruppen.length > anzahl) {
    // mehr Gruppen als Tage: die zwei kleinsten Stadtgruppen zusammenlegen
    gruppen.sort((a, b) => a.length - b.length);
    const [a, b] = gruppen.splice(0, 2);
    gruppen.push([...a, ...b]);
  }

  // Tage zuordnen: Gruppen mit Wochenend-Orten auf Sa/So legen
  const tagNr = gruppen.map((_, i) => i + 1);
  if (von) {
    const istWE = (n) => { const d = datumVonTag(von, n); return d.getDay() === 0 || d.getDay() === 6; };
    gruppen.forEach((g, gi) => {
      if (!g.some((o) => o.z === 'wochenende') || istWE(tagNr[gi])) return;
      const ziel = tagNr.findIndex((n, j) => istWE(n) && !gruppen[j].some((o) => o.z === 'wochenende'));
      if (ziel >= 0) [tagNr[gi], tagNr[ziel]] = [tagNr[ziel], tagNr[gi]];
    });
  }
  gruppen.forEach((g, gi) => {
    reihenfolge(g, start).forEach((o, r) => plan.set(o.id, { tag: tagNr[gi], reihe: r }));
  });
  return plan;
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }

// Google-Maps-Route mit allen Halten eines Tages (max. 9 Zwischenziele)
export function routeUrl(orte, start) {
  const p = orte.filter((o) => o.lat != null);
  if (!p.length) return null;
  const f = (o) => `${o.lat},${o.lng}`;
  const ziel = p[p.length - 1];
  const zwischen = p.slice(0, -1).slice(0, 9);
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  if (start) u.searchParams.set('origin', f(start));
  u.searchParams.set('destination', f(ziel));
  if (zwischen.length) u.searchParams.set('waypoints', zwischen.map(f).join('|'));
  u.searchParams.set('travelmode', 'driving');
  return u.toString();
}
