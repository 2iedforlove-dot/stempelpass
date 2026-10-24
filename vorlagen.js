// Kategorien und die Bangkok-Liste vom Zettel

export const KATEGORIEN = {
  tempel: { emoji: '🛕', name: 'Tempel' },
  markt: { emoji: '🏮', name: 'Markt' },
  park: { emoji: '🌳', name: 'Park & Natur' },
  aussicht: { emoji: '🌇', name: 'Aussicht' },
  essen: { emoji: '🍜', name: 'Essen' },
  shopping: { emoji: '🛍️', name: 'Shopping' },
  wasser: { emoji: '⛵', name: 'Am Wasser' },
  kultur: { emoji: '🏛️', name: 'Kultur' },
  erholung: { emoji: '💆', name: 'Erholung' },
  bar: { emoji: '🍸', name: 'Bar & Abend' },
  viertel: { emoji: '🎨', name: 'Viertel' },
  ausflug: { emoji: '🚐', name: 'Ausflug' },
  sonst: { emoji: '📍', name: 'Sonstiges' },
};

export const BANGKOK = {
  name: 'Bangkok',
  emoji: '🇹🇭',
  orte: [
    ['Chatuchak Weekend Market', 'markt', 13.80027, 100.55112, 'Nur Samstag & Sonntag – ihr wolltet am Sonntag hin. Früh kommen, mittags wird es sehr heiß. MRT Chatuchak Park / BTS Mo Chit.'],
    ['Wat Arun', 'tempel', 13.7439, 100.48851, 'Tempel der Morgenröte. Fähre ab Tha Tien (bei Wat Pho) für ein paar Baht. Am schönsten zum Sonnenuntergang vom anderen Ufer. Schultern und Knie bedecken.'],
    ['Grand Palace', 'tempel', 13.74935, 100.49186, 'Strenger Dresscode: Schultern und Knie bedeckt. Möglichst früh am Morgen hin. Wat Phra Kaew (Smaragd-Buddha) liegt auf dem Gelände.'],
    ['Wat Pho', 'tempel', 13.74635, 100.49274, 'Liegender Buddha, gleich neben dem Grand Palace. Hier ist auch die bekannte Massageschule.'],
    ['Benjakitti Park', 'park', 13.72908, 100.55476, 'Waldpark mit Skywalk über die Feuchtgebiete. Gut zum Radfahren.'],
    ['Lumpini Park', 'park', 13.7306, 100.54154, 'Warane am See! Morgens und abends angenehm, Tretboote.'],
    ['Ancient City', 'kultur', 13.5463, 100.631, 'Riesiges Freilichtmuseum (Muang Boran) in Samut Prakan. Fahrrad oder Golfcart mieten.'],
    ['Massage', 'erholung', null, null, 'Thai-Massage – z. B. an der Massageschule im Wat Pho oder einfach im Viertel.'],
    ['Rooftop Bar', 'bar', null, null, 'Abends mit Blick über die Stadt.'],
    ['Chao Phraya Bootsfahrt', 'wasser', 13.71837, 100.51257, 'Chao Phraya Express Boat ab Sathorn Pier – die günstigste Stadtrundfahrt. Hält u. a. bei Wat Arun, Wat Pho und ICONSIAM.'],
    ['Floating Market', 'markt', 13.51976, 99.95935, 'Damnoen Saduak, ca. 100 km entfernt – als Ausflug früh am Morgen.'],
    ['Food Tour', 'essen', null, null, 'Streetfood – abends z. B. in Chinatown (Yaowarat Road).'],
    ['Talat Noi', 'viertel', 13.73345, 100.51297, 'Hip, Street Art, Chinatown. Alte Gassen und Cafés am Fluss.'],
    ['ICONSIAM', 'shopping', 13.72682, 100.51029, 'Riesige Mall am Fluss mit einem schwimmenden Markt drinnen.'],
    ['EmSphere', 'shopping', 13.73251, 100.56608, 'Neue Mall an der Sukhumvit Road (BTS Phrom Phong).'],
    ['Mahanakhon Skywalk', 'aussicht', 13.72341, 100.52822, 'Glasboden ganz oben im King Power Mahanakhon. Schön zum Sonnenuntergang. BTS Chong Nonsi.'],
    ['Bang Krachao', 'park', 13.6968, 100.56684, 'Die grüne Lunge Bangkoks. Fahrrad mieten und durch den Dschungel fahren.'],
    ['Ayutthaya', 'ausflug', 14.35635, 100.56853, 'Alte Königsstadt. Der Buddhakopf im Baum ist im Wat Mahathat. Tagesausflug.'],
    ['Golden Mount', 'tempel', 13.75385, 100.50669, 'Wat Saket – Treppen hinauf, oben Rundblick über die Altstadt.'],
  ],
};
