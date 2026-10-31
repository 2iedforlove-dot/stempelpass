// Reisetagebuch: Fotos verkleinern, in Stücke teilen (die Sync-Server nehmen nur ~64 KB pro Nachricht)
// und die Stücke lokal in IndexedDB statt im kleinen localStorage aufbewahren.

export const STUECK = 26000; // Zeichen Base64 pro Stück -> verschlüsselt etwa 36 KB pro Nachricht

// Foto auf max. 800 px und JPEG verkleinern, Ergebnis als Base64 (ohne "data:"-Präfix)
export async function fotoVerkleinern(datei, max = 800) {
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(img, 0, 0, w, h);
    let q = 0.74, daten;
    // Notfalls Qualität senken, damit ein Foto höchstens ~6 Stücke braucht
    do { daten = cv.toDataURL('image/jpeg', q).split(',')[1]; q -= 0.08; } while (daten.length > STUECK * 6 && q > 0.35);
    return { daten, w, h };
  } finally { URL.revokeObjectURL(url); }
}

// Ein Foto für Tagebuch und Fotobuch vorbereiten: 800 px zum Teilen, 2000 px nur auf diesem Gerät (fürs Drucken),
// dazu die Aufnahmezeit, damit nachträglich hinzugefügte Fotos am richtigen Tag landen.
export async function fotoVorbereiten(datei) {
  const at = await aufnahmeZeit(datei);
  const url = URL.createObjectURL(datei);
  try {
    const img = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = url; });
    const zeichnen = (max) => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * s); cv.height = Math.round(img.naturalHeight * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      return cv;
    };
    const klein = zeichnen(800);
    let q = 0.74, daten;
    do { daten = klein.toDataURL('image/jpeg', q).split(',')[1]; q -= 0.08; } while (daten.length > STUECK * 6 && q > 0.35);
    const gross = zeichnen(2000);
    const hd = await new Promise((ok) => gross.toBlob(ok, 'image/jpeg', 0.86));
    gross.width = gross.height = klein.width = klein.height = 0; // Speicher am Handy sofort freigeben
    return { daten, w: Math.round(img.naturalWidth), h: Math.round(img.naturalHeight), hd, at };
  } finally { URL.revokeObjectURL(url); }
}

// Aufnahmezeit aus den EXIF-Daten (DateTimeOriginal), sonst das Dateidatum, wenn es nicht gerade eben ist
export async function aufnahmeZeit(datei) {
  try {
    const d = new DataView(await datei.slice(0, 196608).arrayBuffer());
    if (d.getUint16(0) === 0xffd8) {
      for (let p = 2; p + 4 < d.byteLength;) {
        const marke = d.getUint16(p), laenge = d.getUint16(p + 2);
        if (marke === 0xffe1 && d.getUint32(p + 4) === 0x45786966) {
          const z = exifZeit(d, p + 10);
          if (z) return z;
        }
        if ((marke & 0xff00) !== 0xff00 || marke === 0xffda) break;
        p += 2 + laenge;
      }
    }
  } catch {}
  return datei.lastModified && Date.now() - datei.lastModified > 10 * 60000 ? datei.lastModified : null;
}

function exifZeit(d, tiff) {
  const le = d.getUint16(tiff) === 0x4949;
  const u16 = (o) => d.getUint16(tiff + o, le), u32 = (o) => d.getUint32(tiff + o, le);
  const eintrag = (ifd, tag) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) { const o = ifd + 2 + i * 12; if (u16(o) === tag) return o; }
    return -1;
  };
  const text = (o) => { const p = u32(o + 8); let s = ''; for (let i = 0; i < 19; i++) s += String.fromCharCode(d.getUint8(tiff + p + i)); return s; };
  const ifd0 = u32(4);
  const exif = eintrag(ifd0, 0x8769);
  let o = exif >= 0 ? eintrag(u32(exif + 8), 0x9003) : -1;
  if (o < 0) o = eintrag(ifd0, 0x0132);
  if (o < 0) return null;
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(text(o));
  if (!m) return null;
  const z = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return z > 946684800000 && z < Date.now() + 86400000 ? z : null;
}

export function inStuecke(b64) {
  const teile = [];
  for (let i = 0; i < b64.length; i += STUECK) teile.push(b64.slice(i, i + STUECK));
  return teile;
}

// ---------- IndexedDB ----------
let dbVersprechen = null;
function db() {
  if (!dbVersprechen) {
    dbVersprechen = new Promise((ok, fehler) => {
      const r = indexedDB.open('stempelpass', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('stuecke');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fehler(r.error);
    });
  }
  return dbVersprechen;
}
export async function idbSetzen(schluessel, wert) {
  const d = await db();
  return new Promise((ok, fehler) => { const tx = d.transaction('stuecke', 'readwrite'); tx.objectStore('stuecke').put(wert, schluessel); tx.oncomplete = ok; tx.onerror = () => fehler(tx.error); });
}
export async function idbHolen(schluessel) {
  const d = await db();
  return new Promise((ok, fehler) => { const r = d.transaction('stuecke').objectStore('stuecke').get(schluessel); r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error); });
}
export async function idbLoeschenPraefix(praefix) {
  const d = await db();
  return new Promise((ok) => {
    const tx = d.transaction('stuecke', 'readwrite');
    tx.objectStore('stuecke').delete(IDBKeyRange.bound(praefix, praefix + '￿'));
    tx.oncomplete = ok; tx.onerror = ok;
  });
}

// Fertig zusammengesetzte Fotos als Objekt-URL zwischenspeichern
const urls = new Map();
export function fotoUrl(records, fotoId, anzahl) {
  if (urls.has(fotoId)) return urls.get(fotoId);
  const teile = [];
  for (let i = 0; i < anzahl; i++) {
    const r = records[`fb:${fotoId}:${i}`];
    if (!r || !r.v || !r.v.d) return null;
    teile.push(r.v.d);
  }
  const bin = atob(teile.join(''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  urls.set(fotoId, url);
  return url;
}

// Große Fassung (nur auf dem Gerät, das das Foto gemacht hat) für Vollbild und PDF
const hdUrls = new Map();
export const hdSetzen = (tripId, fotoId, blob) => idbSetzen(`${tripId}|hd:${fotoId}`, blob);
export const hdLoeschen = (tripId, fotoId) => { hdUrls.delete(fotoId); return idbLoeschenPraefix(`${tripId}|hd:${fotoId}`); };
export async function hdUrl(tripId, fotoId) {
  if (hdUrls.has(fotoId)) return hdUrls.get(fotoId);
  let url = null;
  try { const b = await idbHolen(`${tripId}|hd:${fotoId}`); if (b instanceof Blob) url = URL.createObjectURL(b); } catch {}
  hdUrls.set(fotoId, url);
  return url;
}
