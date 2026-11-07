/*
 * Kartenbild und Weltausschnitt der kleinen Reload-Inseln (Betreiber, 7.11.2026: "da fehlt die Map ... dann loese es halt").
 *
 * Das Bild kommt aus den Spieldateien (lib/reloadKarten, abgelegt unter kartenbilder/). Welcher Bildpunkt welcher Spielposition entspricht, steht dort
 * nicht - die Quelle dafuer war am 7.11.2026 nicht erreichbar. Deshalb ist der Ausschnitt an echten Replays geeicht: alle Positionen am Boden aus zwei
 * Matches der FNCS Solos Reload (Nitemare Island) gegen die Landflaeche des Bildes; bei x0 -91.000, y0 -87.000, Spanne 174.000 liegen 98 % der Punkte
 * auf Land, und die Haeufungen fallen auf die Orte der Karte (auch die kleine Insel unten rechts). Gleiche Ausrichtung wie die grosse Karte.
 *
 * Der Inselcode steht in der Playlist des Replays: "Playlist_ShowdownTournament_RE_SourSpawnSolo_PBM" -> SourSpawn.
 */

export interface InselKarte { bild: string; x0: number; y0: number; spanne: number }

const INSELN: Record<string, InselKarte> = {
  SourSpawn: { bild: '/api/karten-bild?id=reload-nitemare-island&datei=1', x0: -91_000, y0: -87_000, spanne: 174_000 },
};

export function inselCode(playlist: string | null | undefined): string | null {
  const m = /_RE_([A-Za-z]+?)(?:Solo|Duo|Duos|Trio|Trios|Squad|Squads)?(?:_|$)/.exec(playlist ?? '');
  return m ? m[1] : null;
}

export function inselKarte(playlist: string | null | undefined): InselKarte | null {
  const c = inselCode(playlist);
  return c ? INSELN[c] ?? null : null;
}
