// Baut das App-Symbol mit Stempi als HTML-Seite. Aufruf: node werkzeug/symbol.mjs <ausgabe.html> 512 [maskable]
// Danach mit Edge fotografieren (eigenes --user-data-dir, sonst übernimmt ein laufendes Edge den Aufruf):
//   msedge --headless=new --hide-scrollbars --user-data-dir=<tmp> --window-size=512,512 --screenshot=<png> file:///<html>
// und mit PIL auf 192 px (icon-192) und 180 px (apple-touch-icon) verkleinern.
import { writeFileSync, readFileSync } from 'node:fs';
import { stempi } from '../maskottchen.js';

const [ziel, groesse = '512', maskable] = process.argv.slice(2);
const g = +groesse;
// Nur die statischen Stempi-Regeln aus app.css (ohne Animationen)
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8')
  .split('\n').filter((z) => /^\.(stempi|st-)/.test(z) && !/animation|@keyframes|data-stimmung|blinzelt/.test(z)).join('\n');
const figur = stempi({ stimmung: 'freude', groesse: Math.round(g * (maskable ? 0.5 : 0.62)) });
writeFileSync(ziel, `<!doctype html><meta charset="utf-8"><style>
:root { --akzent: #ff5d1f; --sanft: ease; --schrift: system-ui; --text-2: #fff; }
html, body { margin: 0; width: ${g}px; height: ${g}px; overflow: hidden; background: #0a0a0c; }
.hg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, #3a1a10 0%, #1a1012 45%, #0a0a0c 80%); }
.ring { position: absolute; left: 50%; top: 50%; width: ${Math.round(g * (maskable ? 0.66 : 0.82))}px; height: ${Math.round(g * (maskable ? 0.66 : 0.82))}px; transform: translate(-50%, -50%) rotate(-12deg); border-radius: 50%;
  border: ${Math.round(g * 0.018)}px dashed rgba(255, 120, 60, .55); box-shadow: inset 0 0 0 ${Math.round(g * 0.03)}px rgba(255, 255, 255, .08); }
.figur { position: absolute; left: 50%; top: 53%; transform: translate(-50%, -50%); filter: drop-shadow(0 ${Math.round(g * 0.02)}px ${Math.round(g * 0.03)}px rgba(0, 0, 0, .35)); }
${css}
.stempi { --st: #ff5d1f; --st-d: #b8390c; }
.st-weiss { fill: #fff; }
.st-augen { opacity: 0; } .st-augen-froh { opacity: 1; } .st-mund-laecheln { opacity: 0; } .st-mund-offen { opacity: 1; }
.st-schatten { opacity: .25; }
.st-funken, .st-zzz { display: none; }
</style><div class="hg"></div><div class="ring"></div><div class="figur">${figur}</div>`);
console.log('geschrieben', ziel);
