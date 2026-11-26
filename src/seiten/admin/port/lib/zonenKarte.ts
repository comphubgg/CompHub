import { inselAusPlaylist, saisonVon } from './inseln';
import { saisonKarte } from './bildAdressen';
import { RELOAD_INSELN } from '../app/replays/inselKarten';

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
 *
 * Masstab nachgewiesen (Nitemare Island, 16.11.2026): die Hauptinsel misst im Bild 102.600 x 126.800 Einheiten; die Spieler eines ganzen Matches
 * reichen bis x -50.500..46.000 und y -62.700..60.600, also an allen vier Seiten bis 1.000-5.000 vor die Kueste. Waere der Masstab 10 % daneben,
 * laegen sie 10.000 vor oder hinter der Kueste. Eine Zone mit Radius 20.000 ist darum wirklich knapp 40 % der Inselbreite gross: Reload spielt
 * dieselben spaeten Zonen wie Battle Royale (26.500 -> 20.000 -> 10.000 -> 5.000, nachgesehen in den Replays beider Modi), nur auf einer
 * Insel, die ein Drittel kleiner ist.
 *
 * Wo der Kreis steht: x/y eines Eintrags ist die Mitte der NAECHSTEN Zone (naechsterRadius). Geprueft an den Spielerorten - nach dem Schrumpfen
 * auf 5.000 standen 8 von 8 (BR) und 3 von 3 (Reload) Spielern in diesem Kreis, im Kreis um die eigene Mitte keiner.
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

/**
 * Was das Zonen-Bild von einer Reload-Insel zeigt: nur die Hauptinsel, ohne die Startinsel (Betreiber, 16.11.2026: "warum ist die Starter-Insel
 * unten rechts"). Gemessen als groesste zusammenhaengende Landflaeche im Bild: Hauptinsel x -55.300..47.300, y -63.900..62.900; die Startinsel
 * beginnt bei x 58.900 / y 54.700. Das Quadrat muss so hoch wie die Insel sein (134.400 mit Rand) - mittig reichte es rechts bis 61.900 und
 * schnitte die Startinsel an, darum endet es bei x 56.000 (8.700 Wasser vor der Kueste, 2.900 vor der Startinsel). Die Replay-Ansicht behaelt
 * ihren eigenen Ausschnitt mit der kleinen Insel (inselKarten, Betreiber 7.11.2026).
 */
// Nachgeeicht 16.11.2026 (inselKarten: Bild um -1.100/-1.200 versetzt): die Insel liegt in Weltkoordinaten 1.100 weiter rechts und 1.200 weiter unten als
// oben gemessen, der Ausschnitt rueckt mit (gleicher Rand wie vorher: 2.900 vor der Startinsel).
const ZONEN_AUSSCHNITT: Record<string, Rahmen> = {
  SourSpawn: { x0: -77_300, y0: -66_500, spanne: 134_400 },
};

/** Die alte Annahme (-135.000 bis +135.000) - nur noch, wo fuer eine Saison nichts gemessen ist. */
const BR_STANDARD: Rahmen = { x0: -135_000, y0: -135_000, spanne: 270_000 };

/** Gemessene Rahmen der grossen Karte je Saison (Kartenbild /bilder/karte-s<N>.png). */
export const BR_RAHMEN: Record<number, Rahmen> = {
  43: { x0: -142_800, y0: -146_000, spanne: 301_500 },
  42: { x0: -142_300, y0: -150_000, spanne: 300_500 },
};

/*
 * Epics Karte von heute (/bilder/karte-leer.png, karte-orte.png von fortnite-api.com) - fuer Fenster-Kennungen ohne Saison. Gemessen in
 * Season 43: sie deckt denselben Ausschnitt ab wie karte-s43.png (dieselben Truhen-Treffer auf Land), und Epics Ortspunkte aus
 * /api/fortnite-map fallen damit auf die Ortsnamen von karte-orte.png. Beim naechsten Saisonwechsel neu messen.
 */
const HEUTE: Rahmen = BR_RAHMEN[43];

/**
 * Welchen Weltausschnitt das Battle-Royale-Kartenbild eines Spieltags abdeckt (das Bild selbst: saisonKarte(windowId)). Gemessen je Saison,
 * ohne Saison in der Kennung die Karte von heute, fuer eine noch nicht gemessene Saison die alte Annahme.
 */
export function brRahmen(windowId?: string | null): Rahmen {
  const s = saisonVon(windowId);
  if (s === null) return HEUTE;
  return BR_RAHMEN[s] ?? BR_STANDARD;
}

/** Die Karte fuer ein Zonen-Bild aus Playlist und Fenster-Kennung. */
export function zonenKarte(playlist: string | null | undefined, windowId: string): ZonenKarte {
  const insel = inselAusPlaylist(playlist);
  if (insel.art === 'reload' && insel.schluessel) {
    const k = RELOAD_INSELN[insel.schluessel];
    if (k) return { art: 'reload', bild: k.bild, rahmen: { x0: k.x0, y0: k.y0, spanne: k.spanne }, ausschnitt: ZONEN_AUSSCHNITT[insel.schluessel] ?? k.ausschnitt, insel: insel.schluessel };
    return { art: 'reload', bild: null, rahmen: BR_STANDARD, insel: insel.schluessel };
  }
  return { art: 'br', bild: saisonKarte(windowId), rahmen: brRahmen(windowId) };
}

/** Ein Ausschnitt um alle Zonen herum - fuer eine Reload-Insel ohne geeichtes Bild (dann ohne Karte, aber an der richtigen Stelle zueinander). */
export function rahmenUmZonen(kreise: Array<{ x: number; y: number; r: number }>): Rahmen {
  if (!kreise.length) return BR_STANDARD;
  const x0 = Math.min(...kreise.map((k) => k.x - k.r)); const x1 = Math.max(...kreise.map((k) => k.x + k.r));
  const y0 = Math.min(...kreise.map((k) => k.y - k.r)); const y1 = Math.max(...kreise.map((k) => k.y + k.r));
  const spanne = Math.max(x1 - x0, y1 - y0) * 1.25;
  return { x0: (x0 + x1) / 2 - spanne / 2, y0: (y0 + y1) / 2 - spanne / 2, spanne };
}
