/* Nur die Typen aus lib/awards.ts (main) - der Rest liest und schreibt die Ablage auf dem Server. */
export type AbstimmungsArt = 'community' | 'panel' | 'beide';
/** spieler: ein Profi mit Epic-Konto (Foto, Flagge, Team aus unseren Daten); person: Org/Creator/Agent/Manager/Coach von Hand; clip: ein Spielzug mit Link. */
export type NominiertenArt = 'spieler' | 'person' | 'clip';

export interface Nominierter {
  id: string;
  art: NominiertenArt;
  name: string;
  epicId?: string | null;
  team?: string | null;
  teamLogo?: string | null;
  /** ISO-Kuerzel (zwei Buchstaben). */
  land?: string | null;
  /** Bild-Adresse: fuer Spieler aus unserem Pool (wird beim Anzeigen frisch ueber die Epic-Id geholt), sonst von Hand. */
  bild?: string | null;
  /** Kurze Zahlenzeile, z. B. "44 events · 3.66 elims/match · $260K". */
  statZeile?: string | null;
  /** X-Handle ohne @. */
  x?: string | null;
  /** Clip oder Beleg (YouTube, X, Twitch ...). */
  link?: string | null;
}

export interface Kategorie {
  id: string;
  name: string;
  beschreibung: string;
  art: AbstimmungsArt;
  sonderpreis: boolean;
  nominierte: Nominierter[];
  /** Gewinner (Nominierten-Id) - erst sichtbar in der Ergebnis-Phase. */
  sieger?: string | null;
}

export interface Zeitraum { start: string | null; ende: string | null }

export interface Awards {
  version: 1;
  titel: string;
  phasen: { nominierung: Zeitraum; abstimmung: Zeitraum; ergebnis: { datum: string | null } };
  kategorien: Kategorie[];
  geaendert?: number;
}

