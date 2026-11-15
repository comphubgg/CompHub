import { promises as nodeFs } from 'fs';
import path from 'path';
import { gzipSync, gunzipSync } from 'zlib';
import { DATEN_ORT } from '@/lib/datenOrt';
import { holeBereich, type CupEintrag } from '@/lib/epicCups';

/*
 * Die ganze Bestenliste eines Spieltags aus dem Vorrat (app/api/cup-leaderboard baut ihn gepackt auf die Platte). Wer alle Plaetze braucht, fragt so nicht hundert Seiten bei Epic ab:
 * die Matches eines Cash Cups brauchten dafuer 37 Sekunden (7.11.2026). Auf einem Server ohne Vorrat kommt null, dann bleibt es beim Weg ueber Epic.
 *
 * Seit 15.11.2026 liegen Lesen, Bauen und Schreiben hier (vorher in app/api/cup-leaderboard): der Live-Abruf eines laufenden Spieltags (lib/liveFenster)
 * schreibt denselben Vorrat nach jedem Abruf, damit die Seite den neuen Stand sofort aus einer Antwort bekommt.
 */
const MERKER = new Map<string, { bis: number; entries: CupEintrag[] }>();

export const GANZ_ORDNER = path.join(DATEN_ORT, 'vorrat', 'bestenliste-ganz');
export const ganzDatei = (w: string) => path.join(GANZ_ORDNER, `${w.replace(/[^\w.-]/g, '_')}.json`);

export async function bestenlisteVorrat(windowId: string): Promise<CupEintrag[] | null> {
  const da = MERKER.get(windowId);
  if (da && da.bis > Date.now()) return da.entries;
  try {
    const datei = `${ganzDatei(windowId)}.gz`;
    const d = JSON.parse(gunzipSync(await nodeFs.readFile(datei)).toString('utf8')) as { entries?: CupEintrag[] };
    if (!d.entries?.length) return null;
    if (MERKER.size >= 3) MERKER.delete(MERKER.keys().next().value as string);
    MERKER.set(windowId, { bis: Date.now() + 60_000, entries: d.entries });
    return d.entries;
  } catch { return null; }
}

/** Nach einem neuen Vorrat: der Merker oben darf den alten nicht noch eine Minute weitergeben. */
export function vergissVorrat(windowId: string) { MERKER.delete(windowId); }

export interface GanzVorrat { entries: unknown[]; updated?: string; totalPages?: number; gebaut?: number }

export async function ganzLesen(w: string): Promise<GanzVorrat | null> {
  try {
    // Gepackt (seit 30.10.2026 - jeder Spieltag der 31 Tage liegt vorgebaut), aeltere Dateien noch ungepackt.
    const gz = `${ganzDatei(w)}.gz`;
    const p = await nodeFs.access(gz).then(() => gz, () => ganzDatei(w));
    const roh = await nodeFs.readFile(p);
    const d = JSON.parse((p === gz ? gunzipSync(roh) : roh).toString('utf8')) as GanzVorrat;
    d.gebaut ??= (await nodeFs.stat(p)).mtimeMs;
    return d;
  } catch { return null; }
}

/** Den Vorrat schreiben - erst daneben, dann umbenennen: wer gleichzeitig liest, bekommt nie eine halbe Datei. */
export async function ganzSchreiben(w: string, d: GanzVorrat): Promise<void> {
  await nodeFs.mkdir(GANZ_ORDNER, { recursive: true });
  const ziel = `${ganzDatei(w)}.gz`;
  const tmp = `${ziel}.${process.pid}.${Date.now()}.tmp`;
  await nodeFs.writeFile(tmp, gzipSync(JSON.stringify({ ...d, gebaut: d.gebaut ?? Date.now() })));
  await nodeFs.rename(tmp, ziel);
  await nodeFs.rm(ganzDatei(w), { force: true });
  vergissVorrat(w);
}

/*
 * Direkt nach einem grossen Spieltag fuehrt Epics Liste dasselbe Team mehrfach: alte Zeilen bleiben stehen, bis Epic aufgeraeumt hat (Day 2 EU am 4.11.2026,
 * acht Minuten nach dem Ende: 10.000 Zeilen, 6.804 Spieler, z. B. Platz 6 mit 402 und Platz 193 mit 324 Punkten). Es zaehlt die Zeile mit den meisten Punkten.
 */
export function ohneDoppelte<T>(liste: T[]): T[] {
  const zeile = (x: T) => x as unknown as { points?: number; players?: Array<{ id?: string }> };
  const da = new Set<string>();
  return [...liste].sort((a, b) => (zeile(b).points ?? 0) - (zeile(a).points ?? 0)).filter((x) => {
    const k = (zeile(x).players ?? []).map((p) => p.id ?? '').sort().join('+');
    if (!k) return true;
    if (da.has(k)) return false;
    da.add(k);
    return true;
  });
}

/** Laufende Bauten je Spieltag - geteilt zwischen der Schnittstelle und dem Live-Abruf, damit nie zwei gleichzeitig schreiben. */
const g = globalThis as unknown as { __ganzImBau?: Map<string, Promise<void>> };
export const imBau: Map<string, Promise<void>> = (g.__ganzImBau ??= new Map());

/** Die ganze Liste neu holen - laeuft schon ein Bau fuer diesen Spieltag, wird auf ihn gewartet statt einen zweiten zu starten. */
export function ganzBauen(event: string, w: string): Promise<void> {
  const laufend = imBau.get(w);
  if (laufend) return laufend;
  const bau = (async () => {
    try {
      let alle: unknown[] = []; let gesamt = 0; let updated: string | undefined;
      for (let von = 0; von < 100; von += 25) {
        const d = await holeBereich(event, w, von, 25) as { entries?: unknown[]; totalPages?: number; updated?: string };
        alle = alle.concat(d.entries ?? []);
        gesamt = d.totalPages ?? gesamt; updated ??= d.updated;
        if (!(d.entries ?? []).length || von + 25 >= (d.totalPages ?? 0)) break;
      }
      if (!alle.length) return;
      alle = ohneDoppelte(alle);
      await ganzSchreiben(w, { entries: alle, totalPages: gesamt, updated: updated ?? new Date().toISOString(), gebaut: Date.now() });
    } catch { /* naechster Aufruf versucht es wieder */ } finally { imBau.delete(w); }
  })();
  imBau.set(w, bau);
  return bau;
}
