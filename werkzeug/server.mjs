// Kleiner statischer Server mit Range-Unterstützung (für die .pmtiles-Karte) zum lokalen Testen
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = fileURLToPath(new URL('..', import.meta.url));
const PORT = +process.env.PORT || 8642;
const TYPEN = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.pbf': 'application/x-protobuf', '.pmtiles': 'application/octet-stream', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    let pfad = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pfad.endsWith('/')) pfad += 'index.html';
    const datei = normalize(join(WURZEL, pfad));
    if (!datei.startsWith(WURZEL)) { res.writeHead(403).end(); return; }
    const s = await stat(datei);
    const typ = TYPEN[extname(datei)] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? +range[1] : s.size - +range[2];
      const ende = range[1] && range[2] ? Math.min(+range[2], s.size - 1) : s.size - 1;
      res.writeHead(206, { 'content-type': typ, 'content-range': `bytes ${start}-${ende}/${s.size}`, 'content-length': ende - start + 1, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
      createReadStream(datei, { start, end: ende }).pipe(res);
    } else {
      res.writeHead(200, { 'content-type': typ, 'content-length': s.size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
      createReadStream(datei).pipe(res);
    }
  } catch { res.writeHead(404).end('nicht gefunden'); }
}).listen(PORT, () => console.log('Stempelpass läuft auf http://localhost:' + PORT));
