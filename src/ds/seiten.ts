/*
 * Das Seitenverzeichnis des Hubs (Design-System 3.0, 27.11.2026): EINE Liste fuer die Leiste jedes Bereichs und fuer die Schnellsuche (Strg+K).
 * Gruppen trennen die Leiste nur optisch (feiner Strich) - es gibt kein Ausklappen und kein Umschalten (Betreiber: "eine Reihe, alle Seiten").
 * `auch`: weitere Pfad-Anfaenge, bei denen der Eintrag als aktiv gilt (z. B. Spielerseiten unter Rankings).
 */
export type BereichId = 'competitive' | 'community' | 'streamer' | 'admin' | 'account';
export interface Seite { pfad: string; titel: string; text?: string; auch?: string[] }
export interface Gruppe { titel: string; seiten: Seite[] }
export interface BereichInfo { id: BereichId; titel: string; basis: string; zeile: string; gruppen: Gruppe[] }

export const BEREICHE: Record<'competitive' | 'community' | 'streamer', BereichInfo> = {
  competitive: {
    id: 'competitive', titel: 'Competitive', basis: '/competitive', zeile: 'Live · Stats · Rankings',
    gruppen: [
      { titel: 'Now', seiten: [
        { pfad: '', titel: 'Overview', text: 'Live cup, next cups, rankings' },
        { pfad: 'events', titel: 'Events', text: 'Every cup and live leaderboard', auch: ['match'] },
        { pfad: 'rankings', titel: 'Rankings', text: 'Power Rankings, top 10,000', auch: ['player'] },
      ] },
      { titel: 'Stats', seiten: [
        { pfad: 'statistics', titel: 'Statistics', text: 'Damage, elims, earnings' },
        { pfad: 'deep-stats', titel: 'Deep Stats', text: 'Damage per weapon, heatmaps' },
        { pfad: 'replays', titel: 'Replays', text: 'Watch any cup game in 2D' },
        { pfad: 'match-finder', titel: 'Match Finder', text: 'Live match IDs of the pros' },
      ] },
      { titel: 'Scene', seiten: [
        { pfad: 'maps', titel: 'Maps', text: 'Drop maps of every cup', auch: ['tournament-maps'] },
        { pfad: 'fncs', titel: 'FNCS', text: 'Finals, champions, all-time' },
        { pfad: 'globals', titel: 'Globals', text: 'Global Championship', auch: ['globals-solos'] },
        { pfad: 'tierlist', titel: 'Tierlist', text: 'Build your own tier list' },
        { pfad: 'predictions', titel: 'Predictions', text: 'Call the final' },
        { pfad: 'scrims', titel: 'Scrims', text: 'Scrim series and results' },
        { pfad: 'orgs', titel: 'Orgs', text: 'Teams and rosters', auch: ['team', 'org'] },
        { pfad: 'awards', titel: 'Awards', text: 'The CompHub Awards' },
      ] },
      { titel: 'More', seiten: [
        { pfad: 'pov', titel: 'POV', text: 'Pro POV streams' },
        { pfad: 'posts', titel: 'Posts', text: 'Daily posts and graphics' },
        { pfad: 'how-it-works', titel: 'How it works', text: 'How CompHub counts' },
      ] },
    ],
  },
  community: {
    id: 'community', titel: 'Community', basis: '/community', zeile: 'The island · Loot · Shop',
    gruppen: [
      { titel: 'Start', seiten: [{ pfad: '', titel: 'Overview', text: 'Season, island, shop, news' }] },
      { titel: 'Island', seiten: [
        { pfad: 'map', titel: 'Map', text: 'Chests, ammo boxes and more' },
        { pfad: 'map-evolution', titel: 'Map Evolution', text: 'Compare the island across patches' },
        { pfad: 'rotation', titel: 'Map Rotation', text: 'Reload and Blitz maps' },
      ] },
      { titel: 'Loot', seiten: [
        { pfad: 'weapons', titel: 'Weapons', text: 'Every weapon with stats', auch: ['weapons/changes'] },
        { pfad: 'weapons/compare', titel: 'Compare', text: 'Weapons side by side' },
        { pfad: 'assets', titel: 'Asset Studio', text: 'Weapon and item images' },
      ] },
      { titel: 'Shop', seiten: [
        { pfad: 'shop', titel: 'Item Shop', text: "Today's shop and history" },
        { pfad: 'cosmetics', titel: 'Cosmetics', text: 'Every cosmetic' },
        { pfad: 'new', titel: 'New', text: 'New in the files' },
        { pfad: 'free', titel: 'Free', text: 'Free cosmetics and how to get them' },
        { pfad: 'jam-tracks', titel: 'Jam Tracks', text: 'Tracks today and the library' },
        { pfad: 'cosmetic-stats', titel: 'Cosmetic Stats', text: 'Longest wait, most shop days' },
        { pfad: 'most-used', titel: 'Most Used', text: 'Seen most in the shop' },
      ] },
      { titel: 'Mine', seiten: [
        { pfad: 'wishlist', titel: 'Wishlist', text: 'What you want' },
        { pfad: 'locker', titel: 'Locker', text: 'What you own' },
        { pfad: 'collections', titel: 'Collections', text: 'Your lists of islands' },
        { pfad: 'rankings', titel: 'Rankings', text: 'Rate cosmetics and seasons' },
      ] },
      { titel: 'Season', seiten: [
        { pfad: 'season', titel: 'Season', text: 'Countdown and live event' },
        { pfad: 'xp', titel: 'XP', text: 'XP per day for your level goal' },
        { pfad: 'treasure-hunt', titel: 'Treasure Hunt', text: 'Rewards and progress' },
        { pfad: 'sprites', titel: 'Sprites', text: 'Owned and mastered' },
        { pfad: 'lorebook', titel: 'Lorebook', text: 'The story so far' },
      ] },
      { titel: 'Live', seiten: [
        { pfad: 'players', titel: 'Player Count', text: 'Most played right now' },
        { pfad: 'discover', titel: 'Discover', text: 'Top islands right now' },
        { pfad: 'creative', titel: 'Creative', text: 'Browse islands' },
        { pfad: 'creators', titel: 'Creators', text: 'Top island makers' },
        { pfad: 'news', titel: 'News', text: 'Fortnite news' },
        { pfad: 'social', titel: 'Social', text: 'X, Discord, Reddit' },
        { pfad: 'tournaments', titel: 'Tournaments', text: 'Next cups' },
        { pfad: 'stats', titel: 'Player lookup', text: 'Find any player' },
      ] },
    ],
  },
  streamer: {
    id: 'streamer', titel: 'Streamer', basis: '/streamer', zeile: 'Watch · Overlays · Tools',
    gruppen: [
      { titel: 'Watch', seiten: [
        { pfad: '', titel: 'Studio', text: 'Your streamer home' },
        { pfad: 'streams', titel: 'Live Streams', text: 'Multiview of everyone live', auch: ['live'] },
      ] },
      { titel: 'Create', seiten: [
        { pfad: 'overlays', titel: 'Overlays', text: 'OBS overlays with live cup data' },
        { pfad: 'my-page', titel: 'My page', text: 'Your own streamer page', auch: ['page'] },
      ] },
      { titel: 'Twitch', seiten: [
        { pfad: 'twitch-bot', titel: 'Twitch bot', text: 'Chat commands for your channel' },
        { pfad: 'twitch-stats', titel: 'Twitch stats', text: 'Viewers and streams over time' },
      ] },
      { titel: 'Access', seiten: [{ pfad: 'vip', titel: 'VIP', text: 'Your access and extras' }] },
    ],
  },
};

/** Welcher Eintrag eines Bereichs zur Adresse gehoert (laengster passender Pfad gewinnt). */
export function aktiveSeite(b: BereichInfo, pfadname: string): Seite | null {
  const rest = pfadname.replace(new RegExp(`^${b.basis}/?`), '').replace(/\/$/, '');
  let best: Seite | null = null; let laenge = -1;
  for (const g of b.gruppen) for (const s of g.seiten) for (const p of [s.pfad, ...(s.auch ?? [])]) {
    const passt = p === '' ? rest === '' : rest === p || rest.startsWith(`${p}/`);
    if (passt && p.length > laenge) { best = s; laenge = p.length; }
  }
  return best;
}
