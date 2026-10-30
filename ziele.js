// Reiseziele weltweit und ihre bekanntesten Sehenswürdigkeiten – nur freie Quellen, ohne Schlüssel:
// Photon (OpenStreetMap) für Städte, Regionen und Länder, Wikidata für Sehenswürdigkeiten,
// Wikipedia für Titelbilder. "Bekanntheit" = in wie vielen Wikipedia-Sprachen es einen Artikel gibt.

const SPARQL = 'https://query.wikidata.org/sparql';
const WD_API = 'https://www.wikidata.org/w/api.php';

// Wikidata-Typen, die als Sehenswürdigkeit zählen, und die passende Stempelpass-Kategorie
const TYPEN = {
  tempel: ['Q16970', 'Q1088552', 'Q2977', 'Q56242215', 'Q5393308', 'Q427287', 'Q32815', 'Q44539', 'Q845945', 'Q842402', 'Q199451', 'Q180987', 'Q44613', 'Q163687', 'Q34627', 'Q697295', 'Q108325', 'Q1129743'],
  kultur: ['Q33506', 'Q207694', 'Q1007870', 'Q16560', 'Q751876', 'Q23413', 'Q57821', 'Q4989906', 'Q5003624', 'Q162875', 'Q839954', 'Q109607', 'Q210272', 'Q2065736', 'Q24354', 'Q153562', 'Q22806', 'Q1569871', 'Q66626342', 'Q570116', 'Q41176', 'Q811979', 'Q1497364', 'Q17350442'],
  park: ['Q22698', 'Q22746', 'Q167346', 'Q43501', 'Q2281788', 'Q46169', 'Q40080', 'Q34038', 'Q1107656', 'Q8502'],
  aussicht: ['Q12518', 'Q1440300', 'Q11303', 'Q6017969'],
  markt: ['Q37654', 'Q330284', 'Q1144661'],
  shopping: ['Q11315', 'Q31374404'],
  wasser: ['Q12280', 'Q537127', 'Q39715', 'Q44782'],
  ausflug: ['Q194195'],
  viertel: ['Q174782', 'Q15243209'],
};
const TYP_ZU_KAT = new Map(Object.entries(TYPEN).flatMap(([k, ids]) => ids.map((id) => [id, k])));
const RANG = ['tempel', 'markt', 'shopping', 'park', 'aussicht', 'ausflug', 'wasser', 'viertel', 'kultur'];

async function json(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) throw new Error(r.status + ' ' + url);
  return r.json();
}

