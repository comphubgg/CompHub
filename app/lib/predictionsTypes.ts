export interface PredictionEntryPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PredictionEntry {
  id: string;
  label: string;
  players: string[];
  position: PredictionEntryPosition | null;
}

export type PredictionStatus = 'draft' | 'active';

export interface PredictionRecord {
  slug: string;
  identifier: string;
  title: string;
  tournamentUrl: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  mapImageBase64?: string;
  mapImageMime?: string;
  mapWidth: number;
  mapHeight: number;
  entries: PredictionEntry[];
}
