import type { FtBildSpieler, FtErgebnis, FtPost } from './ftPosts';

/* Nur die Typen aus lib/ftPostsDaten.ts (main) - der Rest liest Dateien auf dem Server und gehoert nicht in den Hub. */
export type FtPostMitBild = FtPost & { bild: FtBildSpieler[] };
export type FtAntwort = Omit<FtErgebnis, 'posts'> & {
  posts: FtPostMitBild[]; teams: number;
  /** 'replay': die Stat-Posts aus der Replay-Auswertung sind dabei; 'epic': nur der Standings-Post aus Epics Bestenliste. */
  quelle: 'epic' | 'replay';
  /** Warum die Stat-Posts fehlen - dann steht nur der Standings-Post da. */
  replayFehlt?: string;
  /** Stand von Epics Bestenliste (ISO-Zeit). */
  epicStand?: string;
};