// Städte, Regionen und Länder suchen
export async function zieleSuchen(q, sprache) {
  const p = new URLSearchParams({ q, limit: '8', lang: sprache === 'en' ? 'en' : 'de' });
  ['city', 'state', 'country', 'district', 'locality'].forEach((l) => p.append('layer', l));
  const j = await json('https://photon.komoot.io/api/?' + p);
  return j.features.map((f) => {
    const x = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    // Ausdehnung grob als Radius (für die Suche nach Sehenswürdigkeiten)
    let radius = x.type === 'country' ? 400 : x.type === 'state' ? 120 : 10;
    if (x.extent) {
      const [w, n, e, s] = x.extent;
      const km = Math.max(Math.abs(n - s) * 111, Math.abs(e - w) * 111 * Math.cos(lat * Math.PI / 180)) / 2;
      radius = Math.min(x.type === 'country' ? 600 : 150, Math.max(4, km));
    }
    return { n: x.name, typ: x.type, land: x.country || '', region: x.state || '', cc: (x.countrycode || '').toLowerCase(), lat, lng, radius: Math.round(radius) };
  }).filter((z, i, a) => a.findIndex((y) => y.n === z.n && y.cc === z.cc && y.typ === z.typ) === i)
    // Genauer Namenstreffer und Städte/Länder zuerst – sonst landet bei "Kyoto" ein Dorf in Indonesien vor Kyōto
    .map((z, i) => [z, rang(z, q) + i * 0.01]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
}

const TYP_RANG = { country: 0, city: 1, state: 2, district: 3, locality: 4 };
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
function rang(z, q) {
  const n = normal(z.n), s = normal(q);
  return (n === s ? 0 : n.startsWith(s) ? 5 : 8) + (TYP_RANG[z.typ] ?? 5);
}

// Titelbild und Kurzbeschreibung eines Ziels: Text aus Wikipedia, Foto aus Wikidata (P18 ist bei Städten
// meist eine Stadtansicht – das Wikipedia-Vorschaubild ist oft nur das Wappen)
export async function zielInfo(name, sprache) {
  for (const l of [sprache, 'en']) {
    try {
      const j = await json(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, '_'))}`);
      if (j.type === 'disambiguation') continue;
      let bf = null;
      if (j.wikibase_item) {
        const e = await json(`${WD_API}?action=wbgetentities&ids=${j.wikibase_item}&props=claims&format=json&origin=*`);
        const p18 = e.entities[j.wikibase_item]?.claims?.P18;
        bf = p18 && p18[0].mainsnak.datavalue ? p18[0].mainsnak.datavalue.value : null;
      }
      const vorschau = (j.originalimage || {}).source || '';
      const bild = bf && !/\.svg$/i.test(bf) ? commonsBild(bf, 1280) : vorschau && !/\.svg/i.test(vorschau) ? vorschau : null;
      return { bild, bf: bf && !/\.svg$/i.test(bf) ? bf : null, text: j.extract || '', qid: j.wikibase_item || null };
    } catch {}
  }
  return { bild: null, bf: null, text: '', qid: null };
}

// Bekannteste Sehenswürdigkeiten um einen Punkt (radius in km)
export async function sehenswuerdigkeiten(lat, lng, radius, sprache) {
  const grosseFlaeche = radius > 60;
  const q = `SELECT ?item ?links (SAMPLE(?c) AS ?coord) (SAMPLE(?bild) AS ?b) (GROUP_CONCAT(DISTINCT STRAFTER(STR(?typ), "entity/")) AS ?typen) WHERE {
    SERVICE wikibase:around { ?item wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radius}" . }
    ?item wikibase:sitelinks ?links . FILTER(?links >= ${grosseFlaeche ? 25 : 6})
    ?item wdt:P31 ?typ .
    OPTIONAL { ?item wdt:P18 ?bild }
  } GROUP BY ?item ?links ORDER BY DESC(?links) LIMIT ${grosseFlaeche ? 300 : 150}`;
  const j = await json(SPARQL + '?format=json&query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json' } });
  const treffer = [];
  for (const b of j.results.bindings) {
    const typen = b.typen.value.split(' ');
    // Spezifische Kategorien zuerst (eine Kathedrale ist auch "Kulturerbe", soll aber als Kirche gelten)
    const kats = new Set(typen.map((t) => TYP_ZU_KAT.get(t)).filter(Boolean));
    const kat = RANG.find((k) => kats.has(k));
    if (!kat) continue;
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
    if (!m) continue;
    treffer.push({
      wd: b.item.value.split('/').pop(), links: +b.links.value, k: kat, lng: +m[1], lat: +m[2],
      bf: b.b ? decodeURIComponent(b.b.value.split('/Special:FilePath/')[1] || '') : null,
    });
    if (treffer.length >= 30) break;
  }
  // Namen und Kurzbeschreibung in beiden Sprachen
  if (treffer.length) {
    const e = await json(`${WD_API}?action=wbgetentities&ids=${treffer.map((x) => x.wd).join('|')}&props=labels|descriptions&languages=de|en&format=json&origin=*`);
    for (const x of treffer) {
      const ent = e.entities[x.wd] || {};
      const lab = ent.labels || {}, des = ent.descriptions || {};
      x.nl = { de: lab.de?.value || lab.en?.value, en: lab.en?.value || lab.de?.value };
      x.n = x.nl[sprache] || x.nl.en || x.wd;
      x.info = (des[sprache] || des.en || {}).value || '';
    }
  }
  return treffer.filter((x) => x.n && !/^Q\d+$/.test(x.n));
}

// Commons-Bild in passender Größe
export function commonsBild(datei, breite) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(datei)}?width=${breite}`;
}
