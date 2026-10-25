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
