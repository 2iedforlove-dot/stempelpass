// Konfetti, Tintenspritzer und Glitzer als Partikel auf einer Canvas – mit einfacher Physik
// (Schwerkraft, Luftwiderstand, Drehung, Flattern beim Fallen). Läuft nur, solange Teilchen unterwegs sind.

let leinwand = null, ctx = null, teile = [], laeuft = false, zuletzt = 0, dpr = 1;
const ruhig = () => matchMedia('(prefers-reduced-motion: reduce)').matches && document.documentElement.dataset.bewegung !== 'an';

function bereit() {
  if (leinwand) return;
  leinwand = document.createElement('canvas');
  leinwand.className = 'partikel';
  leinwand.setAttribute('aria-hidden', 'true');
  document.body.appendChild(leinwand);
  ctx = leinwand.getContext('2d');
  const groesse = () => {
    dpr = Math.min(2, devicePixelRatio || 1);
    leinwand.width = Math.round(innerWidth * dpr);
    leinwand.height = Math.round(innerHeight * dpr);
  };
  addEventListener('resize', groesse);
  groesse();
}

function stern(c, r) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const w = (i * Math.PI) / 4, l = i % 2 ? r * 0.38 : r;
    c.lineTo(Math.cos(w) * l, Math.sin(w) * l);
  }
  c.closePath();
  c.fill();
}

function schritt(jetzt) {
  const dt = Math.min(2.5, (jetzt - zuletzt) / 16.67 || 1);
  zuletzt = jetzt;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const hoehe = innerHeight + 40;
  teile = teile.filter((p) => p.leben < p.max && p.y < hoehe);
  for (const p of teile) {
    p.leben += dt;
    p.vx *= p.luft ** dt; p.vy *= p.luft ** dt;
    p.vy += p.g * dt;
    p.x += (p.vx + Math.sin(p.phase + p.leben * 0.09) * p.flattern) * dt;
    p.y += p.vy * dt;
    p.dreh += p.vdreh * dt;
    const rest = p.max - p.leben;
    ctx.globalAlpha = Math.max(0, Math.min(1, rest / 22, p.leben / 3));
    ctx.fillStyle = p.farbe;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.dreh);
    if (p.form === 'rechteck') {
      // Kippen um die eigene Achse wie echtes Papier
      ctx.scale(1, Math.cos(p.phase + p.leben * 0.16));
      ctx.fillRect(-p.b / 2, -p.h / 2, p.b, p.h);
    } else if (p.form === 'stern') {
      const s = 0.75 + 0.25 * Math.sin(p.leben * 0.3 + p.phase);
      ctx.scale(s, s);
      stern(ctx, p.b);
    } else {
      ctx.beginPath(); ctx.arc(0, 0, p.b / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (teile.length) requestAnimationFrame(schritt);
  else { laeuft = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}

function los() {
  if (laeuft) return;
  laeuft = true;
  zuletzt = performance.now();
  requestAnimationFrame(schritt);
}

const FARBEN = ['#0a84ff', '#bf5af2', '#ff2d78', '#ff9f0a', '#30d158', '#ffd60a', '#ffffff'];

// Großes Konfetti: Kanonen von links und rechts unten, oder ein Ausbruch an einer Stelle
export function konfetti({ farben = FARBEN, menge = 140, x = null, y = null, sterne = false } = {}) {
  if (ruhig()) return;
  bereit();
  const quellen = x != null ? [[x, y, -Math.PI / 2, Math.PI * 0.9]] : [[-10, innerHeight * 0.72, -Math.PI * 0.32, 0.5], [innerWidth + 10, innerHeight * 0.72, -Math.PI * 0.68, 0.5]];
  for (let i = 0; i < menge; i++) {
    const [qx, qy, richtung, streuung] = quellen[i % quellen.length];
    const w = richtung + (Math.random() - 0.5) * streuung * 2;
    const v = (x != null ? 7 : 13) + Math.random() * (x != null ? 9 : 11);
    const form = sterne && Math.random() < 0.3 ? 'stern' : Math.random() < 0.75 ? 'rechteck' : 'kreis';
    teile.push({
      x: qx, y: qy, vx: Math.cos(w) * v, vy: Math.sin(w) * v,
      g: 0.24 + Math.random() * 0.08, luft: 0.975 + Math.random() * 0.01, flattern: 0.4 + Math.random() * 0.9,
      phase: Math.random() * 6.28, dreh: Math.random() * 6.28, vdreh: (Math.random() - 0.5) * 0.25,
      b: form === 'stern' ? 5 + Math.random() * 3 : 6 + Math.random() * 5, h: 9 + Math.random() * 7,
      farbe: farben[Math.floor(Math.random() * farben.length)], form, leben: 0, max: 170 + Math.random() * 90,
    });
  }
  los();
}

// Kleiner Tintenspritzer, wenn der Stempel aufs Papier trifft
export function spritzer(x, y, farbe, menge = 16) {
  if (ruhig()) return;
  bereit();
  for (let i = 0; i < menge; i++) {
    const w = Math.random() * Math.PI * 2, v = 2.5 + Math.random() * 4.5;
    teile.push({
      x, y, vx: Math.cos(w) * v, vy: Math.sin(w) * v - 1.5, g: 0.18, luft: 0.9, flattern: 0,
      phase: 0, dreh: 0, vdreh: 0, b: 3 + Math.random() * 4, h: 0, farbe: i % 4 ? farbe : '#ffffff', form: 'kreis', leben: 0, max: 30 + Math.random() * 18,
    });
  }
  los();
}

// Glitzersterne um einen Punkt (seltene Stempel)
export function glitzer(x, y, farben, menge = 26) {
  if (ruhig()) return;
  bereit();
  for (let i = 0; i < menge; i++) {
    const w = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 5;
    teile.push({
      x, y, vx: Math.cos(w) * v, vy: Math.sin(w) * v - 2, g: 0.06, luft: 0.94, flattern: 0.2,
      phase: Math.random() * 6.28, dreh: Math.random() * 6.28, vdreh: (Math.random() - 0.5) * 0.1,
      b: 4 + Math.random() * 5, h: 0, farbe: farben[i % farben.length], form: 'stern', leben: 0, max: 50 + Math.random() * 40,
    });
  }
  los();
}
