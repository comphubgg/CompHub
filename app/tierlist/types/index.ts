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

export interface TierListEntry {
  id: string;
  tier?: TierKey | null;
  data: Player | Duo | any;
  isDuo?: boolean;
  localOnly?: boolean;
}

export interface PlayerInfo { name: string; countryCode?: string; region?: Region }
