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
          `${k('news')} · ${k('results')} · ${k('live-now')} - new cups, top 10 of every finals, VIPs live on Twitch`,
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
 * Die beiden Foren. Discord zeigt "topic" eines Forums als Richtlinie ueber dem Knopf "New post".
 * "moderated" heisst: nur wer Threads verwalten darf (Team), kann den Tag setzen - "solved" soll
 * nicht jeder selbst vergeben.
 */
export const FOREN = {
  'get-support': {
    topic: 'Search before you post - your issue may already be answered. One post per problem: '
      + 'what page, what you expected, what happened, and a screenshot. We tag a post "solved" when it is fixed.',
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
  },
  'give-feedback': {
    topic: 'Ideas and wishes for CompHub. One idea per post, upvote the ones you like with 👍 - '
      + 'we read every post and tag what is planned or done.',
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
