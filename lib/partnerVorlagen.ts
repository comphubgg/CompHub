/*
 * Die Vorlagen fuer Partnership Requests an Streamer (Betreiber, 16.11.2026: "mach die E-Mails als Vorlage auf meiner Seite ... als Admin-Tool,
 * und nachher kann ich dort schicken, also kopieren"). Gelesen von /admin/partner.
 *
 * Zweite Fassung (16.11.2026, Betreiber: "viel zu wenig ... Pro-POV genau erklaeren, Instant Player Stats, dass wir einer der schnellsten sind -
 * ohne Osirion zu erwaehnen -, bei groesseren Cups dauert es laenger, bei einer Lobby schneller, und dass sie alles Neue bei mir anfragen koennen").
 * Die Texte setzen sich aus Bausteinen zusammen (BAUSTEINE), je Streamer eine eigene Einleitung und ein eigener Schluss.
 *
 * Was die Bausteine behaupten, und woher es stammt (nur Belegtes, keine erfundenen Zahlen):
 *   - Pro-POV: app/pov/sender.ts, app/streams/PovVideo.tsx, app/pov-ansicht, lib/povVip.ts - Einladungslink des VIP legt dem Pro ein Konto an,
 *     der Pro teilt im Browser oder mit der App "CompHub POV" (Spielton + Mikrofon, stumm ohne Unterbrechung, H.264 ueber die Grafikkarte),
 *     Verzoegerung "gut eine Sekunde", Streams-Seite (Wand) oder OBS-Browserquelle mit Namensbanner und der Statistik des Pros.
 *   - Tempo: Platzierungen/Punkte aus Epics Bestenliste waehrend des Cups (Live-Sammler); die Schnellspur (replays-schnell.yml) holt waehrend
 *     eines Cups etwa alle zehn Minuten neue Runden, ein Durchgang dauerte am 14.11.2026 (Trios Cash Cup) 0-10 Minuten; Ziel und Auftrag:
 *     jeder Cup binnen einer halben Stunde nach dem Ende ganz ausgewertet. Grosse Cups mit Hunderten Lobbys brauchen laenger als ein Finale mit
 *     einer Lobby. Spiel fuer Spiel gemessen ist die Zeit bis zur Anzeige NICHT - die Texte sagen deshalb "usually" / "within about".
 *   - Zahlen: Stand 16.11.2026 von der Seite (16.567 Spielerprofile; 6.258 Spieltage, 11 Seasons, 7 Regionen auf der Startseite).
 *
 * Platzhalter, die die Seite aus den Einstellungen des Admins fuellt:
 *   {name} {discord} {x} {angebot} ("free VIP access") {persoenlich} (leer: die Zeile faellt weg) {video}
 */

export interface PartnerVorlage {
  id: string;
  /** Wer - fuer die Liste. */
  titel: string;
  /** Kurz, worum es in dieser Fassung geht. */
  hinweis: string;
  /** E-Mail-Adresse; leer bei einer DM. */
  an: string;
  /** 'mail' oder 'dm' (X/Twitter, Discord). */
  art: 'mail' | 'dm';
  betreff: string;
  text: string;
  /** Vorschlag fuer den persoenlichen Satz - nur als Hilfe im Feld, nie ungefragt im Text. */
  persoenlichHilfe?: string;
}

/** Die Bausteine - in jeder langen Mail dieselben Fakten, damit nirgends etwas anderes versprochen wird. */
const BAUSTEINE = {
  pov: `1) PRO POV – the pro's screen live on your stream
This is the feature streamers love most. You invite a pro with a personal link; the first time they open it, their CompHub pro account is created automatically, with no sign-up and no setup on your side. The pro then shares their game, either straight from the browser or with our small desktop app "CompHub POV":
• Game sound and microphone are sent together, and the pro can mute the mic without the stream dropping.
• Video is encoded on the pro's graphics card, so it doesn't cost them performance while they play.
• Latency is around one second, close enough to react to fights as they happen.
On your side, the POV shows up on our Streams page (one or several POVs side by side, volume up to 200%), or you add it to OBS as a normal browser source with one link. In OBS you can show the pro's name banner (position and size adjustable) and, if their Epic account is linked, their live stats next to the POV (top, bottom or side). The pro always decides who may watch, and you can stop an invite at any time.`,

  stats: `2) INSTANT PLAYER STATS – answer chat in one click
Every competitive player has a profile: 16,000+ players across all 7 regions, 11 seasons and 6,000+ match days. For every cup you get placements and points, eliminations, damage, damage taken and damage ratio, hits, builds placed, storm time and more, per player and per match day. On top of that: FNCS history, current teammates and trios, landing spots, form over the last cups ("Climbers"), consistency ratings and head-to-head comparisons. When chat asks "who is this guy?", it's one click away.`,

  tempo: `3) SPEED – we're among the fastest in the scene
• Placements and points from the official leaderboard: live while the cup is running.
• Detailed stats from the match replays (damage, hits, builds, storm time and so on): we pull new rounds about every 10 minutes during a cup, so a round is usually on the site within about 10–20 minutes after it ends.
• The whole cup, every single round: fully analysed within about 30 minutes after the final game.
How fast exactly depends on the size of the event. A final or any cup with a single lobby is quick, because there are only a few games to read. Big open cups with thousands of players and hundreds of lobbies take longer, since every lobby of every round is analysed, not just the top.`,

  overlays: `4) LIVE OVERLAYS FOR OBS
Live leaderboard, qualification line, cup timer, team cards and standings, updating by themselves during FNCS, Cash Cups and other events. You copy one link into OBS, and that's it. Colours and layout can be matched to your branding.`,

  analytics: `5) TWITCH ANALYTICS
Viewer peaks with and without raids, new followers and chatters, per stream, day, week, month and all-time, so you can see which formats really grow your channel.`,

  extra: `6) BUILT FOR YOU
If you want something new, or something only for your stream (a special overlay, a stat nobody else shows, a format for your watch parties), just ask me. I'll build it for you, usually within days, not months.`,
};

