/*
 * Das Seitenverzeichnis des Hubs (Design-System 3.0, 27.11.2026): EINE Liste fuer die Leiste jedes Bereichs und fuer die Schnellsuche (Strg+K).
 * Gruppen trennen die Leiste nur optisch (feiner Strich) - es gibt kein Ausklappen und kein Umschalten (Betreiber: "eine Reihe, alle Seiten").
 * `auch`: weitere Pfad-Anfaenge, bei denen der Eintrag als aktiv gilt (z. B. Spielerseiten unter Rankings).
 */
export type BereichId = 'competitive' | 'community' | 'streamer' | 'admin' | 'account';
/** `haupt`: steht auch in der kurzen Leiste oben; alles andere erreicht man ueber das Menue-Fenster (und die Schnellsuche). */
export interface Seite { pfad: string; titel: string; text?: string; auch?: string[]; haupt?: boolean }
export interface Gruppe { titel: string; seiten: Seite[] }
export interface BereichInfo { id: BereichId; titel: string; basis: string; zeile: string; gruppen: Gruppe[] }

export const BEREICHE: Record<'competitive' | 'community' | 'streamer', BereichInfo> = {
  competitive: {
    id: 'competitive', titel: 'Competitive', basis: '/competitive', zeile: 'Live · Stats · Rankings',
    gruppen: [
      { titel: 'Now', seiten: [
        { pfad: '', titel: 'Overview', text: 'Live cup, next cups, rankings', haupt: true },
        { pfad: 'events', titel: 'Events', text: 'Every cup and live leaderboard', auch: ['match'], haupt: true },
        { pfad: 'rankings', titel: 'Rankings', text: 'Power Rankings, top 10,000', auch: ['player'], haupt: true },
      ] },
      { titel: 'Stats', seiten: [
        { pfad: 'statistics', titel: 'Statistics', text: 'Damage, elims, earnings', haupt: true },
        { pfad: 'deep-stats', titel: 'Deep Stats', text: 'Damage per weapon, heatmaps', haupt: true },
        { pfad: 'replays', titel: 'Replays', text: 'Watch any cup game in 2D', haupt: true },
        { pfad: 'match-finder', titel: 'Match Finder', text: 'Live match IDs of the pros', haupt: true },
      ] },
      { titel: 'Scene', seiten: [
        { pfad: 'maps', titel: 'Maps', text: 'Drop maps of every cup', auch: ['tournament-maps'], haupt: true },
        { pfad: 'fncs', titel: 'FNCS', text: 'Finals, champions, all-time', haupt: true },
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
      { titel: 'Start', seiten: [{ pfad: '', titel: 'Overview', text: 'Season, island, shop, news', haupt: true }] },
      { titel: 'Island', seiten: [
        { pfad: 'map', titel: 'Map', text: 'Chests, ammo boxes and more', haupt: true },
        { pfad: 'map-evolution', titel: 'Map Evolution', text: 'Compare the island across patches' },
        { pfad: 'rotation', titel: 'Map Rotation', text: 'Reload and Blitz maps' },
      ] },
      { titel: 'Loot', seiten: [
        { pfad: 'weapons', titel: 'Weapons', text: 'Every weapon with stats', auch: ['weapons/changes'], haupt: true },
        { pfad: 'weapons/compare', titel: 'Compare', text: 'Weapons side by side' },
        { pfad: 'assets', titel: 'Asset Studio', text: 'Weapon and item images' },
      ] },
      { titel: 'Shop', seiten: [
        { pfad: 'shop', titel: 'Item Shop', text: "Today's shop and history", haupt: true },
        { pfad: 'cosmetics', titel: 'Cosmetics', text: 'Every cosmetic', haupt: true },
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
        { pfad: 'notifications', titel: 'Notifications', text: 'Alerts for shop, cups and season' },
      ] },
      { titel: 'Season', seiten: [
        { pfad: 'season', titel: 'Season', text: 'Countdown and live event', haupt: true },
        { pfad: 'xp', titel: 'XP', text: 'XP per day for your level goal' },
        { pfad: 'treasure-hunt', titel: 'Treasure Hunt', text: 'Rewards and progress' },
        { pfad: 'sprites', titel: 'Sprites', text: 'Owned and mastered' },
        { pfad: 'lorebook', titel: 'Lorebook', text: 'The story so far' },
      ] },
      { titel: 'Live', seiten: [
        { pfad: 'players', titel: 'Player Count', text: 'Most played right now', haupt: true },
        { pfad: 'discover', titel: 'Discover', text: 'Top islands right now', haupt: true },
        { pfad: 'creative', titel: 'Creative', text: 'Browse islands' },
        { pfad: 'creators', titel: 'Creators', text: 'Top island makers' },
        { pfad: 'news', titel: 'News', text: 'Fortnite news', haupt: true },
        { pfad: 'social', titel: 'Social', text: 'X, Discord, Reddit' },
        { pfad: 'tournaments', titel: 'Tournaments', text: 'Next cups' },
        { pfad: 'stats', titel: 'Player lookup', text: 'Casual stats of any player' },
        { pfad: 'notifications', titel: 'Notifications', text: 'Alerts for cups, rotations, season end' },
      ] },
    ],
  },
  streamer: {
    id: 'streamer', titel: 'Streamer', basis: '/streamer', zeile: 'Watch · Overlays · Tools',
    gruppen: [
      { titel: 'Watch', seiten: [
        { pfad: '', titel: 'Studio', text: 'Your control room: live, overlays, tools', haupt: true },
        { pfad: 'streams', titel: 'Live Streams', text: 'Who is live and the multiview wall – one page', auch: ['live'], haupt: true },
      ] },
      { titel: 'Create', seiten: [
        { pfad: 'overlays', titel: 'Overlays', text: 'Choose, adjust, copy the OBS URL', haupt: true },
        { pfad: 'my-page', titel: 'My page', text: 'Your channel as viewers see it', auch: ['page'], haupt: true },
      ] },
      { titel: 'Twitch', seiten: [
        { pfad: 'twitch-bot', titel: 'Twitch bot', text: 'Chat commands and rules · VIP', haupt: true },
        { pfad: 'twitch-stats', titel: 'Twitch stats', text: 'Viewer curve, peak, followers · VIP', haupt: true },
      ] },
      { titel: 'Access', seiten: [{ pfad: 'vip', titel: 'VIP', text: 'Your pass, key, tools and archive', haupt: true }] },
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
