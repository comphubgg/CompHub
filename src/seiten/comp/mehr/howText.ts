/* Texte von "How it works" - unveraendert die englische Fassung von thecomphub.com (app/how-it-works/SoFunktioniertEs.tsx und Zaehlen.tsx, origin/main). */

export type Quelle = 'epic' | 'replay' | 'beide';
interface Wert { name: string; quelle: Quelle; text: string }
interface Gruppe { titel: string; werte: Wert[] }
export interface ZaehlText {
  titel: string; stand: string; einleitung: string;
  quellenTitel: string; epicTitel: string; epicText: string; replayTitel: string; replayText: string; lanText: string;
  marke: Record<Quelle, string>;
  gruppen: Gruppe[];
  fehltText: string;
  zeitTitel: string; zeitAbsaetze: string[];
  fehlerTitel: string; fehlerText: string; mailVor: string; discordVor: string; discordKanal: string; fehlerSchluss: string;
}

export interface Abschnitt {
  id: string;
  titel: string;
  absaetze?: string[];
  punkte?: string[];
  /** Absaetze unter der Liste. */
  nachher?: string[];
  video?: string;
  link?: { href: string; text: string };
}

export interface Text {
  titel: string; stand: string; einleitung: string; inhalt: string;
  videoTitel: Record<string, string>;
  abschnitte: Abschnitt[];
}

