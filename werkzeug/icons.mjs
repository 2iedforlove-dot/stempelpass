// Erzeugt die App-Icons als PNG (ohne Zusatzpakete): Graphit, orangener Kreis, dunkler Stempelring, weißer Haken
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const TINTE = hex('#141416'), SAFRAN = hex('#ff5d1f'), CHILI = hex('#3d3d43'), PAPIER = hex('#ffffff');

function abstandStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function farbe(x, y) {
  // x, y in 0..1
  const cx = 0.5, cy = 0.5;
  const r = Math.hypot(x - cx, y - cy);
  let c = TINTE;
  if (r < 0.27) c = SAFRAN;
  // Stempelring, leicht versetzt und mit Lücken wie ein echter Abdruck
  const rx = x - 0.515, ry = y - 0.49;
  const rr = Math.hypot(rx, ry);
  const winkel = Math.atan2(ry, rx);
  const luecke = Math.sin(winkel * 9 + 1.3) > 0.93;
  if (Math.abs(rr - 0.345) < 0.022 && !luecke) c = CHILI;
  // Haken
  const d = Math.min(abstandStrecke(x, y, 0.385, 0.505, 0.47, 0.59), abstandStrecke(x, y, 0.47, 0.59, 0.635, 0.405));
  if (d < 0.038) c = PAPIER;
  return c;
}

function png(groesse) {
  const ss = 4;
  const zeilen = Buffer.alloc((groesse * 3 + 1) * groesse);
  for (let y = 0; y < groesse; y++) {
    zeilen[y * (groesse * 3 + 1)] = 0;
    for (let x = 0; x < groesse; x++) {
      let s = [0, 0, 0];
      for (let i = 0; i < ss; i++) for (let j = 0; j < ss; j++) {
        const c = farbe((x + (i + 0.5) / ss) / groesse, (y + (j + 0.5) / ss) / groesse);
        s[0] += c[0]; s[1] += c[1]; s[2] += c[2];
      }
      const o = y * (groesse * 3 + 1) + 1 + x * 3;
      zeilen[o] = s[0] / (ss * ss); zeilen[o + 1] = s[1] / (ss * ss); zeilen[o + 2] = s[2] / (ss * ss);
    }
  }
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcTab[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (typ, daten) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(daten.length);
    const td = Buffer.concat([Buffer.from(typ), daten]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(groesse, 0); ihdr.writeUInt32BE(groesse, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(zeilen, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const ziel = new URL('../icons/', import.meta.url);
mkdirSync(ziel, { recursive: true });
writeFileSync(new URL('icon-192.png', ziel), png(192));
writeFileSync(new URL('icon-512.png', ziel), png(512));
writeFileSync(new URL('apple-touch-icon.png', ziel), png(180));
console.log('Icons geschrieben');
