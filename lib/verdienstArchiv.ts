import { liesJson } from '@/lib/ablage';

/*
 * Die kompakte Verdienst-Akte - jeder bezahlte Spieltag seit 2019 je Konto.
 *
 * Der Betreiber: "zu jedem Spieler, der in meinem Archiv ist, sollen dessen
 * Earnings drin sein" - seit Chapter 1, mit Herkunft je Cup. Die alten
 * Bestenlisten von Epic liegen nur auf seinem Rechner; was hier ankommt,
 * ist das einmal daraus Gerechnete (scripts/verdienst-archiv.mjs):
 *
 *   konten[epicId] = [[fenster, region, datum, platz, punkte, betrag, mitspieler?], ...]
 *
 * Betrag je Person in Dollar, nach Epics Auszahlungstabelle des Fensters.
 */
export type ArchivEintrag = [string, string, string, number, number, number, string[]?];

interface Archiv { stand?: string; fenster?: number; konten: Record<string, ArchivEintrag[]> }

let merker: { archiv: Archiv; bis: number } | null = null;

export async function liesVerdienstArchiv(): Promise<Archiv> {
  if (merker && Date.now() < merker.bis) return merker.archiv;
  const roh = await liesJson<Archiv | null>('verdienst-archiv.json', null);
  const archiv = roh && roh.konten ? roh : { konten: {} };
  merker = { archiv, bis: Date.now() + 10 * 60_000 };
  return archiv;
}

/** Die Eintraege eines Kontos. */
export async function archivEintraege(epicId: string): Promise<ArchivEintrag[]> {
  return (await liesVerdienstArchiv()).konten[epicId] ?? [];
}

/** Das Kalenderjahr eines Eintrags. */
export function eintragJahr(e: ArchivEintrag): number {
  return Number(e[2].slice(0, 4)) || 0;
}
