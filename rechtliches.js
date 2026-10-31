// Impressum (§ 25 MedienG) und Datenschutzerklärung (Art. 13 DSGVO), auf Deutsch und Englisch.
// Nur diese drei Angaben fehlen noch – solange sie leer sind, bleibt der Eintrag im Profil ausgeblendet
// und die Seite ist nur über ?seite=rechtliches zum Gegenlesen erreichbar.
export const VERANTWORTLICH = {
  name: '',
  adresse: '', // Straße Hausnummer, PLZ Ort, Österreich
  email: '',
};
export const STAND = '2026-10-31';
export const rechtlichesFertig = () => Object.values(VERANTWORTLICH).every((x) => x.trim());

const RELAYS = ['nos.lol', 'relay.damus.io', 'relay.primal.net', 'nostr.mom', 'offchain.pub', 'nostr.oxtr.dev'];

export function rechtlichesHtml(sprache, esc) {
  const en = sprache === 'en';
  const feld = (k, leer) => (VERANTWORTLICH[k].trim() ? esc(VERANTWORTLICH[k]) : `<mark class="platzhalter">${esc(leer)}</mark>`);
  const name = feld('name', en ? '[name]' : '[Name]');
  const adresse = feld('adresse', en ? '[address]' : '[Anschrift]');
  const email = VERANTWORTLICH.email.trim() ? `<a href="mailto:${esc(VERANTWORTLICH.email)}">${esc(VERANTWORTLICH.email)}</a>` : feld('email', en ? '[email]' : '[E-Mail]');
  const stand = new Date(STAND + 'T12:00:00').toLocaleDateString(en ? 'en-GB' : 'de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
  const entwurf = rechtlichesFertig() ? '' : `<div class="recht-entwurf">${en ? 'Draft: name, address and email are still missing.' : 'Entwurf: Name, Anschrift und E-Mail fehlen noch.'}</div>`;
  const relays = RELAYS.map((r) => `<code>${r}</code>`).join(', ');
  return en ? `${entwurf}
<h2>Legal notice</h2>
<p><b>Media owner and publisher:</b> ${name}, ${adresse}<br>Email: ${email}</p>
<p>Stempelpass is a free, private and non-commercial project.</p>
<p><b>Basic orientation (§ 25 Austrian Media Act):</b> an app in which families and groups plan destinations, stamp them together and keep a record of their trip.</p>
<p><b>Sources:</b> map data © OpenStreetMap contributors; maps from OpenFreeMap (OpenMapTiles) and Protomaps; information and photos about places from Wikipedia, Wikidata and Wikimedia Commons under free licences (details under “Photo credits” in your profile); weather from Open-Meteo.</p>

<h2>Privacy policy</h2>
<h3>Who is responsible</h3>
<p>${name}, ${adresse}, ${email}</p>
<h3>The short version</h3>
<ul>
  <li>No account, no cookies, no tracking, no advertising. We do not sell any data.</li>
  <li>Your trips, photos and settings are stored on your device.</li>
  <li>When you share a trip with your family it is end-to-end encrypted. Only people who know the trip code can read it – not even we can.</li>
  <li>Only what you explicitly publish becomes public: a trip plan without accommodation, notes or photos.</li>
</ul>
<h3>Data on your device</h3>
<p>Trips, places, stamps, journal, photos (a small and a large version), settings, the name and colour you chose and a random device key are stored in your browser’s storage (localStorage, IndexedDB and a cache for offline use). You delete them by leaving a trip or by deleting the website data or the app.</p>
<h3>Shared trips</h3>
<p>So that everyone on a trip sees the same state, the app sends changes through public Nostr servers (“relays”): ${relays}. The contents – places, stamps, names of travellers, notes and photos (800 px) – are encrypted with a key derived from the trip code (AES-GCM). The operators only see your IP address, the time, the size of the message and a random identifier of the trip. Some operators are located outside the EU; we have no contract with them and cannot guarantee that deleted messages disappear there immediately, but they cannot be read without the trip code. Legal basis: Art. 6(1)(b) GDPR (providing the function you use).</p>
<h3>Public trip plans (only if you publish one)</h3>
<p>A published plan contains its name and text, the destination with its approximate location, and the places with category, photo and order, signed with your random device key. Accommodation, notes, photos, journal, fellow travellers and stamps are never included. Plans are unencrypted and readable by anyone. If you rate a plan, your stars, your text, the name you enter and how many places you have stamped become public as well. When you withdraw a plan, the app replaces it and asks the relays to delete it; whether copies remain with third parties is outside our control. Legal basis: your consent, Art. 6(1)(a) GDPR.</p>
<h3>Hiking stamp statistics</h3>
<p>On hiking stamp routes (for example a municipality’s), the app counts on-site stamps anonymously: station, day, badge reached and two identifiers calculated from random values that cannot be traced back. No name, no location. Each entry is encrypted (NIP-44), readable only by the publisher of the route and signed with its own one-time key. You can switch counting off on the route at any time. Legal basis: legitimate interest of the route publisher in visitor numbers, Art. 6(1)(f) GDPR; switching it off is your objection.</p>
<h3>Location</h3>
<p>Only with your permission and only on your device: for distances, “nearby” and on-site stamps. Your location is not sent to us. Exception: if you calculate a route from “My location”, the start and destination coordinates go to the routing service (see below). For on-site stamps the trip stores the distance to the station as proof (encrypted, no coordinates).</p>
<h3>Photos</h3>
<p>Photos are resized and re-saved on your device; metadata such as the GPS position is removed in the process. The app only reads the date the photo was taken. The 800 px version is shared encrypted with your trip; the large version stays on your device. The photo book PDF is created on your device.</p>
<h3>Services the app contacts directly</h3>
<p>These services receive your IP address and the content of the request, but no profile of you:</p>
<ul>
  <li><b>GitHub Pages</b> (GitHub Inc., USA) delivers the app; server logs contain IP addresses.</li>
  <li><b>OpenFreeMap</b>: map tiles for the area shown.</li>
  <li><b>Photon</b> (komoot GmbH, Germany) and <b>Nominatim</b> (OpenStreetMap Foundation, United Kingdom): place search – search term and map centre.</li>
  <li><b>Open-Meteo</b> (Switzerland): weather and sunset for the destination, search for your home town.</li>
  <li><b>FOSSGIS e.V.</b> (routing.openstreetmap.de, Germany): routes – start and destination coordinates.</li>
  <li><b>Wikimedia Foundation</b> (USA) – Wikipedia, Wikidata, Wikimedia Commons: photos, information and audio guide texts – names and coordinates of sights.</li>
  <li><b>Reading aloud</b> uses your device’s speech output. Depending on the browser and voice, the text may be processed by the provider (e.g. Google, Apple, Microsoft).</li>
  <li><b>Google Maps</b> only if you tap a Google Maps link.</li>
</ul>
<p>Legal basis: Art. 6(1)(f) GDPR (providing the app’s functions). For the United Kingdom and Switzerland there are adequacy decisions of the European Commission; for services in the USA the EU-US Data Privacy Framework applies where the provider is certified.</p>
<h3>Storage period</h3>
<p>On your device until you delete it. On the relays according to the operators’ rules. Statistics until the publisher of the route deletes them.</p>
<h3>Your rights</h3>
<p>You have the right to access, rectification, erasure, restriction, data portability and objection, and you can withdraw consent at any time. Write to ${email}. Since we keep no accounts and contents are encrypted, we usually cannot attribute data to a person (Art. 11 GDPR) – you can delete most of it directly in the app. You can lodge a complaint with the Austrian Data Protection Authority, Barichgasse 40–42, 1030 Vienna, <a href="https://www.dsb.gv.at" target="_blank" rel="noopener">dsb.gv.at</a>.</p>
<h3>Children</h3>
<p>Stempelpass is made for families. Children under 14 should use the app together with their parents.</p>
<p class="recht-stand">Last updated: ${stand}</p>`
    : `${entwurf}
<h2>Impressum</h2>
<p><b>Medieninhaber und Herausgeber:</b> ${name}, ${adresse}<br>E-Mail: ${email}</p>
<p>Stempelpass ist ein kostenloses, privates und nicht gewerbliches Projekt.</p>
<p><b>Grundlegende Richtung (§ 25 MedienG):</b> eine App, mit der Familien und Gruppen Reiseziele planen, gemeinsam abstempeln und ihre Reise festhalten.</p>
<p><b>Quellen:</b> Kartendaten © OpenStreetMap-Mitwirkende; Karten von OpenFreeMap (OpenMapTiles) und Protomaps; Infos und Fotos zu Orten aus Wikipedia, Wikidata und Wikimedia Commons unter freien Lizenzen (Einzelheiten unter „Bildnachweise“ im Profil); Wetter von Open-Meteo.</p>

<h2>Datenschutzerklärung</h2>
<h3>Wer verantwortlich ist</h3>
<p>${name}, ${adresse}, ${email}</p>
<h3>Das Wichtigste in Kürze</h3>
<ul>
  <li>Kein Konto, keine Cookies, kein Tracking, keine Werbung. Wir verkaufen keine Daten.</li>
  <li>Deine Reisen, Fotos und Einstellungen liegen auf deinem Gerät.</li>
  <li>Teilst du eine Reise mit deiner Familie, wird sie Ende-zu-Ende-verschlüsselt. Lesen kann sie nur, wer den Reise-Code kennt – auch wir nicht.</li>
  <li>Öffentlich wird nur, was du ausdrücklich veröffentlichst: ein Reiseplan ohne Unterkünfte, Notizen und Fotos.</li>
</ul>
<h3>Daten auf deinem Gerät</h3>
<p>Reisen, Orte, Stempel, Tagebuch, Fotos (eine kleine und eine große Fassung), Einstellungen, der gewählte Name samt Farbe und ein zufälliger Geräteschlüssel liegen im Speicher deines Browsers (localStorage, IndexedDB und ein Zwischenspeicher für die Offline-Nutzung). Du löschst sie, indem du eine Reise verlässt oder die Website-Daten bzw. die App löschst.</p>
<h3>Gemeinsame Reisen</h3>
<p>Damit alle Mitreisenden denselben Stand sehen, schickt die App Änderungen über öffentliche Nostr-Server („Relays“): ${relays}. Die Inhalte – Orte, Stempel, Namen der Mitreisenden, Notizen und Fotos (800 px) – sind mit einem Schlüssel aus dem Reise-Code verschlüsselt (AES-GCM). Die Betreiber sehen nur deine IP-Adresse, den Zeitpunkt, die Größe der Nachricht und eine zufällige Kennung der Reise. Manche Betreiber sitzen außerhalb der EU; wir haben keinen Vertrag mit ihnen und können nicht garantieren, dass gelöschte Nachrichten dort sofort verschwinden – ohne Reise-Code sind sie aber nicht lesbar. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung der Funktion, die du nutzt).</p>
<h3>Öffentliche Reisepläne (nur wenn du einen veröffentlichst)</h3>
<p>Ein veröffentlichter Plan enthält Name und Text, das Ziel mit ungefährer Lage und die Orte mit Kategorie, Bild und Reihenfolge, signiert mit deinem zufälligen Geräteschlüssel. Nie dabei sind Unterkünfte, Notizen, Fotos, Tagebuch, Mitreisende und Stempel. Pläne sind unverschlüsselt und für alle lesbar. Bewertest du einen Plan, werden auch deine Sterne, dein Text, der Name, den du angibst, und wie viele Orte du geschafft hast öffentlich. Ziehst du einen Plan zurück, ersetzt die App ihn und bittet die Relays um Löschung; ob Kopien bei Dritten bleiben, liegt außerhalb unserer Kontrolle. Rechtsgrundlage: deine Einwilligung, Art. 6 Abs. 1 lit. a DSGVO.</p>
<h3>Statistik bei Wanderstempel-Runden</h3>
<p>Bei Wanderstempel-Runden (etwa einer Gemeinde) zählt die App Vor-Ort-Stempel anonym: Station, Tag, erreichte Wandernadel und zwei Kennungen, die aus Zufallswerten berechnet sind und sich nicht zurückverfolgen lassen. Kein Name, kein Standort. Jeder Eintrag ist verschlüsselt (NIP-44), nur für den Herausgeber der Runde lesbar und mit einem eigenen Einmal-Schlüssel signiert. Du kannst das Mitzählen in der Runde jederzeit abschalten. Rechtsgrundlage: berechtigtes Interesse des Herausgebers an Besucherzahlen, Art. 6 Abs. 1 lit. f DSGVO; das Abschalten ist dein Widerspruch.</p>
<h3>Standort</h3>
<p>Nur mit deiner Erlaubnis und nur auf deinem Gerät: für Entfernungen, „In der Nähe“ und Vor-Ort-Stempel. Dein Standort wird nicht an uns geschickt. Ausnahme: Berechnest du eine Route ab „Mein Standort“, gehen Start- und Zielkoordinaten an den Routendienst (siehe unten). Bei Vor-Ort-Stempeln speichert die Reise den Abstand zur Station als Nachweis (verschlüsselt, ohne Koordinaten).</p>
<h3>Fotos</h3>
<p>Fotos werden auf deinem Gerät verkleinert und neu gespeichert; dabei gehen Metadaten wie die GPS-Position verloren. Die App liest nur das Aufnahmedatum. Mit der Reise geteilt wird die 800-px-Fassung, verschlüsselt; die große Fassung bleibt auf deinem Gerät. Das Fotobuch-PDF entsteht auf deinem Gerät.</p>
<h3>Dienste, die die App direkt anfragt</h3>
<p>Diese Dienste erhalten deine IP-Adresse und den Inhalt der Anfrage, aber kein Profil von dir:</p>
<ul>
  <li><b>GitHub Pages</b> (GitHub Inc., USA) liefert die App aus; die Server-Protokolle enthalten IP-Adressen.</li>
  <li><b>OpenFreeMap</b>: Kartenkacheln für den angezeigten Bereich.</li>
  <li><b>Photon</b> (komoot GmbH, Deutschland) und <b>Nominatim</b> (OpenStreetMap Foundation, Vereinigtes Königreich): Ortssuche – Suchbegriff und Kartenmitte.</li>
  <li><b>Open-Meteo</b> (Schweiz): Wetter und Sonnenuntergang am Reiseziel, Suche nach deinem Heimatort.</li>
  <li><b>FOSSGIS e. V.</b> (routing.openstreetmap.de, Deutschland): Routen – Start- und Zielkoordinaten.</li>
  <li><b>Wikimedia Foundation</b> (USA) – Wikipedia, Wikidata, Wikimedia Commons: Fotos, Infos und Audio-Guide-Texte – Namen und Koordinaten von Sehenswürdigkeiten.</li>
  <li><b>Vorlesen</b> nutzt die Sprachausgabe deines Geräts. Je nach Browser und Stimme kann der Text dabei vom Anbieter verarbeitet werden (z. B. Google, Apple, Microsoft).</li>
  <li><b>Google Maps</b> nur, wenn du einen Link zu Google Maps antippst.</li>
</ul>
<p>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (Bereitstellung der Funktionen der App). Für das Vereinigte Königreich und die Schweiz gibt es Angemessenheitsbeschlüsse der EU-Kommission; für Dienste in den USA gilt das EU-US Data Privacy Framework, soweit der Anbieter zertifiziert ist.</p>
<h3>Speicherdauer</h3>
<p>Auf deinem Gerät, bis du sie löschst. Auf den Relays nach den Regeln der Betreiber. Die Statistik, bis der Herausgeber der Runde sie löscht.</p>
<h3>Deine Rechte</h3>
<p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch und kannst eine Einwilligung jederzeit widerrufen. Schreib an ${email}. Weil wir keine Konten führen und Inhalte verschlüsselt sind, können wir Daten meist keiner Person zuordnen (Art. 11 DSGVO) – das meiste kannst du direkt in der App löschen. Beschweren kannst du dich bei der Österreichischen Datenschutzbehörde, Barichgasse 40–42, 1030 Wien, <a href="https://www.dsb.gv.at" target="_blank" rel="noopener">dsb.gv.at</a>.</p>
<h3>Kinder</h3>
<p>Stempelpass ist für Familien gemacht. Kinder unter 14 Jahren sollen die App gemeinsam mit ihren Eltern nutzen.</p>
<p class="recht-stand">Stand: ${stand}</p>`;
}
