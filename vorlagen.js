// Kategorien (mit Farben wie die iOS-Einstellungs-Icons) und die Bangkok-Liste vom Zettel

export const KATEGORIEN = {
  hotel: { name: 'Unterkunft', farbe: '#5e5ce6' },
  tempel: { name: 'Tempel', farbe: '#e8a10c' },
  markt: { name: 'Markt', farbe: '#ff453a' },
  park: { name: 'Park & Natur', farbe: '#30b856' },
  aussicht: { name: 'Aussicht', farbe: '#bf5af2' },
  essen: { name: 'Essen', farbe: '#ff8a00' },
  shopping: { name: 'Shopping', farbe: '#ff2d78' },
  wasser: { name: 'Am Wasser', farbe: '#0a84ff' },
  kultur: { name: 'Kultur', farbe: '#a2845e' },
  erholung: { name: 'Erholung', farbe: '#30b0c7' },
  bar: { name: 'Bar & Abend', farbe: '#7d7aff' },
  viertel: { name: 'Viertel', farbe: '#ff6482' },
  ausflug: { name: 'Ausflug', farbe: '#00b3a4' },
  sonst: { name: 'Sonstiges', farbe: '#8e8e93' },
};

// [Name, Kategorie, Breite, Länge, Notiz, Bild]
export const BANGKOK = {
  name: 'Bangkok',
  emoji: '🇹🇭',
  bild: 'titel-bangkok',
  ort: { lat: 13.7563, lng: 100.5018 },
  orte: [
    ['Marriott Marquis Queen’s Park', 'hotel', 13.73026, 100.56571, 'Unser Hotel – Sukhumvit Soi 22, direkt am Benjakitti Park. BTS Phrom Phong / MRT Queen Sirikit National Convention Centre.', null],
    ['Chatuchak Weekend Market', 'markt', 13.80027, 100.55112, 'Nur Samstag & Sonntag – ihr wolltet am Sonntag hin. Früh kommen, mittags wird es sehr heiß. MRT Chatuchak Park / BTS Mo Chit.', 'chatuchak'],
    ['Wat Arun', 'tempel', 13.7439, 100.48851, 'Tempel der Morgenröte. Fähre ab Tha Tien (bei Wat Pho) für ein paar Baht. Am schönsten zum Sonnenuntergang vom anderen Ufer. Schultern und Knie bedecken.', 'wat-arun'],
    ['Grand Palace', 'tempel', 13.74935, 100.49186, 'Strenger Dresscode: Schultern und Knie bedeckt. Möglichst früh am Morgen hin. Wat Phra Kaew (Smaragd-Buddha) liegt auf dem Gelände.', 'grand-palace'],
    ['Wat Pho', 'tempel', 13.74635, 100.49274, 'Liegender Buddha, gleich neben dem Grand Palace. Hier ist auch die bekannte Massageschule.', 'wat-pho'],
    ['Benjakitti Park', 'park', 13.72908, 100.55476, 'Waldpark mit Skywalk über die Feuchtgebiete. Gut zum Radfahren.', 'benjakitti'],
    ['Lumpini Park', 'park', 13.7306, 100.54154, 'Warane am See! Morgens und abends angenehm, Tretboote.', 'lumpini'],
    ['Ancient City', 'kultur', 13.5463, 100.631, 'Riesiges Freilichtmuseum (Muang Boran) in Samut Prakan. Fahrrad oder Golfcart mieten.', 'ancient-city'],
    ['Massage', 'erholung', null, null, 'Thai-Massage – z. B. an der Massageschule im Wat Pho oder einfach im Viertel.', 'massage'],
    ['Rooftop Bar', 'bar', null, null, 'Abends mit Blick über die Stadt.', 'rooftop'],
    ['Chao Phraya Bootsfahrt', 'wasser', 13.71837, 100.51257, 'Chao Phraya Express Boat ab Sathorn Pier – die günstigste Stadtrundfahrt. Hält u. a. bei Wat Arun, Wat Pho und ICONSIAM.', 'chao-phraya'],
    ['Floating Market', 'markt', 13.51976, 99.95935, 'Damnoen Saduak, ca. 100 km entfernt – als Ausflug früh am Morgen.', 'floating-market'],
    ['Food Tour', 'essen', null, null, 'Streetfood – abends z. B. in Chinatown (Yaowarat Road).', 'food-tour'],
    ['Talat Noi', 'viertel', 13.73345, 100.51297, 'Hip, Street Art, Chinatown. Alte Gassen und Cafés am Fluss.', 'talat-noi'],
    ['ICONSIAM', 'shopping', 13.72682, 100.51029, 'Riesige Mall am Fluss mit einem schwimmenden Markt drinnen.', 'iconsiam'],
    ['EmSphere', 'shopping', 13.73251, 100.56608, 'Neue Mall an der Sukhumvit Road (BTS Phrom Phong).', 'emsphere'],
    ['Mahanakhon Skywalk', 'aussicht', 13.72341, 100.52822, 'Glasboden ganz oben im King Power Mahanakhon. Schön zum Sonnenuntergang. BTS Chong Nonsi.', 'mahanakhon'],
    ['Bang Krachao', 'park', 13.6968, 100.56684, 'Die grüne Lunge Bangkoks. Fahrrad mieten und durch den Dschungel fahren.', 'bang-krachao'],
    ['Ayutthaya', 'ausflug', 14.35635, 100.56853, 'Alte Königsstadt. Der Buddhakopf im Baum ist im Wat Mahathat. Tagesausflug.', 'ayutthaya'],
    ['Golden Mount', 'tempel', 13.75385, 100.50669, 'Wat Saket – Treppen hinauf, oben Rundblick über die Altstadt.', 'golden-mount'],
  ],
};

// Bilder auch für Trips, die vor den Bildern angelegt wurden: Zuordnung über den Namen
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const NACH_NAME = Object.fromEntries(BANGKOK.orte.filter((o) => o[5]).map((o) => [norm(o[0]), o[5]]));
// groesse: 'orte' (groß), 'klein' (Listen) oder 'hg' (vorab weichgezeichneter Hintergrund)
export function bildFuerOrt(o, groesse = 'orte') {
  const k = o.b || NACH_NAME[norm(o.n)];
  return k ? `bilder/${groesse}/${k}.webp` : null;
}
// Beste Zeit für einen Ort: 'wochenende' (nur Sa/So offen), 'abend' (Sonnenuntergang), 'frueh' (morgens hin), 'drinnen' (gut bei Regen)
const ZEITEN = {
  chatuchakweekendmarket: 'wochenende', watarun: 'abend', mahanakhonskywalk: 'abend', rooftopbar: 'abend', foodtour: 'abend',
  grandpalace: 'frueh', floatingmarket: 'frueh', watpho: 'frueh', iconsiam: 'drinnen', emsphere: 'drinnen', massage: 'drinnen',
};
export function zeitFuerOrt(o) {
  return o.z || ZEITEN[norm(o.n)] || ({ shopping: 'drinnen', erholung: 'drinnen', bar: 'abend', aussicht: 'abend' })[o.k] || null;
}

export function bildFuerTrip(meta, groesse = 'orte') {
  if (!meta) return null;
  const k = meta.b || (norm(meta.n).includes('bangkok') ? BANGKOK.bild : null);
  return k ? `bilder/${groesse}/${k}.webp` : null;
}
