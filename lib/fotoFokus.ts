import fokus from './fotoFokus.json';

/*
 * Wo im Foto das Gesicht sitzt (scripts/foto-fokus.py): fuer "object-position", damit ein Foto, das in einen Rahmen mit anderem Seitenverhaeltnis kommt,
 * nicht vom Kopf weg ausgeschnitten wird (Betreiber, 14.10.2026: "man erkennt die Person nicht, der Kopf ist abgeschnitten").
 * Fotos ohne Eintrag (hochgeladene, neue) bekommen die Voreinstellung: Mitte, oberes Drittel.
 */
const TAFEL = fokus as unknown as Record<string, [number, number]>;

/** Der Wert fuer object-position zu einer Foto-Adresse ("/spielerbilder-klein/vico.webp"). */
export function fokusVon(url?: string | null): string {
  const datei = (url ?? '').split('?')[0].split('/').pop() ?? '';
  let f: [number, number] | undefined;
  try { f = TAFEL[decodeURIComponent(datei)]; } catch { f = TAFEL[datei]; }
  return f ? `${f[0]}% ${f[1]}%` : '50% 28%';
}
