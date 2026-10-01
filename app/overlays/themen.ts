/*
 * Die Themen der Overlays - ein Aussehen je Turnierreihe.
 *
 * Der Betreiber (1.10.2026): wie fuer die Globals soll es fuer die anderen
 * Reihen ein eigenes Aussehen geben - Performance Cups, Division Cups usw.
 * Die Farben stehen in public/overlay/themen.css (Standings, Custom) und in
 * public/overlay/vorlagen.js (Banner); diese Liste muss zu beiden passen.
 */

export type Thema = '' | 'globals' | 'performance' | 'division' | 'cash' | 'reload';

export const THEMEN: Array<{ wert: Thema; titel: string; akzent: string | null }> = [
  { wert: '', titel: 'Standard', akzent: null },
  { wert: 'globals', titel: 'FNCS Globals', akzent: '#f5c542' },
  { wert: 'performance', titel: 'Performance Cup', akzent: '#2ad1cc' },
  { wert: 'division', titel: 'Division Cup', akzent: '#7fd8c0' },
  { wert: 'cash', titel: 'Cash Cup', akzent: '#e879f9' },
  { wert: 'reload', titel: 'Reload', akzent: '#e0b455' },
];

/** Der Akzent eines Themas - ohne Thema bleibt, was schon eingestellt ist. */
export function themaAkzent(t: Thema): string | null {
  return THEMEN.find((x) => x.wert === t)?.akzent ?? null;
}

/**
 * Welches Thema zu einem Cup passt - aus Kennung und Titel des Spieltags.
 *
 * Wer einen Cup waehlt, bekommt das passende Aussehen vorgeschlagen; er kann
 * es danach umstellen. Unbekannte Reihen bleiben beim Standard.
 */
export function themaFuerCup(windowId: string, titel = ''): Thema {
  const s = `${windowId} ${titel}`;
  if (/MannekenPis|Global Championship|FNCS Global/i.test(s)) return 'globals';
  if (/PerformanceEvaluation|Performance Evaluation|Performance Cup/i.test(s)) return 'performance';
  if (/Divisional|Division/i.test(s)) return 'division';
  if (/CashCup|Cash Cup/i.test(s)) return 'cash';
  if (/Reload|Escargo/i.test(s)) return 'reload';
  return '';
}
