/* Nur die Typen aus lib/pov (main) - der Rest dort laeuft auf dem Server. */
export type HudOrt = 'oben' | 'unten' | 'links' | 'rechts';
export interface PovHud { an: boolean; ort: HudOrt; mitBild: boolean; text: string }
