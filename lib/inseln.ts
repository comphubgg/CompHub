/*
 * Welche Insel ein Spieltag spielt - aus Epics Playlist.
 *
 * Der Betreiber: "wenn zum Beispiel ein Reload Cup ist, dass du auch die
 * passende Reload Map anzeigst fuer die Finale, nicht eine komische Battle
 * Royale Map." Epic nennt in der Vorlage jedes Spieltags seine Playlist,
 * und bei Reload steckt darin der Codename der Insel:
 *
 *   Playlist_ShowdownTournament_RE_SourSpawnSolo_NPM   -> SourSpawn
 *   Playlist_ShowdownTournament_PunchBerryDuo_RC       -> PunchBerry
 *   Playlist_ShowdownTournament_BlastBerryNoBuildDuo   -> BlastBerry
 *   Playlist_ShowdownAlt_Solo, Playlist_Showdown...    -> Battle Royale
 *
 * Die Codenamen sind Epics interne Namen; welchen oeffentlichen Namen und
 * welches Kartenbild eine Insel hat, sagt keine Quelle. Das ordnet der
 * Betreiber einmal je Insel zu (data/insel-bilder.json), danach steht die
 * richtige Karte bei jedem Cup dieser Insel von selbst.
 */

export interface Insel {
  art: 'reload' | 'br' | 'unbekannt';
  /** Der Codename der Reload-Insel - oder "BR" fuer die grosse Karte. */
  schluessel: string | null;
}

const REGEL = /^Playlist_ShowdownTournament_(?:RE_)?([A-Z][a-z]+[A-Z][a-z]+)(?:NoBuild)?(?:Solo|Duo|Trio|Squad|Octet)/;

export function inselAusPlaylist(playlist?: string | null): Insel {
  if (!playlist) return { art: 'unbekannt', schluessel: null };
  const m = playlist.match(REGEL);
  if (m) return { art: 'reload', schluessel: m[1] };
  if (/^Playlist_Showdown/i.test(playlist) || /Athena|BattleRoyale|_Solo|_Duo|_Trio|_Squad/i.test(playlist)) {
    return { art: 'br', schluessel: 'BR' };
  }
  return { art: 'unbekannt', schluessel: null };
}