export const EN: Text = {
  titel: 'How it works',
  stand: 'Last updated: 15 November 2026',
  einleitung: 'Where CompHub\'s numbers come from, how we read the match replays, how each stat is counted, and what every part of the site shows.',
  inhalt: 'On this page',
  videoTitel: {
    'hiw-stats-agent': 'CompHub stats',
    'hiw-match-replays': 'Match replays',
    'hiw-prediction': 'Predictions',
  },
  abschnitte: [
    {
      id: 'how-we-get-the-stats',
      titel: 'How we get the stats',
      punkte: [
        'Epic\'s official tournament leaderboard: placements, points, wins, team eliminations and time alive. In solo cups also eliminations and damage.',
        'Match replays: everything else per player, read with our own replay reader (see below).',
        'LAN events have no replays. There, per-player values come from a public community stats archive.',
      ],
      nachher: [
        'We read each match\'s replay as soon as Epic makes it available, and we aim to have every number on the site as fast as possible. '
        + 'While a cup is still being read, replay-based stats are interim values and are marked as such.',
        'Epic keeps a replay for 31 days. What we extracted from it stays with us after that.',
      ],
      video: 'hiw-stats-agent',
    },
    {
      id: 'replays',
      titel: 'How we analyse replays',
      absaetze: [
        'We read Epic\'s server replays with our own replay reader. From every analysed game we extract:',
      ],
      punkte: [
        'The zones: centre, size and when each one starts and stops shrinking.',
        'The kill feed: every knock and elimination with time, place and weapon type.',
        'Every player with team, placement, and the time and place they were eliminated.',
        'Hits and damage: who hit whom, how much, headshots, and whether it hit the shield.',
        'Player positions as the replay records them, health and shield over time, and the item in hand.',
        'Loot picked up and dropped, builds placed and time in storm.',
      ],
      link: { href: '/replays', text: 'Replays →' },
    },
    {
      id: 'replay-viewer',
      titel: 'The replay viewer',
      punkte: [
        'Each analysed game has its own page with a permanent link.',
        '2D map with a timeline: zone, eliminations, knocks and players alive play along with the time. Zoom with the mouse wheel, drag to move, hover a marker for the player.',
        '3D view: the same map tilted back, with the zone as a wall and eliminations as posts. It is not an in-game camera.',
        'My Replays: sign in with your verified Epic account to see the analysed games of cups you played, with your team highlighted.',
      ],
      video: 'hiw-match-replays',
    },
    {
      id: 'how-we-count',
      titel: 'How we count',
    },
    {
      id: 'power-rankings',
      titel: 'Power Rankings',
      absaetze: [
        'This is Epic\'s own Power Ranking. We don\'t compute the scores; we show Epic\'s list with up to 10,000 places, refreshed several times a day so that '
        + 'renamed players show up with their new name.',
        'Epic runs a single worldwide list, so there are no region tabs. You see each player\'s score and highest score, the change since Epic\'s last update, '
        + 'the biggest jumps and the countries of the top 100.',
      ],
      link: { href: '/power-rankings', text: 'Power Rankings →' },
    },
    {
      id: 'statistics',
      titel: 'Statistics & player pages',
      punkte: [
        'Season leaderboards and each player\'s cup results, with the stats from the sections above.',
        'FNCS tab: every FNCS final of the player with teammates, including the ones they did not qualify for, plus best, worst and average placement.',
        'Progression over the player\'s tournaments: the last 12 or all of them, with or without big events.',
        'Consistency rating, our own: based on the last 20 cups. Each placement counts relative to the size of the field, regions are weighted, and '
        + 'the worst fifth is dropped. Players without enough cups get no rating.',
        'Compare two players, duos or trios, by season or all time (from Chapter 5 Season 3, the first season with per-match values).',
        'Organizations, and a season recap image of a player to share.',
      ],
      link: { href: '/statistics', text: 'Statistics →' },
    },
    {
      id: 'streams',
      titel: 'Streams',
      punkte: [
        'Competitive Fortnite streamers sorted into folders, with their live status from Twitch.',
        'Opens a live stream for you, filters by stream title (e.g. "LCQ"), and can notify you in the browser when a streamer goes live.',
        'Multiview to watch several streams at once, with chat and favourites.',
      ],
      link: { href: '/streams', text: 'Streams →' },
    },
    {
      id: 'fncs',
      titel: 'FNCS & FNCS Solos',
      punkte: [
        'FNCS: every final (Grand Finals, Global Championship, Invitational, Summit) as a card with the podium, points and earnings. Day 1 and Day 2 count as one event. '
        + 'Filter by LAN or online, view as board or timeline.',
        'All-Time Stats: who had the most eliminations in the Grand Finals.',
        'FNCS Solos: the path to the Grand Final (qualifiers, heats, fast tracks, last chance) with the state of every stage. For each stage: leaderboard, players, '
        + 'countries and the drop map, plus who qualified and the prize pool.',
        'Results come from Epic\'s leaderboards. Drop spots come from public tournament drop-map data, where it exists for a region; where it doesn\'t, the page says so.',
      ],
      link: { href: '/fncs', text: 'FNCS →' },
    },
    {
      id: 'predictions',
      titel: 'Predictions',
      absaetze: [
        'Epic says how many players advance (for example "Top 300"), but not how many points that takes. Our qualification line predicts it:',
      ],
      punkte: [
        'Before the cup: the points at that rank in the last editions of the same cup and round (up to three), shown one by one, so you can check them.',
        'No earlier edition? Then the best match we have: another heat of the same event that was already played, an earlier day of the same round, or similar cups '
        + '(same type, team size, mode and region). If the field size differs, the same share of the field counts, not the same rank.',
        'It learns: after every cup we store what we predicted and what it really took, and the average error of the last six cups of the same kind corrects the next prediction.',
        'During the cup: the live points at that rank, refreshed every 15 seconds.',
        'Mid-cup lock: once about 60% of the games are played, the live line is projected to all games once and then stays fixed, so it doesn\'t jump with every game. '
        + 'If the earlier prediction was within 3%, it stays.',
        'After the cup: the real result. It counts as final 30 minutes after the end.',
      ],
      video: 'hiw-prediction',
      link: { href: '/predictions', text: 'Predictions →' },
    },
    {
      id: 'call-the-final',
      titel: 'Call the Final',
      absaetze: [
        'On the predictions page you can make your own call for a final: put the players in your order and pick an MVP. Your call stays in your browser, and with an '
        + 'account also there. Once the result is in, you see how close you were.',
      ],
    },
    {
      id: 'maps',
      titel: 'Drop maps & Tournament maps',
      punkte: [
        'Tournament Maps: the maps of competitive cups by chapter and season, filterable by FNCS, Performance, Division, Reload and region, marked Ended, Live or Upcoming.',
        'Each map shows the drop spots and the players on them, with country and photo, and their placements. Two-day finals have Day 1, Day 2 and Combined.',
        'Drop spots come from public tournament drop-map data; where it has none, some spots are added by our team.',
      ],
      link: { href: '/tournament-maps', text: 'Tournament Maps →' },
    },
    {
      id: 'overlays-discord',
      titel: 'Overlays & Discord bot',
      punkte: [
        'Overlays (VIP): stream overlays for OBS, such as leaderboard, timer, qual line and team card.',
        'Discord /stats: a player\'s recent results and season record, with a link to the profile. /cup shows the top ten of a cup, /help lists the commands.',
        '/link-account connects your Discord to your Epic account through the official Epic sign-in. CompHub only learns your Epic account ID and display name. '
        + '/unlink-account removes the link.',
      ],
      link: { href: '/overlays', text: 'Overlays →' },
    },
  ],
};

