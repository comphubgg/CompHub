/*
 * Vorlagen fuer den neu geordneten Community-Discord (Betreiber, 15.11.2026: Aufbau nach dem Vorbild
 * eines Mitbewerbers - INFORMATION oben, COMMUNITY darunter, die privaten Bereiche bleiben).
 *
 * Alles, was Mitglieder lesen, ist englisch (Betreiber, 30.9.2026: "alles, was fuer jeden ist, soll
 * Englisch sein"). Gebraucht von scripts/discord-umbau.mjs (Willkommen, Forum-Regeln),
 * scripts/discord-ansage.mjs (Ankuendigungen) und lib/discord.ts ("Server einrichten" stellt
 * dieselbe Willkommensnachricht - eine Quelle, damit der Admin-Knopf den Umbau nicht zuruecknimmt).
 * Liegt darum in lib/ und ist reines JavaScript: Node-Skripte und Next lesen es beide.
 *
 * Kanalverweise kommen als Funktion herein (kern -> "<#id>" oder "#name"), damit der Text auch dann
 * stimmt, wenn ein Kanal ein Emoji im Namen traegt.
 */

export const FARBE = 0x0ea5e9;

/** Woran der Umbau seine eigene Willkommensnachricht wiedererkennt (Fusszeile der Einbettung). */
export const WILLKOMMEN_MARKE = 'thecomphub.com · welcome';

export function willkommen(k) {
  return {
    title: 'Welcome to CompHub',
    description: [
      'CompHub is competitive Fortnite in one place: live leaderboards, drop maps, player stats, '
        + 'tier lists and stream tools - all free at **https://www.thecomphub.com**.',
      '',
      'Have a look around, say hi, and tell us what you would like to see next.',
    ].join('\n'),
    color: FARBE,
    fields: [
      {
        name: '📘 Information',
        value: [
          `${k('announcements')} - big news, maintenance notices and videos`,
          `${k('comphub-updates')} - the changelog: every real update, short and technical`,
          `${k('social-posts')} - every post from @CompHub_gg on X`,
        ].join('\n'),
      },
      {
        name: '🌐 Community',
        value: [
          `${k('general-chat')} - talk competitive Fortnite`,
          `${k('check-stats')} - look up players and cups`,
          `${k('get-support')} - something broken? **Search first** - your issue may already have an answer`,
          `${k('give-feedback')} - ideas and wishes for the site`,
          `${k('news')} · ${k('results')} - new cups and the top 10 of every finals`,
        ].join('\n'),
      },
      {
        name: '🔑 VIP & managers',
        value: `Pro, streamer or creator? Ask for access in ${k('get-access')} - overlays for OBS and extra views on the site.`,
      },
      {
        name: '📜 Rules',
        value: [
          '1. Be respectful - no hate, no harassment, no drama.',
          '2. No spam, no self-promotion, no DM advertising.',
          '3. English in the public channels.',
          '4. Never share access keys or account details.',
        ].join('\n'),
      },
    ],
    footer: { text: WILLKOMMEN_MARKE },
  };
}

/** Die Willkommensnachricht als ein Text (fuer Stellen, die nur Titel und Text kennen). */
export function willkommenAlsText(k = (n) => `#${n}`) {
  const e = willkommen(k);
  return [e.description, ...e.fields.map((f) => `\n**${f.name}**\n${f.value}`)].join('\n');
}

/*
 * Die oeffentlichen Slash-Befehle fuer #check-stats (app/api/discord/interaktion/route.ts, lib/discordStats.ts).
 * Angemeldet als Gildenbefehle - von lib/discord.ts befehleEinrichten (zusammen mit /comphub, "Server einrichten")
 * und von scripts/discord-umbau.mjs (einzeln, ohne die anderen anzufassen). Eine Quelle fuer beide.
 */
