/*
 * Die Vorlagen fuer Partnership Requests an Streamer (Betreiber, 16.11.2026: "mach die E-Mails als Vorlage auf meiner Seite ... als Admin-Tool,
 * und nachher kann ich dort schicken, also kopieren"). Gelesen von /admin/partner.
 *
 * Platzhalter, die die Seite aus den Einstellungen des Admins fuellt:
 *   {name}       sein Name
 *   {discord}    Discord-Einladung
 *   {x}          X-Handle
 *   {angebot}    was angeboten wird, kurz ("free VIP access"); "for Leo and his mods" usw. steht in der Vorlage
 *   {persoenlich} der persoenliche Satz je Vorlage (leer: die Zeile faellt weg)
 *   {video}      Link zum Demo-Video (fuer DMs, wo kein Anhang geht)
 *
 * Zahlen in den Texten: Stand 16.11.2026 von der Seite (16.567 Spielerprofile; 6.258 Spieltage, 11 Seasons, 7 Regionen auf der Startseite).
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
    betreff: "Partnership request – free live overlays & stats for Leo's Fortnite streams",
    persoenlichHilfe: 'z. B. was dir an Leos Streams gefällt (ein Format, ein Event)',
    text: `Hi JV Agency team,

I'm {name}, founder of CompHub (thecomphub.com), a competitive Fortnite platform built for creators who cover the pro scene.

We'd love to work with Leo. In short: we give his stream the tools that make watch parties and comp content look like a broadcast, at no cost:

- Live OBS overlays: live leaderboard, qualification line, cup timer and team cards that update during FNCS and Cash Cups. One URL, pasted into OBS, done.
- Instant player stats: 16,000+ player profiles with FNCS history, teammates, damage ratio and form, ideal for "who is this player?" moments on stream.
- Twitch analytics: viewer peaks (with and without raids), new followers and chatters, per stream, week and month.

{persoenlich}

What we'd offer: {angebot} for Leo and his mods, direct support from us during big events, and custom overlay styling in his colours if he wants it. There's nothing to sign; if he likes it, a mention on stream would mean a lot to us.

I've attached a short demo. Happy to jump on a quick call or set up access the same day.

${SIGNATUR_GESCHAEFT}`,
  },
  {
    id: 'katoo',
    titel: 'Katoo (direkt)',
    hinweis: 'Locker und persönlich: „probier es beim nächsten Stream“',
    an: 'katoo@ciberdime.com',
    art: 'mail',
    betreff: 'Built something for your watch parties – want to try it?',
    persoenlichHilfe: 'z. B. „Bei deinem letzten Stream zu … ist mir aufgefallen …“',
    text: `Hey Katoo,

{name} here from CompHub (thecomphub.com). Short and straight: we build tools for people who stream competitive Fortnite, and I think they'd fit your streams really well.

What you'd get:

- Overlays for OBS: live leaderboard, qual line, cup timer, team banners. They update by themselves during the cup, you just paste a link.
- A stats site for your chat: 16,000+ players with FNCS results, teammates, landing spots and form. When chat asks "who's that?", it's one click.
- Your Twitch stats: peaks, raids, followers and chatters per stream.

{persoenlich}

I'd love to give you {angebot}, no strings attached. Try it on your next stream and tell me what's missing. We build fast, and feedback from streamers like you is exactly what we want.

Quick demo is attached. If you're in, just reply with your Twitch name and I'll set it up today.

Cheers,
{name}
CompHub · thecomphub.com · {discord}`,
  },
  {
    id: 'faxuty',
    titel: 'Faxuty (Underscore Talent)',
    hinweis: 'An das Management: NA-Daten und FNCS-Watchpartys',
    an: 'faxuty@underscoretalent.com',
    art: 'mail',
    betreff: 'Partnership request: free FNCS watch-party overlays & live stats for Faxuty',
    persoenlichHilfe: 'z. B. „His FNCS watch parties are exactly the audience we build for.“ (nur, wenn du dir sicher bist)',
    text: `Hi Underscore Talent team,

My name is {name}, founder of CompHub (thecomphub.com), a competitive Fortnite platform covering every region, from the Chapter 5 archive to yesterday's matches.

Faxuty is one of the creators we'd most like to work with. {persoenlich} Our tools are made for that format:

- Live overlays for OBS: leaderboard, qualification line, cup timer and team cards that update live during NA cups and FNCS.
- NA-focused data: full profiles for NAC and NAW players, including FNCS history, current trios, form ("Climbers") and head-to-head comparisons.
- Twitch analytics per stream: peak viewers with and without raids, followers, chatters.

What we'd offer: {angebot} for Faxuty and his team, custom overlay styling, and direct support from us during FNCS weekends.

A short demo is attached. We'd be glad to set up a test before the next FNCS weekend.

${SIGNATUR_GESCHAEFT}`,
  },
  {
    id: 'aussieantics',
    titel: 'Aussie Antics (Click Management)',
    hinweis: 'An das Management: OCE im Mittelpunkt',
    an: 'AussieAntics@clickmgmt.com.au',
    art: 'mail',
    betreff: "OCE-first tools for Aussie Antics' comp streams: partnership request",
    persoenlichHilfe: 'z. B. ein Satz zu seinen Casts oder Watchpartys',
    text: `Hi Click Management team,

I'm {name}, founder of CompHub (thecomphub.com). We track competitive Fortnite across all seven regions, and OCE is covered as fully as EU and NA. That's rare, and it's why we'd love to work with Aussie Antics.

What his streams would get:

- Live OBS overlays: leaderboard, qual line, cup timer and team cards, updating live during OCE cups and FNCS.
- OCE player data: profiles, FNCS history, current trios and form for OCE players, the kind of context casters need between games.
- Twitch analytics: peak viewers (with and without raids), followers and chatters per stream.

{persoenlich}

We'd offer {angebot} for him and his team, overlays in his own branding, and a direct line to us during events. Any feedback goes straight into the product, and OCE feedback especially is something we want more of.

Demo attached. Happy to set everything up before the next OCE event.

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

We build free tools for comp Fortnite streams: live OBS overlays (leaderboard, qual line, cup timer), stats for 16k+ players and Twitch analytics.

Would love to give you {angebot}, no strings. Want me to set it up? Quick demo: {video}`,
  },
  {
    id: 'vorlage',
    titel: 'Vorlage: weitere Watchparty-Streamer',
    hinweis: 'Für neue Kandidaten: Name und persönlichen Satz eintragen',
    an: '',
    art: 'dm',
    betreff: 'Free live overlays for your watch parties',
    persoenlichHilfe: 'z. B. „Saw your FNCS watch party yesterday – …“',
    text: `Hey [Name],

{persoenlich}

I run CompHub (thecomphub.com). We make free tools for comp streams:
- Live OBS overlays: leaderboard, qual line, cup timer, team cards
- Stats for 16k+ players, so chat questions are answered in one click
- Twitch analytics: peaks, raids, followers

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
  s = s.replace(/\{name\}/g, leer(e.name, '[Name]'))
    .replace(/\{discord\}/g, leer(e.discord, '[Discord]'))
    .replace(/\{x\}/g, leer(e.x, '[@X]'))
    .replace(/\{angebot\}/g, leer(e.angebot, PARTNER_STANDARD.angebot))
    .replace(/\{video\}/g, leer(e.video, '[Video-Link]'));
  return s;
}
