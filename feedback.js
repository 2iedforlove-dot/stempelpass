// Sounds (per Web Audio erzeugt, keine Dateien) und Vibration.
// iPhone kennt navigator.vibrate nicht; ab iOS 18 gibt das Umschalten eines Switch-Eingabefelds einen Haptik-Tick.

let ctx = null;
let an = true;
try { an = localStorage.getItem('sp.ton') !== '0'; } catch {}

export function tonAn() { return an; }
export function tonSetzen(wert) { an = wert; try { localStorage.setItem('sp.ton', wert ? '1' : '0'); } catch {} }

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Audio muss durch eine Berührung freigeschaltet werden (iOS)
addEventListener('pointerdown', () => { if (an) audio(); }, { once: true, capture: true });

function ton({ f = 440, f2 = null, typ = 'sine', start = 0, dauer = 0.15, laut = 0.2, anschlag = 0.005 }) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = typ;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dauer);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(laut, t + anschlag);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dauer);
  o.connect(g).connect(a.destination);
  o.start(t); o.stop(t + dauer + 0.02);
}

function rauschen({ start = 0, dauer = 0.04, laut = 0.15, frequenz = 2500, q = 0.8, typ = 'bandpass' }) {
  const a = audio(); if (!a) return;
  const t = a.currentTime + start;
  const n = Math.floor(a.sampleRate * dauer);
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = a.createBufferSource(); s.buffer = buf;
  const fl = a.createBiquadFilter(); fl.type = typ; fl.frequency.value = frequenz; fl.Q.value = q;
  const g = a.createGain(); g.gain.value = laut;
  s.connect(fl).connect(g).connect(a.destination);
  s.start(t);
}

export const sound = {
  // leiser Klick für Knöpfe und Umschalter
  tick() { if (!an) return; rauschen({ dauer: 0.018, laut: 0.12, frequenz: 4200, q: 1.2 }); ton({ f: 1800, dauer: 0.03, laut: 0.03 }); },
  // dumpfer Stempel-Aufprall mit Papier-Klatsch, danach ein heller Dreiklang
  stempel() {
    if (!an) return;
    ton({ f: 170, f2: 52, dauer: 0.22, laut: 0.55, typ: 'sine' });
    rauschen({ dauer: 0.07, laut: 0.35, frequenz: 1200, q: 0.6 });
    rauschen({ start: 0.01, dauer: 0.12, laut: 0.12, frequenz: 400, typ: 'lowpass' });
    [659.3, 830.6, 987.8].forEach((f, i) => ton({ f, typ: 'triangle', start: 0.16 + i * 0.075, dauer: 0.5, laut: 0.11, anschlag: 0.01 }));
    ton({ f: 1975.5, typ: 'sine', start: 0.4, dauer: 0.6, laut: 0.04 });
  },
  // Meilenstein: aufsteigendes Arpeggio mit Glitzern
  erfolg() {
    if (!an) return;
    [523.3, 659.3, 784, 1046.5, 1318.5].forEach((f, i) => ton({ f, typ: 'triangle', start: i * 0.09, dauer: 0.7, laut: 0.12, anschlag: 0.01 }));
    for (let i = 0; i < 6; i++) ton({ f: 2000 + Math.random() * 1800, start: 0.35 + i * 0.06, dauer: 0.25, laut: 0.025 });
  },
  // sanftes "Plopp" beim Hinzufügen
  plopp() { if (!an) return; ton({ f: 380, f2: 760, dauer: 0.12, laut: 0.22, typ: 'sine' }); ton({ f: 1140, start: 0.07, dauer: 0.18, laut: 0.06, typ: 'triangle' }); },
  // abfallend beim Löschen / Stempel entfernen
  weg() { if (!an) return; ton({ f: 520, f2: 140, dauer: 0.2, laut: 0.18, typ: 'sine' }); rauschen({ dauer: 0.12, laut: 0.06, frequenz: 900, q: 0.5 }); },
  // zwei Töne aufwärts für Rückgängig
  zurueck() { if (!an) return; ton({ f: 523.3, dauer: 0.12, laut: 0.12, typ: 'triangle' }); ton({ f: 784, start: 0.08, dauer: 0.18, laut: 0.12, typ: 'triangle' }); },
  // weiches Öffnen von Dialogen
  auf() { if (!an) return; rauschen({ dauer: 0.16, laut: 0.05, frequenz: 900, q: 0.4 }); ton({ f: 300, f2: 420, dauer: 0.12, laut: 0.04 }); },
  // Kamera-Auslöser fürs Tagebuch
  foto() { if (!an) return; rauschen({ dauer: 0.03, laut: 0.25, frequenz: 3000, q: 0.7 }); rauschen({ start: 0.07, dauer: 0.05, laut: 0.18, frequenz: 1800, q: 0.7 }); },
  // Leise Akkord-Flächen für den Rückblick (Cmaj7 – Am7 – Fmaj7 – G6), mit Glöckchen
  musikStart() {
    if (!an || musik) return;
    const a = audio(); if (!a) return;
    const master = a.createGain();
    master.gain.setValueAtTime(0.0001, a.currentTime);
    master.gain.exponentialRampToValueAtTime(0.11, a.currentTime + 2.5);
    const filter = a.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1600;
    filter.connect(master).connect(a.destination);
    const akkorde = [[130.8, 329.6, 392, 493.9], [110, 261.6, 329.6, 392], [87.3, 261.6, 329.6, 440], [98, 246.9, 293.7, 329.6]];
    let n = 0;
    const spielen = () => {
      const t0 = a.currentTime + 0.05;
      akkorde[n % 4].forEach((f, i) => {
        const o = a.createOscillator(); o.type = i ? 'triangle' : 'sine'; o.frequency.value = f;
        const g = a.createGain();
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(i ? 0.16 : 0.3, t0 + 1.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.9);
        o.connect(g).connect(filter); o.start(t0); o.stop(t0 + 5);
      });
      akkorde[n % 4].slice(1).forEach((f, i) => {
        const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = f * 2;
        const g = a.createGain(); const s = t0 + 0.6 + i * 0.45 + Math.random() * 0.2;
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.05, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 1.6);
        o.connect(g).connect(master); o.start(s); o.stop(s + 1.7);
      });
      n++;
    };
    spielen();
    musik = { master, timer: setInterval(spielen, 4000) };
  },
  musikStop() {
    if (!musik || !ctx) return;
    const m = musik; musik = null;
    clearInterval(m.timer);
    m.master.gain.cancelScheduledValues(ctx.currentTime);
    m.master.gain.setValueAtTime(m.master.gain.value, ctx.currentTime);
    m.master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    setTimeout(() => m.master.disconnect(), 1200);
  },
};
let musik = null;

// ---------- Vibration ----------
let schalter = null;
function iosTick() {
  if (!schalter) {
    const l = document.createElement('label');
    l.style.cssText = 'position:fixed;left:-100px;top:0;opacity:0;pointer-events:none';
    l.setAttribute('aria-hidden', 'true');
    l.innerHTML = '<input type="checkbox" switch tabindex="-1">';
    document.body.appendChild(l);
    schalter = l;
  }
  schalter.click();
}

export function haptik(art = 'leicht') {
  const muster = { leicht: [8], mittel: [18], stempel: [12, 40, 30], erfolg: [15, 60, 15, 60, 40], weg: [25] }[art] || [10];
  if (navigator.vibrate) { navigator.vibrate(muster); return; }
  // iPhone: so viele Ticks wie das Muster Impulse hat
  muster.filter((_, i) => i % 2 === 0).forEach((_, i) => setTimeout(iosTick, i * 70));
}