export const STATS_KANAL = 'check-stats';
export const STATS_BEFEHLE = [
  {
    name: 'stats',
    description: 'One tournament in detail - the player and every teammate',
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: 'player', description: 'Player name or Epic name', required: true, autocomplete: true, max_length: 64 },
      { type: 3, name: 'cup', description: 'A specific cup (default: the player\'s latest cup)', required: false, autocomplete: true },
    ],
  },
  {
    name: 'cup',
    description: 'Top 10 of a cup',
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: 'name', description: 'The cup', required: true, autocomplete: true },
      {
        type: 3, name: 'region', description: 'Region (default: EU, or the first region the cup has)', required: false,
        choices: ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'OCE', 'ME'].map((r) => ({ name: r, value: r })),
      },
    ],
  },
  {
    name: 'help',
    description: 'What the CompHub bot can do',
    type: 1,
    dm_permission: false,
  },
  {
    name: 'link-account',
    description: 'Link your Epic account to see your exact rank in every tournament',
    type: 1,
    dm_permission: false,
    options: [
      { type: 3, name: 'code', description: 'The authorizationCode from Epic (leave empty to get the link first)', required: false, max_length: 400 },
    ],
  },
  {
    name: 'unlink-account',
    description: 'Remove your linked Epic account and revoke CompHub\'s access',
    type: 1,
    dm_permission: false,
  },
];

/** Befehle, die ueberall im Server gehen (nur fuer den Fragenden) - nicht nur in #check-stats. */
export const UEBERALL_BEFEHLE = ['link-account', 'unlink-account', 'help'];

/*
 * Der Leitfaden fuer #check-stats (Betreiber, 15.11.2026: "der Kanal darf nicht leer aussehen"). Angeheftet von
 * scripts/discord-umbau.mjs (gefunden ueber die Fusszeile), dieselbe Einbettung antwortet auf /help (nur fuer den Fragenden).
 */
export const STATS_MARKE = 'thecomphub.com · stats guide';
export function statsAnleitung() {
  return {
    title: '📊 CompHub Stats Bot — Guide',
    color: FARBE,
    description: 'This channel is for looking up competitive Fortnite stats with the CompHub bot. '
      + 'Type `/` and pick a command - the bot answers right here.',
    fields: [
      {
        name: 'Command List',
        value: [
          '`/stats player:<name> [cup:]` - one tournament in detail: place and points of the team, then every team member with elims, damage, '
            + 'accuracy, builds, mats, time alive, distance and storm time - with their rank in the field. Without `cup:` it shows the player\'s latest cup.',
          '`/cup name:<cup> [region:]` - the top 10 of a cup (latest finals or session). Region defaults to EU.',
          '`/help` - shows this guide (only you see it).',
          '`/link-account` - link your Epic account: `/stats` then shows your exact rank and points in every tournament, even beyond the public top 10,000.',
          '`/unlink-account` - remove the link again (CompHub\'s access is revoked at Epic right away).',
        ].join('\n'),
      },
      {
        name: 'Tips',
        value: [
          '• Pick a suggestion while typing - that finds the exact account.',
          '• Your Epic name works too, even if you are not on our player list.',
          '• After you pick a player, `cup:` only lists the tournaments that player played.',
        ].join('\n'),
      },
      { name: 'Full stats', value: 'Profiles, leaderboards and drop maps: https://www.thecomphub.com/statistics' },
      {
        name: 'Linking your Epic account - privacy',
        value: [
          '• Only you see the replies. Run `/link-account`, open the Epic link (signed in), copy the `authorizationCode` and run `/link-account code:<code>`.',
          '• CompHub stores a revocable device login for your account, encrypted, and uses it only to read your own tournament placements. Never share the code with anyone else.',
          '• `/unlink-account` deletes it and revokes it at Epic. You can also revoke it any time by changing your Epic password.',
        ].join('\n'),
      },
    ],
    footer: { text: STATS_MARKE },
  };
}

/*
 * Die beiden Foren. Discord zeigt "topic" eines Forums als Richtlinie ueber dem Knopf "New post".
 * "moderated" heisst: nur wer Threads verwalten darf (Team), kann den Tag setzen - "solved" soll
 * nicht jeder selbst vergeben.
 */
