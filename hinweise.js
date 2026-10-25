// Hinweise für heute: Wochenend-Märkte, Sonnenuntergang, Regen, Hitze und der Tagesplan.
// Alle Zeiten in der Zeitzone der Reise (aus der Wettervorhersage).

const WOCHENTAG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Uhrzeit-Teile in einer Zeitzone
function lokal(tz, d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const tag = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { datum: `${p.year}-${p.month}-${p.day}`, stunde: +p.hour % 24, minute: +p.minute, wochentag: tag };
}

// v: Reise-Ansicht, w: Wetter (mit taeglich/stuendlich), zeit(o): 'wochenende' | 'abend' | 'frueh' | 'drinnen' | null
export function hinweiseFuer(v, w, { t, zeit, planTag }) {
  if (!v || !v.meta) return [];
  const liste = [];
  const offen = v.orte.filter((o) => !o.check);
  const namen = (os) => os.slice(0, 3).map((o) => o.n).join(', ');
  const jetzt = lokal(w && w.tz);

  // Heute laut Plan
  const heute = planTag ? planTag(jetzt.datum) : null;
  if (heute && heute.orte.length) {
    const naechster = heute.orte.find((o) => !o.check);
    liste.push({ ico: 'kalender', farbe: '#0a84ff', aktion: 'planheute', wichtig: 3,
      titel: t('Heute: Tag {n}', { n: heute.tag }),
      text: naechster ? t('{k} Orte geplant – nächster Halt: {ort}', { k: heute.orte.length, ort: naechster.n }) : t('Alles von heute gestempelt!') });
  }

  // Wochenend-Märkte
  const we = offen.filter((o) => zeit(o) === 'wochenende');
  if (we.length) {
    const tag = jetzt.wochentag;
    if (tag === 6 || tag === 0) liste.push({ ico: 'markt', farbe: '#ff453a', wichtig: 4, titel: t('Heute ist {tag}', { tag: t(WOCHENTAG[tag]) }), text: t('{orte} hat nur am Wochenende offen – heute klappt es!', { orte: namen(we) }) });
    else if (tag === 5) liste.push({ ico: 'markt', farbe: '#ff453a', wichtig: 3, titel: t('Morgen ist Samstag'), text: t('{orte} hat nur am Wochenende offen.', { orte: namen(we) }) });
  }

  if (w && w.taeglich) {
    // Sonnenuntergang heute
    const su = w.taeglich.sonnenuntergang && w.taeglich.sonnenuntergang[0];
    if (su) {
      const [h, m] = su.slice(11, 16).split(':').map(Number);
      const minBis = h * 60 + m - (jetzt.stunde * 60 + jetzt.minute);
      const abend = offen.filter((o) => zeit(o) === 'abend');
      if (minBis > 0 && minBis < 6 * 60 && abend.length) {
        liste.push({ ico: 'aussicht', farbe: '#ff9f0a', wichtig: 2, titel: t('Sonnenuntergang um {uhr}', { uhr: su.slice(11, 16) }), text: t('Perfekt für {orte}.', { orte: namen(abend) }) });
      }
    }
    // Regen in den nächsten Stunden
    const st = w.stuendlich;
    if (st && st.zeit) {
      const ab = st.zeit.findIndex((z) => z.slice(0, 10) === jetzt.datum && +z.slice(11, 13) >= jetzt.stunde);
      if (ab >= 0) {
        const fenster = st.regen.slice(ab, ab + 8);
        const i = fenster.findIndex((p) => p >= 60);
        if (i >= 0) {
          const drinnen = offen.filter((o) => zeit(o) === 'drinnen');
          liste.push({ ico: 'regen', farbe: '#5e5ce6', wichtig: 2,
            titel: i === 0 ? t('Gerade Regen ({p} %)', { p: fenster[i] }) : t('Regen ab {uhr} ({p} %)', { uhr: st.zeit[ab + i].slice(11, 16), p: fenster[i] }),
            text: drinnen.length ? t('Gut für drinnen: {orte}.', { orte: namen(drinnen) }) : t('Schirm einpacken!') });
        }
      }
    }
  }

  // Hitze
  if (w && w.temp >= 33 && jetzt.stunde >= 9 && jetzt.stunde <= 17) {
    liste.push({ ico: 'sonne', farbe: '#ffb000', wichtig: 1, titel: t('{temp}° in {ort}', { temp: w.temp, ort: v.meta.n }), text: t('Viel trinken und mittags lieber in den Schatten oder in eine Mall.') });
  }

  // Morgen früh einplanen
  if (planTag) {
    const morgenDatum = new Date(jetzt.datum + 'T12:00:00'); morgenDatum.setDate(morgenDatum.getDate() + 1);
    const morgen = planTag(morgenDatum.toISOString().slice(0, 10));
    const frueh = morgen ? morgen.orte.filter((o) => !o.check && zeit(o) === 'frueh') : [];
    if (frueh.length && jetzt.stunde >= 16) liste.push({ ico: 'uhr', farbe: '#30b0c7', wichtig: 2, titel: t('Morgen früh raus'), text: t('{orte} – am besten gleich am Morgen, dann ist es kühler und leerer.', { orte: namen(frueh) }) });
  }

  return liste.sort((a, b) => b.wichtig - a.wichtig);
}
