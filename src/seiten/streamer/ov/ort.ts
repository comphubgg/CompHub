/* Zahlen- und Datumsformat (main: app/lib/ort) - englisch, Tag vor Monat. Dazu die Marke (lib/marke) und die Adresse der echten Seite. */
export const ortJetzt = () => 'en-GB';
export const ortVon = (_s: string) => 'en-GB';

/** Die echte Seite: dort liegen die Overlay-Dateien (/overlay/*.html), die OBS aus dem Netz laedt - der Hub reicht sie nicht durch. */
export const OV = 'https://www.thecomphub.com';

export const MARKE = {
  name: 'CompHub',
  seite: 'comphub.gg',
  logo: '/logos/CompHub-Logo.png',
  x: 'CompHub_gg',
  discord: 'https://discord.gg/8jQ3tf37sQ',
  logoFrei: '/logos/CompHub-Logo-frei.png',
  hinweis(): string { return `from ${this.seite}`; },
} as const;

/**
 * Die Adresse fuer eine Vorschau im Hub: dieselbe Overlay-Datei, aber ueber den eigenen Proxy (vite.config.ts, /overlay -> thecomphub.com).
 * Gleiche Herkunft heisst: das Overlay meldet seine Groesse (look.js), nimmt Einstellungen per postMessage an und holt seine Daten ueber /api.
 * Die Adresse fuer OBS bleibt https://www.thecomphub.com/overlay/... - nur das iframe im Hub nimmt diesen Weg.
 */
export function vorOrt(src: string): string;
export function vorOrt(src: string | null): string | null;
export function vorOrt(src: string | null): string | null {
  if (!src || !src.startsWith(`${OV}/overlay/`)) return src;
  const u = new URL(src);
  u.searchParams.delete('server');
  return `${u.pathname}${u.search}`;
}