export const FOREN = {
  'get-support': {
    topic: 'Search first - your issue may already be answered. One issue per post, pick a tag, and add the link, '
      + 'a screenshot and the time it happened. The team marks posts as "known issue" or "solved".',
    tags: [
      { name: 'bug', emoji_name: '🐛' },
      { name: 'stats', emoji_name: '📊' },
      { name: 'site down', emoji_name: '🔴' },
      { name: 'overlay', emoji_name: '🖼️' },
      { name: 'account', emoji_name: '🔑' },
      { name: 'question', emoji_name: '❓' },
      { name: 'known issue', emoji_name: '📌', moderated: true },
      { name: 'solved', emoji_name: '✅', moderated: true },
    ],
    reaktion: '👍',
    /** Der angeheftete Leitfaden-Beitrag (scripts/discord-umbau.mjs legt ihn an und haelt ihn aktuell - gefunden ueber Titel und Bot). */
    anleitung: {
      titel: 'How to get help',
      text: [
        '## 🆘 How to get help',
        '',
        '**1. Search first.** Your issue may already have a post - use the search at the top of this forum. If it does, add a 👍 or a comment there instead of opening a new post.',
        '**2. One issue per post.** Two problems? Two posts - that way each one can be marked solved on its own.',
        '**3. Pick a tag** (bug, stats, site down, overlay, account, question).',
        '**4. Give us the details:** the link to the page, a screenshot, and the time it happened (with your time zone or region).',
        '',
        'The team marks posts as **📌 known issue** (we know and are on it) or **✅ solved** (fixed - try again).',
        '',
        'Stats questions? Try `/stats` in the stats channel first. Everything else: https://www.thecomphub.com',
      ].join('\n'),
    },
  },
  'give-feedback': {
    topic: 'Ideas and wishes for CompHub. One idea per post, pick a tag, and upvote the ideas you like with 👍. '
      + 'The team tags posts as "planned", "done" or "not planned".',
    tags: [
      { name: 'idea', emoji_name: '💡' },
      { name: 'stats', emoji_name: '📊' },
      { name: 'design', emoji_name: '🎨' },
      { name: 'streamers', emoji_name: '🎥' },
      { name: 'planned', emoji_name: '🗓️', moderated: true },
      { name: 'done', emoji_name: '✅', moderated: true },
      { name: 'not planned', emoji_name: '🚫', moderated: true },
    ],
    reaktion: '👍',
    anleitung: {
      titel: 'How to give feedback',
      text: [
        '## 📝 How to give feedback',
        '',
        '**1. One idea per post.** Short title, then what you would like and why it would help you.',
        '**2. Search first** - if the idea is already here, upvote it instead of posting it again.',
        '**3. Pick a tag** (idea, stats, design, streamers).',
        '**4. Upvote with 👍** the ideas you like - the most wanted ones get built first.',
        '',
        'The team tags posts as **🗓️ planned**, **✅ done** or **🚫 not planned** - so you always know where an idea stands.',
        '',
        'Something broken instead? Post it in the support forum.',
      ].join('\n'),
    },
  },
};

/*
 * Ankuendigungen fuer #announcements. {url} und {text} kommen aus der Befehlszeile
 * (scripts/discord-ansage.mjs). Kurz und ohne Emoji-Gewitter - ein Zeichen vorne genuegt.
 */
export const ANSAGEN = {
  wartung: {
    title: '🔧 Big update in progress',
    description: 'We are working on a big update - **the site may be briefly unreachable**.\n'
      + 'Leaderboards and stats catch up on their own once we are back. Thanks for your patience!',
    color: 0xf59e0b,
  },
  'wartung-fertig': {
    title: '✅ We are back',
    description: 'The update is live and the site is reachable again. '
      + 'See what changed in {comphub-updates}. Something looks off? Post it in {get-support}.',
    color: 0x22c55e,
  },
  video: {
    title: '🎬 New video',
    description: '{text}\n\n▶️ {url}',
    color: FARBE,
    braucht: ['url'],
  },
  neu: {
    title: '✨ New on CompHub',
    description: '{text}\n\n{url}',
    color: FARBE,
    braucht: ['text'],
  },
  stoerung: {
    title: '🔴 Known issue',
    description: '{text}\n\nWe are on it - no need to report it again. Updates follow here.',
    color: 0xef4444,
    braucht: ['text'],
  },
};

/** Eine Ankuendigung mit eingesetzten Werten; Kanalnamen in {..} werden zu Verweisen. */
export function ansage(name, werte, k) {
  const v = ANSAGEN[name];
  if (!v) return null;
  const ein = (s) => s
    .replace(/\{(url|text)\}/g, (_, n) => werte[n] ?? '')
    .replace(/\{([a-z-]+)\}/g, (_, n) => k(n))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: v.title, description: ein(v.description), color: v.color, footer: { text: 'CompHub' } };
}