const ALLES = [BAUSTEINE.pov, BAUSTEINE.stats, BAUSTEINE.tempo, BAUSTEINE.overlays, BAUSTEINE.analytics, BAUSTEINE.extra].join('\n\n');

const SIGNATUR_GESCHAEFT = `Best regards,
{name}
Founder, CompHub
thecomphub.com · {discord} · X: {x}`;

export const PARTNER_VORLAGEN: PartnerVorlage[] = [
  {
    id: 'leo',
    titel: 'Leo (JV Agency)',
    hinweis: 'An das Management, geschäftlich: Partnerschaft',
    an: 'leo@jv-agency.com',
    art: 'mail',
    betreff: "Partnership request – Pro POVs, live stats & overlays for Leo's Fortnite streams",
    persoenlichHilfe: 'z. B. was dir an Leos Streams gefällt (ein Format, ein Event)',
    text: `Hi JV Agency team,

I'm {name}, founder of CompHub (thecomphub.com), a competitive Fortnite platform built for creators who cover the pro scene.

We'd love to work with Leo. {persoenlich}

In short: we give his stream the tools that make watch parties and comp content look like a real broadcast. Here's what that means in practice:

${ALLES}

WHAT WE OFFER
{angebot} for Leo and his mods, direct support from us during big events, and custom styling in his colours. There's nothing to sign; if he likes it, a mention on stream would mean a lot to us.

I've attached a short demo video. Happy to jump on a quick call, or to set up access and a first Pro POV the same day.

${SIGNATUR_GESCHAEFT}`,
  },
  {
    id: 'katoo',
    titel: 'Katoo (direkt)',
    hinweis: 'Locker und persönlich: „probier es beim nächsten Stream“',
    an: 'katoo@ciberdime.com',
    art: 'mail',
    betreff: 'Pro POVs + instant stats for your streams – want to try it?',
    persoenlichHilfe: 'z. B. „Bei deinem letzten Stream zu … ist mir aufgefallen …“',
    text: `Hey Katoo,

{name} here from CompHub (thecomphub.com). Short and straight: we build tools for people who stream competitive Fortnite, and I think they'd fit your streams really well. {persoenlich}

Here's what you'd get:

${ALLES}

I'd love to give you {angebot}, no strings attached. Try it on your next stream, ideally with a Pro POV, and tell me what's missing. Feedback from streamers like you is exactly what we build on.

A quick demo is attached. If you're in, reply with your Twitch name and I'll set everything up today.

Cheers,
{name}
CompHub · thecomphub.com · {discord}`,
  },
  {
    id: 'faxuty',
    titel: 'Faxuty (Underscore Talent)',
    hinweis: 'An das Management: NA, FNCS-Watchpartys, Pro-POV',
    an: 'faxuty@underscoretalent.com',
    art: 'mail',
    betreff: 'Partnership request: Pro POVs, live stats & overlays for Faxuty’s FNCS streams',
    persoenlichHilfe: 'z. B. „His FNCS watch parties are exactly the audience we build for.“ (nur, wenn du dir sicher bist)',
    text: `Hi Underscore Talent team,

My name is {name}, founder of CompHub (thecomphub.com), a competitive Fortnite platform covering every region, from the Chapter 5 archive to the games played an hour ago.

Faxuty is one of the creators we'd most like to work with. {persoenlich} Everything below works for NA (NAC and NAW) as fully as for any other region:

${ALLES}

WHAT WE OFFER
{angebot} for Faxuty and his team, custom styling, and direct support from us during FNCS weekends, including help setting up Pro POVs before a big day.

A short demo is attached. We'd be glad to run a test with him before the next FNCS weekend.

${SIGNATUR_GESCHAEFT}`,
  },
  {
    id: 'aussieantics',
    titel: 'Aussie Antics (Click Management)',
    hinweis: 'An das Management: OCE im Mittelpunkt',
    an: 'AussieAntics@clickmgmt.com.au',
    art: 'mail',
    betreff: "OCE-first tools for Aussie Antics: Pro POVs, live stats & overlays",
    persoenlichHilfe: 'z. B. ein Satz zu seinen Casts oder Watchpartys',
    text: `Hi Click Management team,

I'm {name}, founder of CompHub (thecomphub.com). We track competitive Fortnite across all seven regions, and OCE is covered as fully as EU and NA. That's rare, and it's why we'd love to work with Aussie Antics. {persoenlich}

Here's what his streams would get, all of it available for OCE events:

${ALLES}

WHAT WE OFFER
{angebot} for him and his team, overlays in his own branding, and a direct line to us during events. OCE feedback in particular goes straight into the product.

A short demo is attached. Happy to set everything up, including a first Pro POV, before the next OCE event.

${SIGNATUR_GESCHAEFT}`,
  },
  {
    id: 'grippe',
    titel: 'Grippe (X-DM)',
    hinweis: 'Keine E-Mail: kurze DM auf X',
    an: '',
    art: 'dm',
    betreff: '',
    text: `Hey Grippe 👋 {name} from CompHub here (thecomphub.com).

We build tools for comp Fortnite streams:
• Pro POVs: a pro's screen live on your stream, about 1 s delay, game sound + mic, straight into OBS
• Instant stats for 16k+ players: damage, ratio, builds, FNCS history, teammates
• Fast: stats of a round usually within ~10–20 min, a full cup within ~30 min
• Live overlays: leaderboard, qual line, cup timer
And if you want something just for your stream, I'll build it.

Would love to give you {angebot}, no strings. Want me to set it up? Quick demo: {video}`,
  },
  {
    id: 'vorlage',
    titel: 'Vorlage: weitere Watchparty-Streamer',
    hinweis: 'Für neue Kandidaten: Name und persönlichen Satz eintragen',
    an: '',
    art: 'dm',
    betreff: 'Pro POVs & instant stats for your watch parties',
    persoenlichHilfe: 'z. B. „Saw your FNCS watch party yesterday – …“',
    text: `Hey [Name],

{persoenlich}

I run CompHub (thecomphub.com). We build tools for comp watch parties:
• Pro POVs: invite a pro with one link and their screen is live in your OBS, about 1 s delay, with game sound, mic, name banner and their stats
• Instant stats for 16k+ players in all regions, so chat questions are answered in one click
• Speed: placements live, round stats usually within ~10–20 min, a whole cup within ~30 min (one-lobby finals faster, huge open cups a bit longer)
• Live OBS overlays: leaderboard, qual line, cup timer, team cards
• Anything you want just for your stream: ask me and I'll build it

Want {angebot}? Reply with your Twitch name and it's set up today.

{name}, CompHub · {video}`,
  },
];

