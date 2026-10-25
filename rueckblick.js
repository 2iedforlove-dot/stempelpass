// Reise-Rückblick als Story (wie die Rückblicke in Apple Fotos): Folien mit Fortschrittsbalken,
// Tippen rechts/links = weiter/zurück, Gedrückt halten = Pause, nach unten wischen = schließen.

const DAUER = 5600;

export function starteRueckblick(h) {
  const { v, t, esc, icon, kat, bildFuerOrt, bildFuerTrip, fotos, sound, abstand, loc, meter } = h;
  const gestempelt = v.orte.filter((o) => o.check).sort((a, b) => a.check.at - b.check.at);
  const cover = bildFuerTrip(v.meta) || (gestempelt[0] && bildFuerOrt(gestempelt[0]));
  const datum = (ms) => new Date(ms).toLocaleDateString(loc(), { day: 'numeric', month: 'long' });

  // Kennzahlen
  let km = 0;
  const mitOrt = gestempelt.filter((o) => o.lat != null);
  for (let i = 1; i < mitOrt.length; i++) km += abstand(mitOrt[i - 1], mitOrt[i]);
  const tage = new Set(gestempelt.map((o) => new Date(o.check.at).toDateString())).size;
  const proPerson = {};
  gestempelt.forEach((o) => { proPerson[o.check.by] = (proPerson[o.check.by] || 0) + 1; });
  const rangliste = v.leute.map((l) => ({ ...l, n2: proPerson[l.id] || 0 })).filter((l) => l.n2).sort((a, b) => b.n2 - a.n2);
  const katZahl = {};
  gestempelt.forEach((o) => { const k = kat(o.k).id; katZahl[k] = (katZahl[k] || 0) + 1; });
  const lieblings = Object.entries(katZahl).sort((a, b) => b[1] - a[1]);

  const folien = [];
  folien.push(`
    <div class="rb-bild kenburns">${cover ? `<img src="${cover}" alt="">` : ''}</div><div class="rb-verlauf"></div>
    <div class="rb-inhalt unten">
      <div class="rb-klein" data-rein style="--v:0">${esc(t('Euer Rückblick'))}</div>
      <h1 data-rein style="--v:1">${esc(v.meta.n)} ${esc(v.meta.e || '')}</h1>
      <p data-rein style="--v:2">${gestempelt.length ? esc(datum(gestempelt[0].check.at) + ' – ' + datum(gestempelt[gestempelt.length - 1].check.at)) : esc(t('Die Reise beginnt gerade.'))}</p>
      <div class="leute gross" data-rein style="--v:3">${v.leute.map((l) => `<span style="background:${esc(l.c || '#888')}">${esc((l.n || '?').slice(0, 1).toUpperCase())}</span>`).join('')}</div>
    </div>`);
  folien.push(`
    <div class="rb-aura"><i></i><i></i><i></i></div>
    <div class="rb-inhalt mitte">
      <div class="rb-klein" data-rein style="--v:0">${esc(t('In Zahlen'))}</div>
      <div class="zahlen">
        <div data-rein style="--v:1"><b data-zaehlen="${gestempelt.length}">0</b><span>${esc(t('Orte gestempelt'))}</span></div>
        <div data-rein style="--v:2"><b data-zaehlen="${Math.round(km / 1000)}">0</b><span>${esc(t('km zwischen den Stempeln'))}</span></div>
        <div data-rein style="--v:3"><b data-zaehlen="${tage}">0</b><span>${esc(tage === 1 ? t('Tag unterwegs') : t('Tage unterwegs'))}</span></div>
        <div data-rein style="--v:4"><b data-zaehlen="${fotos.length}">0</b><span>${esc(t('Fotos & Notizen'))}</span></div>
      </div>
    </div>`);
  if (mitOrt.length >= 2) {
    // Route als SVG: Orte in eine 300×360-Fläche projizieren
    const lats = mitOrt.map((o) => o.lat), lngs = mitOrt.map((o) => o.lng);
    const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const k = Math.cos(((a + b) / 2) * Math.PI / 180);
    const breite = Math.max((d - c) * k, 1e-4), hoehe = Math.max(b - a, 1e-4);
    const s = Math.min(260 / breite, 320 / hoehe);
    const p = mitOrt.map((o) => [20 + ((o.lng - c) * k) * s + (260 - breite * s) / 2, 20 + (b - o.lat) * s + (320 - hoehe * s) / 2]);
    const pfad = p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    folien.push(`
      <div class="rb-bild unscharf">${cover ? `<img src="${cover}" alt="">` : ''}</div><div class="rb-verlauf voll"></div>
      <div class="rb-inhalt">
        <div class="rb-klein" data-rein style="--v:0">${esc(t('Eure Route'))}</div>
        <h2 data-rein style="--v:1">${esc(t('{n} Stationen, {km}', { n: mitOrt.length, km: meter(km) }))}</h2>
        <svg class="rb-route" viewBox="0 0 300 360" aria-hidden="true">
          <path d="${pfad}" pathLength="1" class="linie"/>
          ${p.map((q, i) => `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${i === 0 || i === p.length - 1 ? 7 : 5}" style="--i:${i};--n:${p.length};fill:${kat(mitOrt[i].k).farbe}"/>`).join('')}
          <text x="${p[0][0]}" y="${p[0][1] - 12}" class="beschr">${esc(mitOrt[0].n.slice(0, 18))}</text>
          <text x="${p[p.length - 1][0]}" y="${p[p.length - 1][1] + 22}" class="beschr spaet">${esc(mitOrt[mitOrt.length - 1].n.slice(0, 18))}</text>
        </svg>
      </div>`);
  }
  if (gestempelt.length) {
    const zeigen = gestempelt.slice(-5);
    folien.push(`
      <div class="rb-aura warm"><i></i><i></i><i></i></div>
      <div class="rb-inhalt">
        <div class="rb-klein" data-rein style="--v:0">${esc(t('Eure Stempel'))}</div>
        <h2 data-rein style="--v:1">${esc(gestempelt.length === 1 ? t('Der erste Stempel') : t('{n} Stempel im Pass', { n: gestempelt.length }))}</h2>
        <div class="rb-faecher">${zeigen.map((o, i) => {
          const b = bildFuerOrt(o);
          const n = zeigen.length, x = (i - (n - 1) / 2) * 46, r = (i - (n - 1) / 2) * 7;
          return `<div class="rb-polaroid" style="--i:${i};--x:${x}px;--r:${r}deg">${b ? `<img src="${b}" alt="">` : `<div class="farbe" style="background:${kat(o.k).farbe}">${icon(kat(o.k).id, 40, 1.6)}</div>`}<b>${esc(o.n)}</b><small>${esc(datum(o.check.at))}</small></div>`;
        }).join('')}</div>
      </div>`);
  }
  if (fotos.length) {
    folien.push(`
      <div class="rb-collage n${Math.min(6, fotos.length)}">${fotos.slice(0, 6).map((f, i) => `<div class="kachel-${i}" style="--i:${i}"><img src="${f.url}" alt=""></div>`).join('')}</div><div class="rb-verlauf"></div>
      <div class="rb-inhalt unten">
        <div class="rb-klein" data-rein style="--v:0">${esc(t('Eure Momente'))}</div>
        <h2 data-rein style="--v:1">${esc(fotos.find((f) => f.text)?.text || t('Erinnerungen, die bleiben'))}</h2>
      </div>`);
  }
  if (rangliste.length >= 2) {
    const max = rangliste[0].n2;
    folien.push(`
      <div class="rb-aura kuehl"><i></i><i></i><i></i></div>
      <div class="rb-inhalt">
        <div class="rb-klein" data-rein style="--v:0">${esc(t('Die Familie'))}</div>
        <h2 data-rein style="--v:1">${esc(t('Stempel-Champion: {name}', { name: rangliste[0].n }))} 👑</h2>
        <div class="rb-balken">${rangliste.map((l, i) => `
          <div data-rein style="--v:${2 + i}"><span class="av" style="background:${esc(l.c || '#888')}">${esc(l.n.slice(0, 1).toUpperCase())}</span><span class="nm">${esc(l.n)}</span>
            <span class="spur"><i style="--w:${l.n2 / max};background:${esc(l.c || '#888')}"></i></span><b>${l.n2}</b></div>`).join('')}</div>
      </div>`);
  }
  if (lieblings.length) {
    const [k1, n1] = lieblings[0];
    folien.push(`
      <div class="rb-aura" style="--f:${kat(k1).farbe}"><i></i><i></i><i></i></div>
      <div class="rb-inhalt mitte">
        <div class="rb-klein" data-rein style="--v:0">${esc(t('Am liebsten'))}</div>
        <div class="rb-kat" data-rein style="--v:1;background:${kat(k1).farbe}">${icon(k1, 64, 1.6)}</div>
        <h2 data-rein style="--v:2">${esc(kat(k1).name)} × ${n1}</h2>
        <p data-rein style="--v:3">${esc(lieblings.slice(1, 4).map(([k, n]) => `${kat(k).name} × ${n}`).join(' · '))}</p>
      </div>`);
  }
  const rest = v.orte.length - gestempelt.length;
  folien.push(`
    <div class="rb-aura"><i></i><i></i><i></i></div>
    <div class="rb-inhalt mitte">
      <div class="rb-scheibe" data-rein style="--v:0">${icon('haken', 54, 2.4)}</div>
      <h1 data-rein style="--v:1"><span class="verlauf-text">${esc(rest ? t('Weiter so!') : t('Was für eine Reise!'))}</span></h1>
      <p data-rein style="--v:2">${esc(rest ? t('Noch {n} Orte warten auf ihren Stempel.', { n: rest }) : t('Alle {n} Orte gestempelt.', { n: v.orte.length }))}</p>
      <div class="rb-knoepfe" data-rein style="--v:3">
        <button class="knopf glas" data-rb="nochmal">${icon('sync', 19)} ${esc(t('Nochmal'))}</button>
        ${navigator.share ? `<button class="knopf akzent" data-rb="teilen">${icon('teilen', 19)} ${esc(t('Teilen'))}</button>` : ''}
      </div>
    </div>`);

  const el = document.createElement('div');
  el.className = 'rb';
  el.innerHTML = `
    <div class="rb-balken-oben">${folien.map(() => '<i><b></b></i>').join('')}</div>
    <button class="rb-zu" aria-label="${esc(t('Schließen'))}">${icon('x', 20, 2.4)}</button>
    <div class="rb-buehne"></div>`;
  document.body.appendChild(el);
  const buehne = el.querySelector('.rb-buehne');
  const balken = [...el.querySelectorAll('.rb-balken-oben b')];
  let i = 0, start = 0, pausiert = false, pauseAb = 0, raf = 0;
  sound.musikStart && sound.musikStart();

  function zeigen(n) {
    i = Math.max(0, Math.min(folien.length - 1, n));
    buehne.innerHTML = `<div class="rb-folie">${folien[i]}</div>`;
    balken.forEach((b, j) => { b.style.transform = `scaleX(${j < i ? 1 : 0})`; });
    start = performance.now();
    // Zahlen hochzählen
    buehne.querySelectorAll('[data-zaehlen]').forEach((z) => {
      const ziel = +z.dataset.zaehlen, t0 = performance.now() + 500;
      const schritt = (jetzt) => {
        const p = Math.min(1, Math.max(0, (jetzt - t0) / 1400));
        z.textContent = Math.round(ziel * (1 - (1 - p) ** 3)).toLocaleString(loc());
        if (p < 1 && z.isConnected) requestAnimationFrame(schritt);
      };
      requestAnimationFrame(schritt);
    });
    sound.tick();
  }
  function lauf(jetzt) {
    if (!el.isConnected) return;
    if (!pausiert) {
      const p = (jetzt - start) / DAUER;
      if (balken[i]) balken[i].style.transform = `scaleX(${Math.min(1, p)})`;
      if (p >= 1) { if (i < folien.length - 1) zeigen(i + 1); else { pausiert = true; } }
    }
    raf = requestAnimationFrame(lauf);
  }
  function schliessen() {
    cancelAnimationFrame(raf);
    sound.musikStop && sound.musikStop();
    el.classList.add('weg');
    setTimeout(() => el.remove(), 400);
  }

  let druck = null, startY = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    druck = performance.now(); startY = e.clientY;
    pausiert = true; pauseAb = performance.now();
  });
  el.addEventListener('pointerup', (e) => {
    if (druck == null) return;
    const lang = performance.now() - druck > 280;
    start += performance.now() - pauseAb;
    pausiert = false;
    druck = null;
    if (e.clientY - startY > 90) return schliessen();
    if (lang) return;
    if (e.clientX < innerWidth / 3) zeigen(i - 1); else if (i < folien.length - 1) zeigen(i + 1);
  });
  el.querySelector('.rb-zu').onclick = schliessen;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rb]');
    if (!b) return;
    if (b.dataset.rb === 'nochmal') { pausiert = false; zeigen(0); }
    if (b.dataset.rb === 'teilen') {
      const text = t('Unser Rückblick „{reise}“: {n} Orte gestempelt, {km} unterwegs. 🗺️ Stempelpass', { reise: v.meta.n, n: gestempelt.length, km: meter(km) });
      try { await navigator.share({ title: v.meta.n, text }); } catch {}
    }
  });
  zeigen(0);
  raf = requestAnimationFrame(lauf);
}
