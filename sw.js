// App-Hülle offline verfügbar machen. Die große Kartendatei lädt die App selbst in den Cache "sp-karte".
const VERSION = 'sp-v8'; // bei jeder Änderung hochzählen, sonst bleiben installierte Handys auf altem Stand
const HUELLE = [
  './', 'index.html', 'app.css', 'app.js', 'sync.js', 'vorlagen.js', 'icons.js', 'feedback.js', 'i18n.js', 'onboarding.js', 'manifest.webmanifest', 'bilder/nachweise.json',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/pmtiles.js', 'vendor/basemaps.js', 'vendor/nostr.bundle.js', 'vendor/qrcode.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'karte/sprites/dark.json', 'karte/sprites/dark.png', 'karte/sprites/dark@2x.json', 'karte/sprites/dark@2x.png',
  'karte/sprites/light.json', 'karte/sprites/light.png', 'karte/sprites/light@2x.json', 'karte/sprites/light@2x.png',
];
// Fotos der Bangkok-Orte (offline verfügbar)
HUELLE.push('bilder/orte/ancient-city.jpg', 'bilder/orte/ayutthaya.jpg', 'bilder/orte/bang-krachao.jpg', 'bilder/orte/benjakitti.jpg', 'bilder/orte/chao-phraya.jpg', 'bilder/orte/chatuchak.jpg', 'bilder/orte/emsphere.jpg', 'bilder/orte/floating-market.jpg', 'bilder/orte/food-tour.jpg', 'bilder/orte/golden-mount.jpg', 'bilder/orte/grand-palace.jpg', 'bilder/orte/iconsiam.jpg', 'bilder/orte/lumpini.jpg', 'bilder/orte/mahanakhon.jpg', 'bilder/orte/massage.jpg', 'bilder/orte/rooftop.jpg', 'bilder/orte/talat-noi.jpg', 'bilder/orte/titel-bangkok.jpg', 'bilder/orte/wat-arun.jpg', 'bilder/orte/wat-pho.jpg');
for (const f of ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']) {
  for (const r of ['0-255', '256-511', '3584-3839', '8192-8447']) HUELLE.push(`karte/fonts/${f}/${r}.pbf`);
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(HUELLE.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('sp-v') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.pmtiles')) return; // Bereichsanfragen direkt ans Netz
  // Erst Cache, im Hintergrund aktualisieren
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const treffer = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === 'navigate' ? await c.match('index.html') : null);
    const netz = fetch(e.request).then((r) => { if (r.ok && r.type === 'basic') c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (treffer) { e.waitUntil(netz); return treffer; }
    return (await netz) || new Response('Offline', { status: 503 });
  }));
});
