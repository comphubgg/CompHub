/*
 * EINE Stelle fuer die Spielmodi und ihre Codes in Epics Fortnite Data API (api.fortnite.com/ecosystem/v1).
 * Epics eigene Modi sind dort ebenfalls "Inseln". Pro Modus werden die Kandidaten der Reihe nach probiert:
 *   1. `sets`      - Sammel-Codes fuer alle Playlists eines Modus (wie Epic sie in der Discovery fuehrt, z. B. set_br_playlists)
 *   2. `playlists` - einzelne Playlists; antwortet kein Set, werden alle gefundenen Playlists zusammengezaehlt
 * Stimmt ein Code nicht (404), einfach hier aendern - die Seiten (Player Count, Map Rotation, Discover) lesen nur diese Liste.
 * Die Playlist-Namen stammen aus fortnite-api.com/v1/playlists (Stand 27.11.2026).
 */
export interface Spielmodus { k: string; titel: string; kurz: string; farbe: string; sets: string[]; playlists: string[] }

const je = (vor: string, nach: string[] = ['Solo', 'Duo', 'Trio', 'Squad']) => nach.map((n) => `${vor}${n}`);

/** Reload-Karten (Codenamen der Playlists) - welche gerade laeuft, zeigt die Map-Rotation-Seite anhand der Spielerzahlen. */
export const RELOAD_KARTEN = ['BlastBerry', 'Sunflower', 'DashBerry', 'PunchBerry', 'MatchMist', 'PiperBoot', 'RopeSmile', 'SourSpawn', 'TimberStake', 'SquareClub',
  'TigerRanch', 'RusticPepper', 'JumpBear', 'BlendHeaded', 'CakePen'];
/** Blitz-Karten (ForbiddenFruit-Varianten). */
export const BLITZ_KARTEN = ['ForbiddenFruit', 'ForbiddenFruitOld', 'ForbiddenFruit_CalmSambucus', 'ForbiddenFruit_PlunderFlop', 'ForbiddenFruit_TensePotato'];

export const SPIELMODI: Spielmodus[] = [
  { k: 'br', titel: 'Battle Royale', kurz: 'BR', farbe: '#38bdf8', sets: ['set_br_playlists'],
    playlists: ['Playlist_DefaultSolo', 'Playlist_DefaultDuo', 'Playlist_Trios', 'Playlist_DefaultSquad'] },
  { k: 'zb', titel: 'Zero Build', kurz: 'ZB', farbe: '#2dd4bf', sets: ['set_nobuildbr_playlists', 'set_zb_playlists'],
    playlists: je('Playlist_NoBuildBR_', ['Solo', 'Duo', 'Trio', 'Squad']) },
  { k: 'reload', titel: 'Reload', kurz: 'Reload', farbe: '#f59e0b', sets: ['set_blastberry_playlists', 'set_reload_playlists'],
    playlists: ['BlastBerry', 'Sunflower', 'DashBerry', 'PunchBerry', 'JumpBear', 'BlendHeaded'].flatMap((k) => [...je(`Playlist_${k}`, ['Solo', 'Duo', 'Squad']), ...je(`Playlist_${k}NoBuild`, ['Solo', 'Duo', 'Squad'])]) },
  { k: 'og', titel: 'OG', kurz: 'OG', farbe: '#a78bfa', sets: ['set_figment_playlists', 'set_og_playlists'],
    playlists: [...je('Playlist_Figment'), ...je('Playlist_FigmentNoBuild')] },
  { k: 'ranked', titel: 'Ranked', kurz: 'Ranked', farbe: '#f472b6', sets: ['set_habanero_playlists', 'set_ranked_playlists'],
    playlists: [...je('Playlist_Habanero'), ...je('Playlist_NoBuildBR_Habanero_')] },
  { k: 'blitz', titel: 'Blitz Royale', kurz: 'Blitz', farbe: '#fb7185', sets: ['set_forbiddenfruit_playlists', 'set_blitz_playlists'],
    playlists: ['Playlist_ForbiddenFruitNoBuildBRSolo', 'Playlist_ForbiddenFruitNoBuildBRDuo', 'Playlist_ForbiddenFruitNoBuildBRSquad', 'Playlist_ForbiddenFruitNoBuildBRStack'] },
];

/** Alle Codes, die zu Epic selbst gehoeren (fuer "Epic-Inseln ausblenden"). */
export const istEpicCode = (code: string) => /^(set_|playlist_)/i.test(code);
