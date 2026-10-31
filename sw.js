// App-Hülle offline verfügbar machen. Die große Kartendatei lädt die App selbst in den Cache "sp-karte".
const VERSION = 'sp-v15'; // bei jeder Änderung hochzählen, sonst bleiben installierte Handys auf altem Stand
const HUELLE = [
  './', 'index.html', 'app.css', 'app.js', 'sync.js', 'vorlagen.js', 'icons.js', 'feedback.js', 'i18n.js', 'onboarding.js', 'planer.js', 'tagebuch.js', 'hinweise.js', 'rueckblick.js', 'route.js', 'ziele.js', 'audioguide.js', 'maskottchen.js', 'partikel.js', 'belohnung.js', 'vorlieben.js', 'plaene.js', 'weltkarte.js', 'manifest.webmanifest', 'bilder/nachweise.json',
  'vendor/maplibre-gl.js', 'vendor/maplibre-gl.css', 'vendor/pmtiles.js', 'vendor/basemaps.js', 'vendor/nostr.bundle.js', 'vendor/qrcode.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable.png', 'icons/apple-touch-icon.png',
  'karte/sprites/dark.json', 'karte/sprites/dark.png', 'karte/sprites/dark@2x.json', 'karte/sprites/dark@2x.png',
  'karte/sprites/light.json', 'karte/sprites/light.png', 'karte/sprites/light@2x.json', 'karte/sprites/light@2x.png',
];
// Fotos der Bangkok-Orte in drei Größen (offline verfügbar)
HUELLE.push('bilder/orte/ancient-city.webp', 'bilder/orte/ayutthaya.webp', 'bilder/orte/bang-krachao.webp', 'bilder/orte/benjakitti.webp', 'bilder/orte/chao-phraya.webp', 'bilder/orte/chatuchak.webp', 'bilder/orte/emsphere.webp', 'bilder/orte/floating-market.webp', 'bilder/orte/food-tour.webp', 'bilder/orte/golden-mount.webp', 'bilder/orte/grand-palace.webp', 'bilder/orte/iconsiam.webp', 'bilder/orte/lumpini.webp', 'bilder/orte/mahanakhon.webp', 'bilder/orte/massage.webp', 'bilder/orte/rooftop.webp', 'bilder/orte/talat-noi.webp', 'bilder/orte/titel-bangkok.webp', 'bilder/orte/wat-arun.webp', 'bilder/orte/wat-pho.webp', 'bilder/klein/ancient-city.webp', 'bilder/klein/ayutthaya.webp', 'bilder/klein/bang-krachao.webp', 'bilder/klein/benjakitti.webp', 'bilder/klein/chao-phraya.webp', 'bilder/klein/chatuchak.webp', 'bilder/klein/emsphere.webp', 'bilder/klein/floating-market.webp', 'bilder/klein/food-tour.webp', 'bilder/klein/golden-mount.webp', 'bilder/klein/grand-palace.webp', 'bilder/klein/iconsiam.webp', 'bilder/klein/lumpini.webp', 'bilder/klein/mahanakhon.webp', 'bilder/klein/massage.webp', 'bilder/klein/rooftop.webp', 'bilder/klein/talat-noi.webp', 'bilder/klein/titel-bangkok.webp', 'bilder/klein/wat-arun.webp', 'bilder/klein/wat-pho.webp', 'bilder/hg/ancient-city.webp', 'bilder/hg/ayutthaya.webp', 'bilder/hg/bang-krachao.webp', 'bilder/hg/benjakitti.webp', 'bilder/hg/chao-phraya.webp', 'bilder/hg/chatuchak.webp', 'bilder/hg/emsphere.webp', 'bilder/hg/floating-market.webp', 'bilder/hg/food-tour.webp', 'bilder/hg/golden-mount.webp', 'bilder/hg/grand-palace.webp', 'bilder/hg/iconsiam.webp', 'bilder/hg/lumpini.webp', 'bilder/hg/mahanakhon.webp', 'bilder/hg/massage.webp', 'bilder/hg/rooftop.webp', 'bilder/hg/talat-noi.webp', 'bilder/hg/titel-bangkok.webp', 'bilder/hg/wat-arun.webp', 'bilder/hg/wat-pho.webp');
for (const f of ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic']) {
  for (const r of ['0-255', '256-511', '512-767', '3584-3839', '7680-7935', '8192-8447']) HUELLE.push(`karte/fonts/${f}/${r}.pbf`);
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(HUELLE.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('sp-v') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Fotos von Wikimedia (Ziele, Sehenswürdigkeiten): einmal angesehen, dann auch offline da
  if (e.request.method === 'GET' && /(^|\.)wikimedia\.org$/.test(url.hostname) && e.request.destination === 'image') {
    e.respondWith(caches.open('sp-bilder').then(async (c) => {
      const treffer = await c.match(e.request);
      if (treffer) return treffer;
      try { const r = await fetch(e.request); if (r.ok || r.type === 'opaque') c.put(e.request, r.clone()); return r; } catch { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('.pmtiles')) return; // Bereichsanfragen direkt ans Netz
  // Schrift-Bereiche, die es nicht gibt (z. B. japanische Zeichen): leere Glyphen statt Fehler,
  // sonst verwirft die Karte die ganze Kachel
  if (url.pathname.includes('/karte/fonts/')) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const treffer = await c.match(e.request, { ignoreSearch: true });
      if (treffer) return treffer;
      try { const r = await fetch(e.request); if (r.ok) { c.put(e.request, r.clone()); return r; } } catch {}
      return new Response(new ArrayBuffer(0), { headers: { 'content-type': 'application/x-protobuf' } });
    }));
    return;
  }
  // Erst Cache, im Hintergrund aktualisieren
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const treffer = await c.match(e.request, { ignoreSearch: true }) || (e.request.mode === 'navigate' ? await c.match('index.html') : null);
    const netz = fetch(e.request).then((r) => { if (r.ok && r.type === 'basic') c.put(e.request, r.clone()); return r; }).catch(() => null);
    if (treffer) { e.waitUntil(netz); return treffer; }
    return (await netz) || new Response('Offline', { status: 503 });
  }));
});