export const ZAEHLEN_EN: ZaehlText = {
  titel: 'How we count',
  stand: 'Last updated: 15 November 2026',
  einleitung: 'Every number in Player Stats comes from one of two places: Epic\'s official tournament leaderboard, or the match replays, '
    + 'which we read ourselves with our own replay reader. Here is what each stat counts and where it comes from.',
  quellenTitel: 'Where the numbers come from',
  epicTitel: 'Epic\'s official leaderboard',
  epicText: 'Placements, points, wins, team eliminations and time alive. In solo cups also eliminations and damage.',
  replayTitel: 'Match replays',
  replayText: 'Everything else, per player: eliminations in team cups, knocks, deaths, damage, hits, headshots, shots, builds, materials, '
    + 'time in storm and, where Epic does not list it, distance.',
  lanText: 'LAN events have no replays. There, per-player values come from a public community stats archive.',
  marke: { epic: 'Epic', replay: 'Replay', beide: 'Epic + Replay' },
  gruppen: [
    {
      titel: 'Results',
      werte: [
        { name: 'Points & Placement', quelle: 'epic', text: 'Straight from Epic\'s leaderboard, including the split into placement points and elimination points.' },
        { name: 'Wins', quelle: 'epic', text: 'Victory Royales as Epic\'s leaderboard lists them.' },
        { name: 'Eliminations', quelle: 'beide', text: 'In solo cups: Epic\'s official count. In team cups: the game\'s own kill counter from the replay, '
          + 'when every match of the player has been fully read; otherwise the replay\'s kill feed. Like Epic, only eliminations up to the moment the '
          + 'whole team is out count, and the kill feed does not top the counter up (it also lists bot kills, which Epic does not count).' },
        { name: 'K/D', quelle: 'beide', text: 'Eliminations divided by deaths. When every match is fully read, deaths come from the replay, so in Reload '
          + 'every death counts. Otherwise deaths are the matches without a win; in Reload cups K/D is then left out, because players can die more than once per match.' },
        { name: 'Time Alive', quelle: 'epic', text: 'Epic\'s time from the leaderboard. If two of a player\'s matches overlap in time, the overlap is counted once.' },
      ],
    },
    {
      titel: 'Combat',
      werte: [
        { name: 'Damage To Players', quelle: 'beide', text: 'Damage you deal to other players\' shield and health. The knock or elimination shot only counts '
          + 'up to what the opponent had left (health + shield + overshield). Storm, builds, traps, self-damage, teammates and hits on already knocked '
          + 'players are not included. In solo cups we show Epic\'s official value.' },
        { name: 'Damage From Players', quelle: 'replay', text: 'Damage you take from opponents\' hits, counted the same way. No storm, no fall damage, '
          + 'no self- or team damage, and no hits taken while you are knocked.' },
        { name: 'Damage Ratio', quelle: 'beide', text: 'Damage To Players divided by Damage From Players.' },
        { name: 'Knocks', quelle: 'replay', text: 'How often you knocked an opponent, from the replay\'s kill feed.' },
        { name: 'Hits To Players', quelle: 'replay', text: 'Your hits on opponents. Hits on yourself, teammates and builds don\'t count.' },
        { name: 'Headshots', quelle: 'replay', text: 'Hits on opponents that the game itself marks as critical hits.' },
        { name: 'Player Accuracy', quelle: 'replay', text: 'Hits To Players divided by shots. Shots are read from the ammo leaving the magazine, or from '
          + 'the weapon\'s impacts where the ammo count is missing; in each two-second window the higher of the two counts.' },
      ],
    },
    {
      titel: 'Building & Movement',
      werte: [
        { name: 'Builds Placed', quelle: 'replay', text: 'Wood, stone and metal pieces you placed yourself. A piece that replaces an existing one doesn\'t '
          + 'count. Only shown once every match of the player has this value.' },
        { name: 'Time in Storm', quelle: 'replay', text: 'Time spent inside the storm, read from the game\'s own "in storm" flag in the replay, from the '
          + 'moment the bus starts until you are eliminated or the match ends.' },
        { name: 'Mats Farmed', quelle: 'replay', text: 'Wood, stone and metal you harvested with your pickaxe: trees and bushes, rocks, cars and other '
          + 'metal objects, buildings, walls and floors. Every material gain in the replay is traced to its source, so mats from chests, the floor and '
          + 'eliminated players are not counted here. Nothing from the pre-game lobby counts.' },
        { name: 'Mats Collected', quelle: 'replay', text: 'All materials you gained: mats farmed plus mats from chests, the floor, eliminated players and, '
          + 'in Reload, the mats you get when you return. Mats a teammate passed to you and your own mats picked up again are not counted, since they '
          + 'are not new.' },
        { name: 'Distance Traveled', quelle: 'beide', text: 'Distance on the ground, counted the way Epic counts it: your position once per second, '
          + 'while you are alive, from the moment you jump off the bus, not while skydiving or gliding. Walking, running, jumping, sliding and '
          + 'teleporting count. Where Epic\'s leaderboard lists it (FNCS solo cups), this is Epic\'s own number; everywhere else we calculate it the same way from the replay. On a full FNCS '
          + 'heat our total was within 0.1% of Epic\'s, and a single match is usually within about 0.5%.' },
      ],
    },
  ],
  fehltText: 'Not every stat on the site is listed here, only the ones whose definition we can state exactly.',
  zeitTitel: 'When stats appear',
  zeitAbsaetze: [
    'We read each match\'s replay once Epic makes it available. While a cup is running or its replays are still being read, replay-based numbers '
    + 'are interim values: they grow with every analysed match, and Player Stats shows a "Not final yet" notice with how many matches have been analysed.',
    'Eliminations, knocks and deaths can appear before damage and the other replay stats. Until all of a player\'s matches are read, damage, hits '
    + 'and headshots only show for players whose matches are all read.',
  ],
  fehlerTitel: 'Found a number that looks wrong?',
  fehlerText: 'Send us the match: the cup, the player and the game number if you have it.',
  mailVor: 'Email',
  discordVor: 'or post in',
  discordKanal: '#give-feedback on our Discord',
  fehlerSchluss: 'and we\'ll look into it.',
};

export const MAIL = 'contact@thecomphub.com';
