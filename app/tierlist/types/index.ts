export type Region = 'EU' | 'NAC' | 'NAW' | 'NAE' | 'ASIA' | 'OCE' | 'ME' | 'BRAZIL' | string;

export type TierKey = 'S'|'A'|'B'|'C'|'D'|'E'|'F';

export interface Player {
  id: string;
  name: string;
  region?: Region;
  countryCode?: string;
  twitterHandle?: string;
  isGlobal?: boolean;
}

export interface DuoPlayer {
  id: string;
  name: string;
  region?: Region;
  countryCode?: string;
  twitterHandle?: string;
}

export interface Duo {
  id: string;
  player1: DuoPlayer;
  player2: DuoPlayer;
  region?: Region;
  isGlobal?: boolean;
  createdBy?: string;
}

/*
 * Ein Trio - seit dem 29.9.2026. Trios sind fuer 2027 angekuendigt und werden
 * der Hauptmodus; Duos und Solos bleiben daneben.
 */
export interface Trio {
  id: string;
  player1: DuoPlayer;
  player2: DuoPlayer;
  player3: DuoPlayer;
  region?: Region;
  isGlobal?: boolean;
  createdBy?: string;
}

export type TierModus = 'solo' | 'duo' | 'trio';

export interface TierListEntry {
  id: string;
  tier?: TierKey | null;
  data: Player | Duo | Trio | any;
  isDuo?: boolean;
  isTrio?: boolean;
  localOnly?: boolean;
  /**
   * Von Hand angelegt, nicht aus einer Quelle geladen.
   *
   * Nimmt den Eintrag vom Flaggenfilter aus: was jemand selbst eingetippt
   * hat, soll auch dann stehen bleiben, wenn zu dem Namen keine Herkunft
   * gepflegt ist.
   */
  vonHand?: boolean;
}

export interface PlayerInfo { name: string; countryCode?: string; region?: Region }
