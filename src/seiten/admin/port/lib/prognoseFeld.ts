/* Nur die Typen aus lib/prognoseFeld.ts (main) - der Rest liest Dateien auf dem Server und gehoert nicht in den Hub. */
export interface FeldTeam {
  /** Die Konto-Ids sortiert und mit "|" verbunden - oder die Namen. */
  key: string; namen: string[]; ids: string[];
  /** Woher das Team kommt, fuer die Anzeige: "Event 4 · #3". */
  herkunft: string[]; besterPlatz: number; region: string;
}
export interface FeldQuelle { eventId: string; windowId: string; region: string; titel: string; topN: number | null }
export interface FeldErgebnis {
  eventId: string; windowId: string; region: string;
  tokens: string[]; quellen: FeldQuelle[]; teams: FeldTeam[];
  geprueft: boolean; hinweise: FeldHinweis[]; stand: number;
}
export type FeldHinweis =
  | { art: 'vorrunde-offen'; fenster: string; region: string; n: number; datum: number }
  | { art: 'liste-fehlt'; fenster: string; region: string }
  | { art: 'weggelassen'; n: number }
  | { art: 'marke-unvergeben' }
  | { art: 'pruefung-fehlgeschlagen' }
  | { art: 'keine-vergabe'; token: string }
  | { art: 'keine-quali' };
