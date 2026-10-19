import { liesJson, schreibJson } from '@/lib/ablage';

/*
 * Welche Zonen-Uebersichten fuer VIPs freigegeben sind.
 *
 * Der Betreiber (19.10.2026): von jedem Final-Cup gibt es das Zonen-Bild, und
 * "dann kann ich das jeweils freischalten fuer die VIPs" - Zonen und Games
 * seien fuer sie spannend. Freigegeben wird je Cup (Ereignis, Epics eventId);
 * ohne Haken sieht nur der Admin die Uebersicht, die einzelnen Games und die
 * Replay-Ansicht bleiben fuer alle offen.
 */

export const ZONEN_FREI_DATEI = 'replay-zonen-frei.json';

export async function liesZonenFrei(): Promise<string[]> {
  const j = await liesJson<string[]>(ZONEN_FREI_DATEI, []);
  return Array.isArray(j) ? j.filter((x) => typeof x === 'string') : [];
}

export async function setzeZonenFrei(eventId: string, frei: boolean): Promise<string[]> {
  const da = new Set(await liesZonenFrei());
  if (frei) da.add(eventId); else da.delete(eventId);
  const liste = [...da].sort();
  await schreibJson(ZONEN_FREI_DATEI, liste);
  return liste;
}
