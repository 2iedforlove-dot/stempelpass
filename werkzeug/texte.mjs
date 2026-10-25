// Listet alle übersetzbaren Texte (t('…')) aus dem Code und meldet, welche in i18n.js noch fehlen.
// Aufruf: node werkzeug/texte.mjs
import { readFileSync } from 'node:fs';
import { KATEGORIEN } from '../vorlagen.js';

const wurzel = new URL('../', import.meta.url);
const texte = new Set();
for (const f of ['app.js', 'onboarding.js']) {
  const s = readFileSync(new URL(f, wurzel), 'utf8');
  for (const m of s.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) texte.add(m[1].replace(/\\n/g, '\n'));
}
// Texte, die über Variablen in t() landen
Object.values(KATEGORIEN).forEach((k) => texte.add(k.name));
['Alles gestempelt!', 'Fast geschafft!', 'Halbzeit!', 'Guter Start!', 'Gestempelt!', 'Reisen', 'Karte', 'Profil', 'Alle', 'Offen', 'Erledigt', 'Nähe', 'Suchen', 'Liste', 'Ohne Ort',
  'Guten Morgen', 'Hallo', 'Guten Abend', 'Gute Nacht', 'Guten Morgen, {name}', 'Hallo, {name}', 'Guten Abend, {name}', 'Gute Nacht, {name}'].forEach((x) => texte.add(x));

const { EN } = await import(new URL('i18n.js', wurzel));
const fehlt = [...texte].filter((x) => !(x in EN));
console.log(texte.size, 'Texte,', fehlt.length, 'ohne Englisch');
fehlt.forEach((x) => console.log(JSON.stringify(x)));
