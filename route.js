// Route zwischen zwei Punkten über den freien OSRM-Dienst der FOSSGIS (routing.openstreetmap.de):
// zu Fuß, mit dem Auto und mit dem Rad, ohne Schlüssel. Ohne Internet eine Schätzung über die Luftlinie.

const PROFIL = { fuss: 'foot', auto: 'car', rad: 'bike' };
// Für die Offline-Schätzung: Umwegfaktor und Tempo in km/h (Auto: Bangkoker Stadtverkehr)
const SCHAETZUNG = { fuss: [1.3, 4.5], auto: [1.4, 18], rad: [1.3, 12] };
const zwischenspeicher = new Map();

export async function routeHolen(von, nach, modus) {
  const schluessel = [von.lng, von.lat, nach.lng, nach.lat, modus].map((x) => (typeof x === 'number' ? x.toFixed(5) : x)).join(',');
  if (zwischenspeicher.has(schluessel)) return zwischenspeicher.get(schluessel);
  const url = `https://routing.openstreetmap.de/routed-${PROFIL[modus]}/route/v1/driving/${von.lng},${von.lat};${nach.lng},${nach.lat}?overview=full&geometries=geojson&steps=true`;
  const r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined });
  if (!r.ok) throw new Error('Routing ' + r.status);
  const j = await r.json();
  if (j.code !== 'Ok' || !j.routes.length) throw new Error('Keine Route');
  const route = j.routes[0];
  const ergebnis = {
    distanz: route.distance,
    dauer: route.duration,
    punkte: route.geometry.coordinates,
    schritte: route.legs[0].steps.filter((s) => s.distance >= 5 || s.maneuver.type === 'arrive' || s.maneuver.type === 'depart').map((s) => ({
      typ: s.maneuver.type, richtung: s.maneuver.modifier || '', name: s.name || '', ref: s.ref || '', distanz: s.distance,
      ort: s.maneuver.location, ausfahrt: s.maneuver.exit || null,
    })),
  };
  zwischenspeicher.set(schluessel, ergebnis);
  return ergebnis;
}

export function schaetzung(von, nach, modus, abstand) {
  const [umweg, kmh] = SCHAETZUNG[modus];
  const distanz = abstand(von, nach) * umweg;
  return { distanz, dauer: distanz / (kmh / 3.6), punkte: [[von.lng, von.lat], [nach.lng, nach.lat]], schritte: [], geschaetzt: true };
}

// Pfeil-Icon für eine Anweisung
export function schrittIcon(s) {
  if (s.typ === 'depart') return 'navi';
  if (s.typ === 'arrive') return 'ziel';
  if (s.typ === 'roundabout' || s.typ === 'rotary' || s.typ === 'exit roundabout') return 'kreisel';
  if (s.richtung === 'uturn') return 'wenden';
  if (s.richtung.includes('left')) return 'abbiegenLinks';
  if (s.richtung.includes('right')) return 'abbiegenRechts';
  return 'geradeaus';
}

// Anweisung als Text in der gewählten Sprache; strasse: schon übersetzter Straßenname oder ''
export function schrittText(s, t, strasse, zielName, modus) {
  const richtung = {
    left: 'Links abbiegen', right: 'Rechts abbiegen', 'slight left': 'Leicht links halten', 'slight right': 'Leicht rechts halten',
    'sharp left': 'Scharf links abbiegen', 'sharp right': 'Scharf rechts abbiegen', straight: 'Geradeaus weiter', uturn: 'Wenden',
  }[s.richtung];
  let text;
  if (s.typ === 'depart') text = strasse ? t('Los auf {strasse}', { strasse }) : modus === 'fuss' ? t('Losgehen') : t('Losfahren');
  else if (s.typ === 'arrive') return t('Ankunft: {ziel}', { ziel: zielName });
  else if (s.typ === 'roundabout' || s.typ === 'rotary') return s.ausfahrt ? t('Im Kreisverkehr die {n}. Ausfahrt nehmen', { n: s.ausfahrt }) + (strasse ? ' – ' + strasse : '') : t('In den Kreisverkehr');
  else if (s.typ === 'new name' || s.typ === 'continue') text = strasse ? t('Weiter auf {strasse}', { strasse }) : t('Geradeaus weiter');
  else text = richtung ? (strasse ? t('{aktion} auf {strasse}', { aktion: t(richtung), strasse }) : t(richtung)) : (strasse ? t('Weiter auf {strasse}', { strasse }) : t('Geradeaus weiter'));
  return text;
}

export function googleRoute(von, nach, modus) {
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  if (von) u.searchParams.set('origin', `${von.lat},${von.lng}`);
  u.searchParams.set('destination', `${nach.lat},${nach.lng}`);
  u.searchParams.set('travelmode', { fuss: 'walking', auto: 'driving', rad: 'bicycling', oepnv: 'transit' }[modus] || 'walking');
  return u.toString();
}