export interface PartnerEinstellungen { name: string; discord: string; x: string; angebot: string; video: string }

export const PARTNER_STANDARD: PartnerEinstellungen = {
  name: '', discord: '', x: '', video: '',
  angebot: 'free VIP access',
};

/** Fuellt die Platzhalter. Ein leerer persoenlicher Satz nimmt seine Zeile (und die Leerzeile davor) mit. */
export function fuelleVorlage(text: string, e: PartnerEinstellungen, persoenlich: string): string {
  const p = persoenlich.trim();
  let s = p ? text.replace(/\{persoenlich\}/g, p) : text.replace(/\n\n\{persoenlich\}\n/g, '\n').replace(/ ?\{persoenlich\}/g, '');
  const leer = (w: string, ersatz: string) => (w.trim() ? w.trim() : ersatz);
  // "{angebot}" am Satzanfang (WHAT WE OFFER) gross.
  const angebot = leer(e.angebot, PARTNER_STANDARD.angebot);
  s = s.replace(/(^|\n)\{angebot\}/g, (_m, vor: string) => vor + angebot.charAt(0).toUpperCase() + angebot.slice(1));
  s = s.replace(/\{name\}/g, leer(e.name, '[Name]'))
    .replace(/\{discord\}/g, leer(e.discord, '[Discord]'))
    .replace(/\{x\}/g, leer(e.x, '[@X]'))
    .replace(/\{angebot\}/g, angebot)
    .replace(/\{video\}/g, leer(e.video, '[Video-Link]'));
  return s;
}
