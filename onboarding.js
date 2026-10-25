// Einführung beim ersten Start: Sprache, Name & Farbe, Heimatort, Design, Töne – im Apple-Stil.
// Animationen: Text taucht Wort für Wort aus der Unschärfe auf, Fotokarten fächern sich in 3D auf,
// die farbige Aura im Hintergrund wechselt mit jedem Schritt.

const SCHRITTE = ['start', 'sprache', 'name', 'heimat', 'design', 'gefuehl', 'fertig'];
const AUREN = {
  start: ['#0a84ff', '#bf5af2', '#ff2d78', '#ff9f0a'],
  sprache: ['#64d2ff', '#0a84ff', '#5e5ce6', '#30d158'],
  name: ['#ff2d78', '#bf5af2', '#ff9f0a', '#ff453a'],
  heimat: ['#30d158', '#64d2ff', '#0a84ff', '#ffd60a'],
  design: ['#5e5ce6', '#bf5af2', '#0a84ff', '#ff2d78'],
  gefuehl: ['#ff9f0a', '#ff453a', '#ff2d78', '#bf5af2'],
  fertig: ['#0a84ff', '#bf5af2', '#ff2d78', '#ff9f0a'],
};

export function starteOnboarding(h) {
  const { ich, t, icon, scheibe, sound, fuehlen, flagge, orteSuchen, esc } = h;
  return new Promise((fertig) => {
    const el = document.createElement('div');
    el.className = 'onb';
    el.innerHTML = `
      <div class="onb-aura"><i></i><i></i><i></i><i></i></div>
      <div class="onb-schleier"></div>
      <div class="onb-raster"></div>
      <div class="onb-kopf"><button class="kreisknopf glas" data-zurueck aria-label="Zurück">${icon('zurueck', 20, 2.3)}</button><div class="punkte">${SCHRITTE.map(() => '<i></i>').join('')}</div><span style="width:42px"></span></div>
      <div class="onb-buehne"></div>`;
    document.body.appendChild(el);
    const buehne = el.querySelector('.onb-buehne');
    let i = 0;
    let suchTimer = null, treffer = [];

    // Überschrift Wort für Wort aus der Unschärfe einblenden
    const woerter = (text, start = 0) => esc(text).split(/(\s+)/).map((w, n) => (/^\s+$/.test(w) ? w : `<span class="wort" style="--w:${start + n / 2}">${w}</span>`)).join('');

    function html(s) {
      if (s === 'start') return `
        <div class="faecher" data-rein style="--v:0">
          ${h.bilder.map((b, n) => {
            const pos = [[-120, 28, -14, -80], [-42, 12, -5, -20], [42, -12, 5, -20], [120, -28, 14, -80]][n];
            return `<div class="fk" style="--i:${n};--x:${pos[0]}px;--ry:${pos[1]}deg;--rz:${pos[2]}deg;--z:${pos[3]}px"><img src="${b}" alt=""></div>`;
          }).join('')}
          ${scheibe({ text: 'Stempelpass • ' + t('Reisen') + ' • ' + t('Abstempeln'), inhalt: icon('haken', 34, 2.6), klasse: 'gestempelt', attr: 'tabindex="-1" aria-hidden="true"' })}
        </div>
        <h1 data-rein style="--v:2;text-align:center"><span class="verlauf-text">Stempelpass</span></h1>
        <p class="lead" style="text-align:center">${woerter(t('Eure Reiseziele auf einer Karte. Gemeinsam abstempeln – auch offline.'))}</p>
        <div class="onb-unten"><button class="knopf regenbogen voll" data-rein style="--v:6" data-weiter>${esc(t('Los geht’s'))}</button></div>`;
      if (s === 'sprache') return `
        <h2 data-rein style="--v:0">${woerter('Hallo! Hello!')}</h2>
        <p class="lead" data-rein style="--v:1">${esc(t('Welche Sprache möchtest du?'))}</p>
        <div class="wahl-karten onb-mitte">
          ${[['de', '🇩🇪', 'Deutsch', 'Deutsch'], ['en', '🇬🇧', 'English', 'English']].map(([k, f, n, u], n2) => `
            <button class="wahl-karte glas ${ich.sprache === k ? 'an' : ''}" data-rein style="--v:${2 + n2}" data-sprache="${k}"><span class="gross">${f}</span><span>${n}<small>${u}</small></span><span class="haken">${icon('haken', 16, 3)}</span></button>`).join('')}
        </div>
        <div class="onb-unten"><button class="knopf akzent voll" data-rein style="--v:5" data-weiter>${esc(t('Weiter'))}</button></div>`;
      if (s === 'name') return `
        <span class="avatar ring avatar-vorschau" data-rein style="--v:0;background:${esc(ich.farbe)}" id="oAv">${esc((ich.name || '?').slice(0, 1).toUpperCase())}</span>
        <h2 data-rein style="--v:1;text-align:center">${woerter(t('Wie heißt du?'), 1)}</h2>
        <p class="lead" data-rein style="--v:2;text-align:center">${esc(t('So sehen die anderen, wer etwas abgestempelt hat.'))}</p>
        <div class="onb-mitte" data-rein style="--v:3">
          <input class="eingabe glas" id="oName" placeholder="${esc(t('z. B. Mama, Papa, Adam'))}" autocomplete="given-name" value="${esc(ich.name)}" style="text-align:center;font-size:20px;height:60px">
          <div class="farben" id="oFarben" style="justify-content:center;margin:18px 0 0">${h.farben.map((f) => `<button class="${f === ich.farbe ? 'an' : ''}" data-farbe="${f}" style="--f:${f}" aria-label="${f}"></button>`).join('')}</div>
        </div>
        <div class="onb-unten"><button class="knopf akzent voll" data-rein style="--v:5" data-weiter ${ich.name ? '' : 'disabled'}>${esc(t('Weiter'))}</button></div>`;
      if (s === 'heimat') return `
        <h2 data-rein style="--v:0">${woerter(t('Woher kommst du?'))}</h2>
        <p class="lead" data-rein style="--v:1">${esc(t('Damit siehst du, wie spät es zuhause ist und wie weit ihr gereist seid.'))}</p>
        <div class="onb-mitte" data-rein style="--v:2">
          ${ich.heimat ? `<div class="wahl-karte glas an" style="margin-bottom:10px"><span class="gross">${flagge(ich.heimat.cc)}</span><span>${esc(ich.heimat.name)}<small>${esc([ich.heimat.region, ich.heimat.land].filter(Boolean).join(', '))}</small></span><span class="haken">${icon('haken', 16, 3)}</span></div>` : ''}
          <input class="eingabe glas" id="oOrt" placeholder="${esc(t('Stadt suchen, z. B. Wien'))}" autocomplete="off">
          <div class="ort-vorschlaege" id="oOrte"></div>
        </div>
        <div class="onb-unten" data-rein style="--v:4">
          <button class="knopf akzent voll" data-weiter>${esc(ich.heimat ? t('Weiter') : t('Überspringen'))}</button>
        </div>`;
      if (s === 'design') return `
        <h2 data-rein style="--v:0">${woerter(t('Wie soll es aussehen?'))}</h2>
        <p class="lead" data-rein style="--v:1">${esc(t('Durchsichtiges Glas – hell, dunkel oder passend zum Handy. Später jederzeit im Profil änderbar.'))}</p>
        <div class="design-wahl onb-mitte">
          ${[['auto', t('Auto')], ['hell', t('Hell')], ['dunkel', t('Dunkel')]].map(([k, n], n2) => `
            <button class="glas ${ich.design === k ? 'an' : ''}" data-rein style="--v:${2 + n2}" data-designwahl="${k}"><div class="mini-handy ${k}"><i></i><i></i><i></i></div>${esc(n)}</button>`).join('')}
        </div>
        <p class="klein" data-rein style="--v:5;margin:22px 0 10px">${esc(t('Akzentfarbe'))}</p>
        <div class="farben" data-rein style="--v:6;justify-content:flex-start;margin:0">${Object.entries(h.akzente).map(([k, f]) => `<button class="${ich.akzent === k ? 'an' : ''}" data-akzent="${k}" style="--f:${f[1]}" aria-label="${k}"></button>`).join('')}</div>
        <div class="onb-unten"><button class="knopf akzent voll" data-rein style="--v:7" data-weiter>${esc(t('Weiter'))}</button></div>`;
      if (s === 'gefuehl') return `
        <h2 data-rein style="--v:0">${woerter(t('Klingt gut, fühlt sich gut an.'))}</h2>
        <p class="lead" data-rein style="--v:1">${esc(t('Jeder Stempel macht ein sattes „Tock“ und vibriert kurz.'))}</p>
        <div class="wahl-karten onb-mitte">
          <label class="wahl-karte glas" data-rein style="--v:2"><span class="gross">${icon('ton', 28)}</span><span>${esc(t('Töne'))}<small>${esc(t('Stempel, Erfolge, kleine Klicks'))}</small></span><input type="checkbox" class="schalter" data-gefuehl="ton" ${h.tonAn() ? 'checked' : ''}></label>
          <label class="wahl-karte glas" data-rein style="--v:3"><span class="gross">${icon('vibration', 28)}</span><span>${esc(t('Vibration'))}<small>${esc(t('Am iPhone ab iOS 18'))}</small></span><input type="checkbox" class="schalter" data-gefuehl="vibration" ${ich.vibration !== false ? 'checked' : ''}></label>
          <button class="wahl-karte glas" data-rein style="--v:4" data-standort><span class="gross">${icon('ortung', 28)}</span><span>${esc(t('Standort'))}<small>${esc(t('Für Entfernungen und „In der Nähe“'))}</small></span><span class="haken" id="oStandort">${icon('haken', 16, 3)}</span></button>
        </div>
        <div class="onb-unten"><button class="knopf akzent voll" data-rein style="--v:6" data-weiter>${esc(t('Weiter'))}</button></div>`;
      return `
        <div class="onb-fertig" data-rein style="--v:0">${scheibe({ text: 'Stempelpass • ' + (ich.name || '') + ' • ' + t('Bereit'), inhalt: icon('haken', 40, 2.6), klasse: 'gestempelt knall', attr: 'tabindex="-1" aria-hidden="true"' })}</div>
        <h1 data-rein style="--v:1;text-align:center"><span class="verlauf-text">${esc(t('Alles bereit, {name}!', { name: ich.name }))}</span></h1>
        <p class="lead" style="text-align:center">${woerter(t('Leg eure erste Reise an oder tritt mit einem Code bei. Gute Reise!'), 2)}</p>
        <div class="onb-unten"><button class="knopf regenbogen voll" data-rein style="--v:6" data-weiter>${esc(t('Los geht’s'))}</button></div>`;
    }

    function zeigen() {
      const s = SCHRITTE[i];
      const a = AUREN[s];
      const aura = el.querySelector('.onb-aura');
      a.forEach((f, n) => aura.style.setProperty('--a' + (n + 1), f));
      el.querySelectorAll('.punkte i').forEach((p, n) => p.classList.toggle('an', n === i));
      el.querySelector('[data-zurueck]').style.visibility = i > 0 && s !== 'fertig' ? 'visible' : 'hidden';
      const alt = buehne.querySelector('.onb-schritt');
      const neu = document.createElement('div');
      neu.className = 'onb-schritt';
      neu.innerHTML = html(s);
      if (alt) { alt.classList.add('raus'); setTimeout(() => alt.remove(), 450); setTimeout(() => buehne.appendChild(neu), 200); } else buehne.appendChild(neu);
      if (s === 'fertig') setTimeout(() => { sound.erfolg(); fuehlen('erfolg'); }, 600);
      const feld = neu.querySelector('#oName');
      if (feld) setTimeout(() => feld.focus({ preventScroll: true }), 900);
    }

    const weiter = () => {
      if (SCHRITTE[i] === 'name' && !ich.name) return;
      h.speichern();
      if (i < SCHRITTE.length - 1) { i++; sound.tick(); fuehlen('leicht'); zeigen(); return; }
      // Abschluss: Konfetti und sanft ausblenden
      h.konfetti();
      el.style.transition = 'opacity .7s cubic-bezier(.2,.8,.2,1), transform .7s cubic-bezier(.2,.8,.2,1), filter .7s';
      el.style.opacity = '0'; el.style.transform = 'scale(1.06)'; el.style.filter = 'blur(12px)';
      setTimeout(() => { el.remove(); fertig(); }, 720);
    };

    el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-weiter]')) return weiter();
      if (e.target.closest('[data-zurueck]')) { if (i > 0) { i--; sound.tick(); zeigen(); } return; }
      const sp = e.target.closest('[data-sprache]');
      if (sp) { h.spracheSetzen(sp.dataset.sprache); sound.plopp(); fuehlen('leicht'); return zeigen(); }
      const f = e.target.closest('[data-farbe]');
      if (f) {
        ich.farbe = f.dataset.farbe; sound.tick(); fuehlen('leicht');
        el.querySelector('#oAv').style.background = ich.farbe;
        el.querySelectorAll('[data-farbe]').forEach((b) => b.classList.toggle('an', b === f));
        return;
      }
      const d = e.target.closest('[data-designwahl]');
      if (d) {
        ich.design = d.dataset.designwahl; h.designSetzen(); sound.tick(); fuehlen('leicht');
        el.querySelectorAll('[data-designwahl]').forEach((b) => b.classList.toggle('an', b === d));
        return;
      }
      const ak = e.target.closest('[data-akzent]');
      if (ak) {
        ich.akzent = ak.dataset.akzent; h.designSetzen(); sound.plopp(); fuehlen('leicht');
        el.querySelectorAll('[data-akzent]').forEach((b) => b.classList.toggle('an', b === ak));
        return;
      }
      const o = e.target.closest('[data-ort]');
      if (o) { ich.heimat = treffer[+o.dataset.ort]; h.speichern(); sound.plopp(); fuehlen('leicht'); return zeigen(); }
      if (e.target.closest('[data-standort]')) {
        h.standort();
        const m = el.querySelector('#oStandort');
        if (m) { m.style.background = 'var(--akzent)'; m.style.borderColor = 'var(--akzent)'; }
        sound.tick();
      }
    });

    el.addEventListener('input', (e) => {
      if (e.target.id === 'oName') {
        ich.name = e.target.value.trim().slice(0, 24);
        el.querySelector('#oAv').textContent = (ich.name || '?').slice(0, 1).toUpperCase();
        el.querySelector('[data-weiter]').disabled = !ich.name;
      }
      if (e.target.id === 'oOrt') {
        clearTimeout(suchTimer);
        const q = e.target.value.trim();
        suchTimer = setTimeout(async () => {
          if (q.length < 2) return;
          try { treffer = await orteSuchen(q); } catch { treffer = []; }
          const box = el.querySelector('#oOrte');
          if (box) box.innerHTML = treffer.map((x, n) => `<button class="glas" data-ort="${n}"><span class="flagge">${flagge(x.cc)}</span><span><b>${esc(x.name)}</b><small>${esc([x.region, x.land].filter(Boolean).join(', '))}</small></span></button>`).join('') || `<p class="klein">${esc(t('Nichts gefunden – Internet an?'))}</p>`;
        }, 350);
      }
    });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'oName') weiter(); });
    el.addEventListener('change', (e) => {
      const g = e.target.closest('[data-gefuehl]');
      if (!g) return;
      if (g.dataset.gefuehl === 'ton') { h.tonSetzen(g.checked); if (g.checked) sound.stempel(); }
      if (g.dataset.gefuehl === 'vibration') { ich.vibration = g.checked; h.speichern(); if (g.checked) fuehlen('stempel'); }
    });

    zeigen();
  });
}
