import { inselAusPlaylist, saisonVon } from '@/lib/inseln';
import { saisonKarte } from '@/lib/bildAdressen';
import { RELOAD_INSELN } from '@/app/replays/inselKarten';

/*
 * Auf welcher Insel ein Zonen-Bild gezeichnet wird und welchen Weltausschnitt das Kartenbild abdeckt (Betreiber, 16.11.2026: bei Reload-Cups
 * "die richtige Reload-Insel", nicht die grosse Karte).
 *
 * Die Insel kommt aus Epics Playlist des Replays, wie ueberall auf der Seite (lib/inseln, inselAusPlaylist):
 *   Playlist_ShowdownTournament_RE_SourSpawnSolo_PBM -> Reload, SourSpawn (Nitemare Island)
 *   Playlist_ShowdownTournament_FN_Trios             -> Battle Royale
 *
 * Geeicht, nicht geraten: Weltkoordinate -> Bild wird an echten Replays gemessen - die Truhen eines Matches muessen auf Land und auf den
 * Gebaeuden liegen.
 *
 *   Battle Royale S43 (Delilah_Terrain, /bilder/karte-s43.png, fast gleich Epics Karte von heute): 2.633 Truhen aus Performance Evaluation
 *   Event2Round2 EU, Game 1. Mit -135.000..+135.000 (bisher) lagen 94,9 % auf Land und die Haeufungen sichtbar neben den Gebaeuden; mit
 *   x0 -142.800 / y0 -146.000 / Spanne 301.500 sind es 97,8 % - und Epics eigene Ortspunkte (fortnite-api.com ueber /api/fortnite-map)
 *   fallen damit genau auf die Ortsnamen der Karte mit Namen, mit der alten Spanne daneben.
 *   Battle Royale S42 (Hera_V2_Terrain, /bilder/karte-s42.png): 3.585 Truhen aus Performance Evaluation Event9Round2 EU. Mit der alten Spanne
 *   lagen viele im Wasser rings um die Kueste, mit x0 -142.300 / y0 -150.000 / Spanne 300.500 auf Land.
 *   Reload: app/replays/inselKarten (RELOAD_INSELN).
 */

export interface Rahmen { x0: number; y0: number; spanne: number }
export interface ZonenKarte {
  art: 'reload' | 'br';
  /** Adresse des Kartenbilds (gleiche Herkunft, damit sich die Leinwand als PNG speichern laesst) - null: diese Insel ist noch nicht geeicht. */
  bild: string | null;
  /** Welcher Weltausschnitt das ganze Bild abdeckt. */
  rahmen: Rahmen;
  /** Der Ausschnitt, der gezeigt wird (die Insel mit wenig Wasser), falls fest eingestellt - sonst wird er am Bild gemessen. */
  ausschnitt?: Rahmen;
  /** Codename der Reload-Insel ("SourSpawn"). */
  insel?: string;
}

/** Die alte Annahme (-135.000 bis +135.000) - nur noch, wo fuer eine Saison nichts gemessen ist. */
const BR_STANDARD: Rahmen = { x0: -135_000, y0: -135_000, spanne: 270_000 };

/** Gemessene Rahmen der grossen Karte je Saison (Kartenbild /bilder/karte-s<N>.png). */
export const BR_RAHMEN: Record<number, Rahmen> = {
  43: { x0: -142_800, y0: -146_000, spanne: 301_500 },
  42: { x0: -142_300, y0: -150_000, spanne: 300_500 },
};

/** Die Karte fuer ein Zonen-Bild aus Playlist und Fenster-Kennung. */
export function zonenKarte(playlist: string | null | undefined, windowId: string): ZonenKarte {
  const insel = inselAusPlaylist(playlist);
  if (insel.art === 'reload' && insel.schluessel) {
    const k = RELOAD_INSELN[insel.schluessel];
    if (k) return { art: 'reload', bild: k.bild, rahmen: { x0: k.x0, y0: k.y0, spanne: k.spanne }, ausschnitt: k.ausschnitt, insel: insel.schluessel };
    return { art: 'reload', bild: null, rahmen: BR_STANDARD, insel: insel.schluessel };
  }
  const s = saisonVon(windowId);
  return { art: 'br', bild: saisonKarte(windowId), rahmen: (s !== null ? BR_RAHMEN[s] : undefined) ?? BR_STANDARD };
}

/** Ein Ausschnitt um alle Zonen herum - fuer eine Reload-Insel ohne geeichtes Bild (dann ohne Karte, aber an der richtigen Stelle zueinander). */
export function rahmenUmZonen(kreise: Array<{ x: number; y: number; r: number }>): Rahmen {
  if (!kreise.length) return BR_STANDARD;
  const x0 = Math.min(...kreise.map((k) => k.x - k.r)); const x1 = Math.max(...kreise.map((k) => k.x + k.r));
  const y0 = Math.min(...kreise.map((k) => k.y - k.r)); const y1 = Math.max(...kreise.map((k) => k.y + k.r));
  const spanne = Math.max(x1 - x0, y1 - y0) * 1.25;
  return { x0: (x0 + x1) / 2 - spanne / 2, y0: (y0 + y1) / 2 - spanne / 2, spanne };
}
