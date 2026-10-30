// Stempi – das Maskottchen von Stempelpass: ein kleiner Gummistempel mit Gesicht.
// Aufgebaut aus einzelnen SVG-Ebenen (Körper, Augen, Pupillen, Münder, Arme), die getrennt animiert werden –
// wie bei den Rive-Figuren von Duolingo, nur ohne Bibliothek: CSS-Keyframes für Stimmungen, JS nur fürs
// Blinzeln, den Blick zum Finger und die Reaktion beim Antippen.
// Stimmungen (data-stimmung): ruhe, freude, jubel, staunen, winken, nicken, stempeln, schlaeft.

const AUGE = (x) => `
  <g class="st-auge"><ellipse cx="${x}" cy="60" rx="6.2" ry="7.2" class="st-weiss"/>
    <g class="st-pupille"><circle cx="${x}" cy="61" r="3.7" class="st-dunkel"/><circle cx="${x + 1.4}" cy="59.4" r="1.25" fill="#fff"/></g></g>`;
const FROH = (x) => `<path class="st-froh" d="M${x - 6} 62 Q${x} 54 ${x + 6} 62"/>`;
const ZU = (x) => `<path class="st-zu" d="M${x - 6} 61 Q${x} 65 ${x + 6} 61"/>`;
const FUNKE = (x, y, s) => `<path class="st-funke" style="--s:${s}" d="M${x} ${y - 6} Q${x + 1} ${y - 1} ${x + 6} ${y} Q${x + 1} ${y + 1} ${x} ${y + 6} Q${x - 1} ${y + 1} ${x - 6} ${y} Q${x - 1} ${y - 1} ${x} ${y - 6}Z"/>`;

export function stempi({ stimmung = 'ruhe', groesse = 96, kopfhoerer = false, klasse = '', titel = 'Stempi' } = {}) {
  return `<span class="stempi ${klasse}" data-stimmung="${stimmung}" style="--g:${groesse}px" role="img" aria-label="${titel}">
  <svg viewBox="0 0 100 112" aria-hidden="true">
    <ellipse class="st-schatten" cx="50" cy="106" rx="27" ry="4.2"/>
    <g class="st-figur">
      <g class="st-koerper">
        <rect class="st-platte" x="17" y="84" width="66" height="13" rx="5"/>
        <rect class="st-tinte" x="20" y="94" width="60" height="4" rx="2"/>
        <rect class="st-haut-dunkel" x="43" y="28" width="14" height="16" rx="4"/>
        <rect class="st-haut" x="23" y="40" width="54" height="48" rx="19"/>
        <path class="st-schatten-innen" d="M23 66 Q23 88 42 88 L58 88 Q77 88 77 66 Q66 80 50 80 Q34 80 23 66Z"/>
        <path class="st-glanz" d="M31 50 Q34 44 42 43" />
        <g class="st-knauf"><circle class="st-haut" cx="50" cy="22" r="13"/><ellipse cx="45" cy="17" rx="4.2" ry="3" fill="#fff" opacity=".45"/></g>
        ${kopfhoerer ? '<g class="st-hoerer"><path d="M33 26 Q50 -2 67 26" /><rect x="29" y="20" width="8" height="13" rx="3.5"/><rect x="63" y="20" width="8" height="13" rx="3.5"/></g>' : ''}
        <g class="st-gesicht">
          <g class="st-augen">${AUGE(39)}${AUGE(61)}</g>
          <g class="st-augen-froh">${FROH(39)}${FROH(61)}</g>
          <g class="st-augen-zu">${ZU(39)}${ZU(61)}</g>
          <ellipse class="st-wange" cx="31.5" cy="70" rx="4.6" ry="2.8"/><ellipse class="st-wange" cx="68.5" cy="70" rx="4.6" ry="2.8"/>
          <path class="st-mund st-mund-laecheln" d="M44 71 Q50 76.5 56 71"/>
          <g class="st-mund st-mund-offen"><path class="st-dunkel" d="M42.5 70 Q50 70.5 57.5 70 Q56.5 80 50 80 Q43.5 80 42.5 70Z"/><ellipse cx="50" cy="77" rx="4" ry="2.2" fill="#ff7a8a"/></g>
          <ellipse class="st-mund st-mund-o st-dunkel" cx="50" cy="73.5" rx="3.4" ry="4.2"/>
        </g>
        <path class="st-arm st-arm-l" d="M25 66 Q15 68 12.5 59"/>
        <path class="st-arm st-arm-r" d="M75 66 Q85 68 87.5 59"/>
      </g>
    </g>
    <g class="st-funken">${FUNKE(13, 30, 0)}${FUNKE(88, 22, 1)}${FUNKE(92, 52, 2)}${FUNKE(8, 58, 3)}</g>
    <g class="st-zzz"><text x="70" y="22">z</text><text x="78" y="12">z</text></g>
  </svg></span>`;
}

