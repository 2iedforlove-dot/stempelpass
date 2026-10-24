// Linien-Icons (24×24, Strich), als SVG-Pfade. Werden im HTML und auf der Karte (Canvas/Path2D) benutzt.

export const PFADE = {
  // Kategorien
  hotel: 'M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9',
  tempel: 'M12 2 9 6h6z M6 6h12 M7 6v4 M17 6v4 M4 10h16 M6 10v10 M18 10v10 M3 20h18 M10 20v-5h4v5',
  markt: 'M4 3h16l2 6H2z M2 9a3.3 3.3 0 0 0 6.7 0 3.3 3.3 0 0 0 6.6 0A3.3 3.3 0 0 0 22 9 M4 12v9h16v-9 M10 21v-5h4v5',
  park: 'M12 22v-6 M12 2 6 10h3l-4 6h14l-4-6h3z',
  aussicht: 'M12 2v6 M4.9 9.9l1.4 1.4 M2 16h2 M20 16h2 M17.7 11.3l1.4-1.4 M22 20H2 M8 16a4 4 0 0 1 8 0 M9 5l3-3 3 3',
  essen: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2 M7 2v20 M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7',
  shopping: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  wasser: 'M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4z M21 14 10 2 3 14z M10 2v16',
  kultur: 'M3 22h18 M6 18v-7 M10 18v-7 M14 18v-7 M18 18v-7 M12 2l8 5H4z',
  erholung: 'M12 20c-4.5 0-8-3-8-8 3.2 0 6.2 2 8 5 1.8-3 4.8-5 8-5 0 5-3.5 8-8 8z M12 17c-2-3-2-8 0-12 2 4 2 9 0 12z',
  bar: 'M8 22h8 M12 11v11 M19 3l-7 8-7-8z',
  viertel: 'M9.1 11.9l8-8.1a2.85 2.85 0 1 1 4 4l-8 8.1 M7.1 14.9c-1.7 0-3 1.4-3 3 0 1.4-2.5 1.6-2 2.1 1.1 1.1 2.5 2 4 2 2.2 0 4-1.8 4-4a3 3 0 0 0-3-3.1z',
  ausflug: 'M8 6v6 M15 6v6 M2 12h19.6 M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2s-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3 M9 18h5 M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M19 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  sonst: 'M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  // Bedienung
  plus: 'M12 5v14 M5 12h14',
  leute: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z M19 8v6 M22 11h-6',
  wolke: 'M12 13v8 M8 17l4 4 4-4 M20.4 15.6A5 5 0 0 0 18 6h-1.3A8 8 0 1 0 4 14.3',
  wolkeOk: 'M20.4 15.6A5 5 0 0 0 18 6h-1.3A8 8 0 1 0 4 14.3 M8 17l3 3 5-6',
  ortung: 'M12 2v3 M12 19v3 M2 12h3 M19 12h3 M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0z M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z',
  haken: 'M20 6 9 17l-5-5',
  kreisHaken: 'M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14l-3-3',
  kreis: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z',
  raster: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  navi: 'M3 11l19-9-9 19-2-8z',
  zurueck: 'M15 18l-6-6 6-6',
  runter: 'M6 9l6 6 6-6',
  mehr: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  muell: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  stift: 'M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  karte: 'M9 3 3 6v15l6-3 6 3 6-3V3l-6 3z M9 3v15 M15 6v15',
  x: 'M18 6 6 18 M6 6l12 12',
  ton: 'M11 5 6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7 M19 5a10 10 0 0 1 0 14',
  tonAus: 'M11 5 6 9H2v6h4l5 4z M22 9l-6 6 M16 9l6 6',
  teilen: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M16 6l-4-4-4 4 M12 2v13',
  kopie: 'M8 8h12v12H8z M16 8V4H4v12h4',
  code: 'M3 7V5a2 2 0 0 1 2-2h2 M17 3h2a2 2 0 0 1 2 2v2 M21 17v2a2 2 0 0 1-2 2h-2 M7 21H5a2 2 0 0 1-2-2v-2 M7 12h10',
  funken: 'M12 3l1.9 5.8L20 10l-6.1 1.2L12 17l-1.9-5.8L4 10l6.1-1.2z M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z',
  pokal: 'M6 9H4.5a2.5 2.5 0 0 1 0-5H6 M18 9h1.5a2.5 2.5 0 0 0 0-5H18 M4 22h16 M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8 M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8 M18 2H6v7a6 6 0 0 0 12 0z',
  person: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  sync: 'M21 12a9 9 0 0 1-15 6.7L3 16 M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M3 21v-5h5',
};

export function icon(name, groesse = 22, strich = 1.9) {
  return `<svg class="ic" viewBox="0 0 24 24" width="${groesse}" height="${groesse}" fill="none" stroke="currentColor" stroke-width="${strich}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PFADE[name] || PFADE.sonst}"/></svg>`;
}
