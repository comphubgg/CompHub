/*
 * Ein grosses Vorschaubild aus public/ in der Groesse, in der es gezeigt wird - ueber Nexts Bildumwandlung (/_next/image, WebP, auf dem Server
 * gemerkt).
 *
 * Gemessen am 16.11.2026 (Betreiber: "die Seiten laden zu langsam"): das Band hinter /fncs lud /cups/fncs-global-championship-2026-hd.jpg mit 614 KB
 * fuer eine Kachel von 288 x 160 Punkten (umgewandelt auf 640 Breite: 37 KB), /tournament-maps die Kapitelbilder mit bis zu 650 KB (CH7S4.jpg, 65 KB).
 * Nur fuer eigene Dateien ohne Abfrageteil - fremde Adressen, Schnittstellen (/api/...) und Bilder mit "?v=" bleiben, wie sie sind.
 * Erlaubte Breiten (Nexts Voreinstellung): 384, 640, 750, 828, 1080, 1200, 1920.
 */
export function kleinBild(src: string, breite: 384 | 640 | 750 | 828 | 1080 | 1200 | 1920 = 640): string {
  if (!src.startsWith('/') || src.startsWith('//') || src.startsWith('/api/') || src.startsWith('/_next/') || src.includes('?')) return src;
  if (!/\.(jpe?g|png|webp)$/i.test(src)) return src;
  return `/_next/image?url=${encodeURIComponent(src)}&w=${breite}&q=75`;
}