// Stimmung kurz wechseln und danach zur vorherigen zurück
export function stimmung(el, art, dauer = 1400) {
  if (!el) return;
  const s = el.classList.contains('stempi') ? el : el.querySelector('.stempi');
  if (!s) return;
  if (!s.dataset.grund) s.dataset.grund = s.dataset.stimmung;
  clearTimeout(s._t);
  s.dataset.stimmung = 'ruhe';
  void s.offsetWidth; // Animation neu starten, auch wenn dieselbe Stimmung nochmal kommt
  s.dataset.stimmung = art;
  if (dauer) s._t = setTimeout(() => { s.dataset.stimmung = s.dataset.grund; }, dauer);
}

// ---------- Leben: Blinzeln, Umherschauen, zum Finger schauen, Antippen ----------
let gestartet = false;
export function stempiLeben({ beimAntippen } = {}) {
  if (gestartet) return;
  gestartet = true;
  const sichtbar = () => [...document.querySelectorAll('.stempi')].filter((s) => s.offsetParent !== null);

  // Blinzeln in unregelmäßigen Abständen, manchmal doppelt
  const blinzeln = () => {
    if (!document.hidden) {
      for (const s of sichtbar()) {
        if (Math.random() < 0.55) continue;
        s.classList.add('blinzelt');
        setTimeout(() => s.classList.remove('blinzelt'), 150);
        if (Math.random() < 0.2) setTimeout(() => { s.classList.add('blinzelt'); setTimeout(() => s.classList.remove('blinzelt'), 130); }, 300);
      }
    }
    setTimeout(blinzeln, 1600 + Math.random() * 2600);
  };
  setTimeout(blinzeln, 1200);

  // Blick folgt dem Finger bzw. der Maus; ohne Bewegung schaut Stempi ab und zu umher
  let ziel = null, rahmen = 0, zuletzt = 0;
  const blicken = () => {
    rahmen = 0;
    for (const s of sichtbar()) {
      const r = s.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      let dx = 0, dy = 0;
      if (ziel) {
        const mx = r.left + r.width / 2, my = r.top + r.height * 0.55;
        const w = Math.atan2(ziel.y - my, ziel.x - mx), d = Math.min(1, Math.hypot(ziel.x - mx, ziel.y - my) / 160);
        dx = Math.cos(w) * 2.4 * d; dy = Math.sin(w) * 2 * d;
      }
      s.style.setProperty('--px', dx.toFixed(2));
      s.style.setProperty('--py', dy.toFixed(2));
    }
  };
  addEventListener('pointermove', (e) => {
    ziel = { x: e.clientX, y: e.clientY }; zuletzt = Date.now();
    if (!rahmen) rahmen = requestAnimationFrame(blicken);
  }, { passive: true });
  addEventListener('pointerdown', (e) => {
    ziel = { x: e.clientX, y: e.clientY }; zuletzt = Date.now();
    if (!rahmen) rahmen = requestAnimationFrame(blicken);
  }, { passive: true, capture: true });
  setInterval(() => {
    if (document.hidden || Date.now() - zuletzt < 4000) return;
    ziel = Math.random() < 0.35 ? null : { x: Math.random() * innerWidth, y: Math.random() * innerHeight * 0.8 };
    blicken();
  }, 3200);

  // Antippen: kleine Freudenreaktion
  document.addEventListener('click', (e) => {
    const s = e.target.closest('.stempi');
    if (!s || s.closest('button, a, [data-aktion]')) return;
    const art = ['jubel', 'staunen', 'nicken', 'winken', 'freude'][Math.floor(Math.random() * 5)];
    stimmung(s, art, 1300);
    if (beimAntippen) beimAntippen(art, s);
  });
}
