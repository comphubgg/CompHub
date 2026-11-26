/* Nur die Typen aus lib/globalsSolos.ts (main) - die Daten baut der Server. */
export interface SolosSpieler {
  id: string;
  name: string;
  anzeige: string;
  land: string | null;
  bild: string | null;
}

export type FensterArt = 'qualifier' | 'heat' | 'finale' | 'sonst';

export interface SolosFenster {
  windowId: string;
  name: string;
  art: FensterArt;
  start: string | null;
  end: string | null;
  spieler: SolosSpieler[];
  /** Die Teams des Spieltags (bei Solos je ein Spieler) - mit Platz und Punkten, wo es sie schon gibt. */
  teams?: SolosTeam[];
  /** Das Kartenbild zu diesem Spieltag (die Karte der Spielversion, bei Reload die Reload-Karte). */
  bild?: string | null;
  /** Nur bei den alten Karten (lib/alteMaps): kommen die Teams von Epics Bestenliste oder hat der Admin sie angelegt? */
  quelle?: 'epic' | 'hand';
  /** Woher die Landepunkte stammen - fuer den Hinweis auf der Karte (Betreiber, 15.11.2026: Quelle immer nennen). */
  kartenQuelle?: 'noble';
  /** Die Landepunkte, mit den Anzeigenamen der Spieler darauf - Ecken in Prozent des Kartenbildes. */
  formen: Array<{
    punkte: Array<{ x: number; y: number }>; spieler: string[];
    /** Wie viele Teams auf dieser Stelle stehen. */ teams?: number;
    /** Die Spieler je Team - damit ein Duo oder Trio auf der Karte nebeneinander steht, wenn mehrere Teams auf einer Stelle sind. */
    gruppen?: string[][];
  }>;
}
export interface SolosTeam {
  id: string;
  spieler: SolosSpieler[];
  rang: number | null;
  punkte: number | null;
  siege: number | null;
  /** Nur bei von Hand gepflegten Bestenlisten (lib/alteMaps). */
  elims?: number | null;
  /** Gespielte Matches - nur bei archivierten Bestenlisten. */
  spiele?: number | null;
}
