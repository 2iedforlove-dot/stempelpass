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
  const k = o.b || NACH_NAME[norm(o.orig || o.n)];
  return k ? `bilder/${groesse}/${k}.webp` : null;
}
// Beste Zeit für einen Ort: 'wochenende' (nur Sa/So offen), 'abend' (Sonnenuntergang), 'frueh' (morgens hin), 'drinnen' (gut bei Regen)
const ZEITEN = {
  chatuchakweekendmarket: 'wochenende', watarun: 'abend', mahanakhonskywalk: 'abend', rooftopbar: 'abend', foodtour: 'abend',
  grandpalace: 'frueh', floatingmarket: 'frueh', watpho: 'frueh', iconsiam: 'drinnen', emsphere: 'drinnen', massage: 'drinnen',
};
export function zeitFuerOrt(o) {
  return o.z || ZEITEN[norm(o.orig || o.n)] || ({ shopping: 'drinnen', erholung: 'drinnen', bar: 'abend', aussicht: 'abend' })[o.k] || null;
}

// Namen und Notizen der Vorlage in beiden Sprachen. Gespeichert bleibt der Originalname (damit Bilder,
// Zeiten und andere Geräte ihn wiederfinden); angezeigt wird die Übersetzung der gewählten Sprache.
const NAMEN = {
  marriottmarquisqueenspark: {
    de: ['Marriott Marquis Queen’s Park'],
    en: ['Marriott Marquis Queen’s Park', 'Our hotel – Sukhumvit Soi 22, right next to Benjakitti Park. BTS Phrom Phong / MRT Queen Sirikit National Convention Centre.'],
  },
  chatuchakweekendmarket: {
    de: ['Chatuchak-Wochenendmarkt'],
    en: ['Chatuchak Weekend Market', 'Saturday & Sunday only – you wanted to go on Sunday. Come early, it gets very hot at midday. MRT Chatuchak Park / BTS Mo Chit.'],
  },
  watarun: {
    de: ['Wat Arun – Tempel der Morgenröte'],
    en: ['Wat Arun – Temple of Dawn', 'Ferry from Tha Tien pier (near Wat Pho) for a few baht. Most beautiful at sunset from the other bank. Cover shoulders and knees.'],
  },
  grandpalace: {
    de: ['Großer Königspalast'],
    en: ['Grand Palace', 'Strict dress code: shoulders and knees covered. Go as early as possible. Wat Phra Kaew (Emerald Buddha) is on the grounds.'],
  },
  watpho: {
    de: ['Wat Pho – Liegender Buddha'],
    en: ['Wat Pho – Reclining Buddha', 'The reclining Buddha, right next to the Grand Palace. The famous massage school is here too.'],
  },
  benjakittipark: { de: ['Benjakitti-Park'], en: ['Benjakitti Park', 'Forest park with a skywalk over the wetlands. Great for cycling.'] },
  lumpinipark: { de: ['Lumpini-Park'], en: ['Lumphini Park', 'Monitor lizards at the lake! Pleasant in the morning and evening, pedal boats.'] },
  ancientcity: {
    de: ['Antike Stadt (Muang Boran)'],
    en: ['Ancient City (Muang Boran)', 'Huge open-air museum in Samut Prakan. Rent a bike or a golf cart.'],
  },
  massage: { de: ['Thai-Massage'], en: ['Thai massage', 'Thai massage – e.g. at the massage school in Wat Pho or anywhere in the neighbourhood.'] },
  rooftopbar: { de: ['Dachterrassen-Bar'], en: ['Rooftop bar', 'In the evening with a view over the city.'] },
  chaophrayabootsfahrt: {
    de: ['Bootsfahrt auf dem Chao Phraya'],
    en: ['Chao Phraya boat ride', 'Chao Phraya Express Boat from Sathorn Pier – the cheapest city tour. Stops at Wat Arun, Wat Pho and ICONSIAM, among others.'],
  },
  floatingmarket: {
    de: ['Schwimmender Markt (Damnoen Saduak)'],
    en: ['Floating Market (Damnoen Saduak)', 'Damnoen Saduak, about 100 km away – a day trip early in the morning.'],
  },
  foodtour: { de: ['Streetfood-Tour'], en: ['Street food tour', 'Street food – e.g. in the evening in Chinatown (Yaowarat Road).'] },
  talatnoi: { de: ['Talat Noi'], en: ['Talat Noi', 'Hip, street art, Chinatown. Old alleys and cafés by the river.'] },
  iconsiam: { de: ['ICONSIAM'], en: ['ICONSIAM', 'Huge riverside mall with a floating market inside.'] },
  emsphere: { de: ['EmSphere'], en: ['EmSphere', 'New mall on Sukhumvit Road (BTS Phrom Phong).'] },
  mahanakhonskywalk: {
    de: ['Mahanakhon Skywalk'],
    en: ['Mahanakhon SkyWalk', 'Glass floor at the very top of King Power Mahanakhon. Lovely at sunset. BTS Chong Nonsi.'],
  },
  bangkrachao: { de: ['Bang Krachao – grüne Lunge'], en: ['Bang Krachao – green lung', 'Bangkok’s green lung. Rent a bike and ride through the jungle.'] },
  ayutthaya: { de: ['Ayutthaya'], en: ['Ayutthaya', 'The old royal capital. The Buddha head in the tree is at Wat Mahathat. Day trip.'] },
  goldenmount: { de: ['Goldener Berg (Wat Saket)'], en: ['Golden Mount (Wat Saket)', 'Wat Saket – climb the stairs for a panoramic view over the old town.'] },
};

// Anzeige in der gewählten Sprache; Notiz nur übersetzen, wenn sie noch der Vorlage entspricht
export function uebersetzterOrt(n, notiz, sprache) {
  const e = NAMEN[norm(n)];
  if (!e || !e[sprache]) return { n, notiz };
  const vorlage = BANGKOK.orte.find((o) => norm(o[0]) === norm(n));
  const notizUnveraendert = !notiz || (vorlage && notiz === vorlage[4]);
  return { n: e[sprache][0] || n, notiz: notizUnveraendert && e[sprache][1] ? e[sprache][1] : notiz };
}

export function bildFuerTrip(meta, groesse = 'orte') {
  if (!meta) return null;
  const k = meta.b || (norm(meta.n).includes('bangkok') ? BANGKOK.bild : null);
  return k ? `bilder/${groesse}/${k}.webp` : null;
}
