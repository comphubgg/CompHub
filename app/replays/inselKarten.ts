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

import { inselAusPlaylist } from '@/lib/inseln';

/** bild deckt x0/y0/spanne ab; gezeigt wird der Ausschnitt - die Insel mit wenig Wasser drumherum (Betreiber, 7.11.2026: zuschneiden, die kleine Insel unten rechts bleibt drin). */
export interface InselKarte { bild: string; x0: number; y0: number; spanne: number; ausschnitt: { x0: number; y0: number; spanne: number } }

export const RELOAD_INSELN: Record<string, InselKarte> = {
  // Land im Bild (512 px): x 108-480, y 63-463 - als Quadrat mit Rand: Bildpunkte 82-506 / 51-475.
  // Nachgeeicht 16.11.2026 an 5.381 Truhen aus 4 Matches (FNCS Solos Reload Heats EU): Spanne 174.000 bestaetigt (bei 166.000 liegen Truhen im Meer,
  // bei 184.000 neben den Haeusern der Stadt unten rechts), die Mitte lag 1.000 daneben - auf Land jetzt 91,9 % statt 84,6 %.
  // Nachgeprueft 16.11.2026 an allen 16 Games der FNCS Solos Reload Heats EU (21.101 Truhen, 197 Truhen der Startinsel vor dem Bus, 30.000 Spielerorte):
  // -92.000/-88.000 lag 11 px links und 13 px ueber der Karte (Bild 2.048 px) - vier Pruefungen unabhaengig gleich: Truhen auf Gebaeuden (-9/-16 px),
  // Startinsel (-15/-14 px, 6 % ihrer Truhen lagen im Meer), Kueste (-11/-12 px), Spieler in Fluss/See/Meer (-11/-12 px). Mit -90.900/-86.800 bleibt
  // je Pruefung hoechstens 4,5 px (Mittel 3 px), die Startinsel-Truhen liegen zu 100 % an Land. Masstab 174.000 bestaetigt (bester Wert bei allen Pruefungen).
  // Der Ausschnitt ist mit der Insel um +1.100/+1.200 mitgerueckt.
  SourSpawn: { bild: '/api/karten-bild?id=reload-nitemare-island&datei=1', x0: -90_900, y0: -86_800, spanne: 174_000, ausschnitt: { x0: -62_000, y0: -68_500, spanne: 144_100 } },
};

export function inselCode(playlist: string | null | undefined): string | null {
  const m = /_RE_([A-Za-z]+?)(?:Solo|Duo|Duos|Trio|Trios|Squad|Squads)?(?:_|$)/.exec(playlist ?? '');
  if (m) return m[1];
  // Auch ohne "_RE_" (Reload ZB Cash Cup: "Playlist_ShowdownTournament_PiperBootNoBuildDuos_PBM") - dieselbe Regel wie lib/inseln.
  const insel = inselAusPlaylist(playlist);
  return insel.art === 'reload' ? insel.schluessel : null;
}

export function inselKarte(playlist: string | null | undefined): InselKarte | null {
  const c = inselCode(playlist);
  return c ? RELOAD_INSELN[c] ?? null : null;
}
