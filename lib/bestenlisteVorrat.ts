import { promises as nodeFs } from 'fs';
import path from 'path';
import { gunzipSync } from 'zlib';
import { DATEN_ORT } from '@/lib/datenOrt';
import type { CupEintrag } from '@/lib/epicCups';

/*
 * Die ganze Bestenliste eines Spieltags aus dem Vorrat (app/api/cup-leaderboard baut ihn gepackt auf die Platte). Wer alle Plaetze braucht, fragt so nicht hundert Seiten bei Epic ab:
 * die Matches eines Cash Cups brauchten dafuer 37 Sekunden (7.11.2026). Auf einem Server ohne Vorrat kommt null, dann bleibt es beim Weg ueber Epic.
 */
const MERKER = new Map<string, { bis: number; entries: CupEintrag[] }>();

export async function bestenlisteVorrat(windowId: string): Promise<CupEintrag[] | null> {
  const da = MERKER.get(windowId);
  if (da && da.bis > Date.now()) return da.entries;
  try {
    const datei = path.join(DATEN_ORT, 'vorrat', 'bestenliste-ganz', `${windowId.replace(/[^\w.-]/g, '_')}.json.gz`);
    const d = JSON.parse(gunzipSync(await nodeFs.readFile(datei)).toString('utf8')) as { entries?: CupEintrag[] };
    if (!d.entries?.length) return null;
    if (MERKER.size >= 3) MERKER.delete(MERKER.keys().next().value as string);
    MERKER.set(windowId, { bis: Date.now() + 60_000, entries: d.entries });
    return d.entries;
  } catch { return null; }
}
