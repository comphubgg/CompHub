import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';
import { lege, antworte, alle, markiereGelesen } from './kontakt';
import { vergleichbar, kernname, ohneZierrat } from './homoglyph';

/*
 * CompHub Support - der Bot im Chat.
 *
 * Der Betreiber wollte "eine Art Bot, der automatisch antwortet": eine
 * Begruessung, sobald jemand seine Adresse bestaetigt hat, und danach
 * Antworten auf Fragen wie "where can I find ..." oder "is <spieler> in the
 * archive".
 *
 * ------------------------------------------------------------ Was er nicht ist
 *
 * Er versteht keine frei formulierte Sprache. Dafuer braeuchte es ein
 * Sprachmodell, und jedes davon kostet Geld und einen Schluessel - beides
 * steht hier nicht zur Verfuegung. Er erkennt stattdessen Muster und
 * beantwortet sie aus den eigenen Daten.
 *
 * Das ist die ehrlichere Loesung, und in diesem Fall sogar die bessere: auf
 * die Frage "ist peterbot im Archiv" antwortet er nicht plausibel, sondern
 * richtig - er sieht in data/spieler-namen.json nach.
 *
 * ---------------------------------------------------------- Zwei Grundregeln
 *
 * 1. Er gibt sich als Bot zu erkennen. Wer glaubt, mit einem Menschen zu
 *    schreiben, und dann eine Maschinenantwort bekommt, fuehlt sich
 *    veralbert.
 * 2. Weiss er etwas nicht, sagt er das und ruft den Betreiber. Er raet nie.
 *    Eine erfundene Auskunft ueber ein Turnier waere schlimmer als gar keine.
 *
 * Englisch, wie alles, was das Werkzeug nach aussen schreibt.
 */

/** Unter diesem Namen schreibt er. */
export const BOT_NAME = 'CompHub Support';

/** Die Adresse, unter der ein Mensch uebernimmt. */
const BOT_ADRESSE = 'help@thecomphub.com';

/** Die Begruessung nach der Bestaetigung der Adresse. */
const WILLKOMMEN = [
  'Welcome to CompHub — have fun and track your favourite pros.',
  '',
  'This is the support chat. A real person reads everything here, and I am '
  + 'the bot that answers the quick ones in the meantime.',
  '',
  'Things I can look up right now:',
  '  • "is peterbot in the archive?" — I check the player archive',
  '  • "where can I find the tierlist?" — I point you to the right page',
  '  • "how many tournaments do you have?" — straight from the archive',
  '',
  'Type "help" for the full list. Anything I cannot answer stays here and '
  + `${BOT_ADRESSE} picks it up.`,
].join('\n');

const HILFE = [
  'I am a bot, so I only understand a handful of things — but what I answer, '
  + 'I look up for real:',
  '',
  '  • is <name> in the archive        — search the player archive',
  '  • where can I find <topic>        — stats, events, rankings, tierlist,',
  '                                      streams, overlays, contact',
  '  • how many tournaments            — count in the archive',
  '  • how many players                — count in the player archive',
  '  • contact                         — how to reach a human',
  '',
  'Everything else I leave to the operator — just write it down here, it does '
  + 'not get lost.',
].join('\n');

/* ───────────────────────────────────────────────── Die Daten zum Nachschlagen */

interface Spielername { namen?: string[]; haupt?: string; schluessel?: string }

/**
 * Die Namensliste - gepuffert.
 *
 * Die Datei ist gut dreihundert Kilobyte gross. Sie bei jeder Chatnachricht
 * neu einzulesen waere Verschwendung; sie aendert sich hoechstens, wenn ein
 * Turnier eingelesen wird.
 */
let namenPuffer: { stand: Record<string, Spielername>; zeit: number } | null = null;

async function spielerNamen(): Promise<Record<string, Spielername>> {
  if (namenPuffer && Date.now() - namenPuffer.zeit < 300_000) return namenPuffer.stand;
  try {
    const roh = await fs.readFile(path.join(DATEN_ORT, 'spieler-namen.json'), 'utf8');
    const stand = JSON.parse(roh) as Record<string, Spielername>;
    namenPuffer = { stand, zeit: Date.now() };
    return stand;
  } catch {
    return namenPuffer?.stand ?? {};
  }
}

let archivPuffer: { zahl: number; zeit: number } | null = null;

async function archivGroesse(): Promise<number> {
  if (archivPuffer && Date.now() - archivPuffer.zeit < 300_000) return archivPuffer.zahl;
  try {
    const roh = await fs.readFile(path.join(DATEN_ORT, 'cup-archiv.json'), 'utf8');
    const liste = JSON.parse(roh);
    const zahl = Array.isArray(liste) ? liste.length : 0;
    archivPuffer = { zahl, zeit: Date.now() };
    return zahl;
  } catch {
    return archivPuffer?.zahl ?? 0;
  }
}

/**
 * Einen Namen vergleichbar machen.
 *
 * Nicht selbstgestrickt, sondern ueber lib/homoglyph.ts - dieselbe Stelle,
 * die das ganze Werkzeug dafuer benutzt. In Turnieren treten Spieler unter
 * Namen an, die lateinisch aussehen, aber kyrillische Zwillinge enthalten:
 * "реtеrbot" ist fuer das Auge "peterbot" und fuer den Rechner etwas voellig
 * anderes. Wer das selbst nachbaut, baut es anders nach.
 */
function schlicht(text: string): string {
  return vergleichbar(text)
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ────────────────────────────────────────────────────────── Die Antworten */

/** Wohin welches Stichwort fuehrt. */
const WEGE: Array<{ woerter: string[]; titel: string; pfad: string; was: string }> = [
  { woerter: ['stat', 'statistic', 'statistik'], titel: 'Statistics', pfad: '/statistiken',
    was: 'every match day, per player and per region' },
  { woerter: ['event', 'cup', 'tournament', 'turnier', 'leaderboard'],
    titel: 'Events', pfad: '/events', was: 'every cup with its leaderboard' },
  { woerter: ['rank', 'pr', 'power'], titel: 'Power Rankings', pfad: '/power-rankings',
    was: "Epic's global ranking, refreshed daily" },
  { woerter: ['tier'], titel: 'Tierlist', pfad: '/tierlist',
    was: 'sort players into tiers yourself' },
  { woerter: ['stream', 'twitch', 'multiview'], titel: 'Streams', pfad: '/streams',
    was: 'watch several streams side by side' },
  { woerter: ['overlay'], titel: 'Overlays', pfad: '/overlays',
    was: 'graphics for your own stream' },
  { woerter: ['contact', 'kontakt', 'support', 'report', 'bug'],
    titel: 'Contact', pfad: '/kontakt', was: 'the form that lands right here' },
  { woerter: ['account', 'konto', 'profile', 'password', 'passwort'],
    titel: 'Account', pfad: '/konto', was: 'your own account and settings' },
];

/**
 * Was der Bot auf diesen Text antwortet - oder null, wenn er nichts weiss.
 *
 * Null ist eine vollwertige Antwort: dann schreibt er nichts, und die Frage
 * steht unbeantwortet im Gespraech, wo der Betreiber sie sieht. Lieber
 * schweigen als etwas erfinden.
 */
export async function antwortAuf(text: string): Promise<string | null> {
  const roh = text.trim();
  if (!roh) return null;
  const t = schlicht(roh);
  if (!t) return null;

  // ---------------------------------------------------------------- Hilfe
  if (/^(help|hilfe|commands|what can you do|was kannst du)\b/.test(t)) return HILFE;

  // -------------------------------------------------------------- Begruessung
  if (/^(hi|hey|hello|yo|moin|hallo|guten tag)\b/.test(t) && t.length < 20) {
    return 'Hey! I am a bot — type "help" and I will show you what I can look up.';
  }

  // ------------------------------------------------------------- Wie erreichen
  if (/(contact|reach|talk to|speak to|human|admin|owner|betreiber)/.test(t)
      && /(how|where|can i|wie|wo)/.test(t)) {
    return `Write it right here — the operator reads this chat. By mail: ${BOT_ADRESSE}.`;
  }

  // ------------------------------------------------------------ Wie viele ...
  if (/how many|wie viele/.test(t)) {
    if (/tournament|cup|event|turnier/.test(t)) {
      const n = await archivGroesse();
      return n
        ? `The archive holds ${n} tournament days right now. You can browse them `
          + 'under Events: https://thecomphub.com/events'
        : null;
    }
    if (/player|spieler|pro/.test(t)) {
      const n = Object.keys(await spielerNamen()).length;
      return n
        ? `${n} players are in the archive. Statistics has them all: `
          + 'https://thecomphub.com/statistiken'
        : null;
    }
  }

  /*
   * Wo finde ich? - und zwar vor der Spielersuche.
   *
   * Andersherum verschluckte die Spielersuche jedes "where can I find the
   * tierlist": das Wort "find" steht in beiden Mustern, und wer zuerst
   * prueft, gewinnt. Die Antwort war dann "ich finde 'the tierlist' nicht im
   * Archiv" - formal richtig und trotzdem Unsinn.
   */
  if (/where (can|do) i (find|see|get)|wo (finde|sehe) ich|where is|which page/.test(t)) {
    const weg = WEGE.find((w) => w.woerter.some((x) => t.includes(x)));
    if (weg) return `${weg.titel} — ${weg.was}: https://thecomphub.com${weg.pfad}`;
    return 'I did not catch which part you mean. These exist: '
      + `${WEGE.map((w) => w.titel).join(', ')}. Name one and I will point you there.`;
  }

  // ------------------------------------------------------- Ist X im Archiv?
  const imArchiv = roh.match(
    /(?:is|do you have|habt ihr|ist)\s+(.+?)\s+(?:in (?:the |my )?(?:archive|archiv|database|data)|drin|dabei)\s*\??$/i,
  ) ?? roh.match(/^(?:search|find|suche|look up|lookup)\s+(?:for\s+)?(?:player\s+|spieler\s+)?(.+?)\s*\??$/i);

  if (imArchiv) {
    const gesucht = schlicht(imArchiv[1]);
    if (gesucht.length >= 2) {
      const treffer = await sucheSpieler(gesucht);
      if (treffer.length === 1) {
        return `Yes — ${treffer[0].name} is in the archive:\n${treffer[0].link}`;
      }
      if (treffer.length > 1) {
        /*
         * Jeder Treffer auf einer eigenen Zeile mit seinem eigenen Link.
         *
         * In einem Fliesstext waeren acht Namen mit acht Adressen dazwischen
         * nicht mehr zu lesen, und genau eine davon will man antippen.
         */
        return [
          `Yes — ${treffer.length} players match "${imArchiv[1].trim()}":`,
          '',
          ...treffer.slice(0, 8).map((x) => `${x.name}\n${x.link}`),
          ...(treffer.length > 8 ? ['', `… and ${treffer.length - 8} more.`] : []),
        ].join('\n');
      }
      return `I cannot find "${imArchiv[1].trim()}" in the archive. That can mean `
        + 'two things: the player is really not in it, or the name is written '
        + 'differently there — Epic names change a lot. Try a shorter part of '
        + 'the name, or leave it here and the operator will check.';
    }
  }

  return null;
}

/**
 * Spieler suchen - und zwar so, dass die Antwort erklaerbar ist.
 *
 * Der erste Wurf war zu weich: er durchsuchte alle jemals getragenen Namen
 * eines Kontos und zeigte dann dessen heutigen Namen. Auf "shxrk" kam
 * deshalb "PabloWingu48" heraus - richtig im Sinne der Daten, aber fuer
 * jeden Leser einfach falsch.
 *
 * Jetzt gilt:
 *
 *   1. Gesucht wird auf dem Kernnamen - Orgtag und Startnummer fallen weg,
 *      "AURA shxrk 19ǃ" ist damit "shxrk".
 *   2. Ein genauer Treffer schlaegt einen enthaltenen. Wer "shxrk" eingibt,
 *      bekommt shxrk und nicht neun entfernte Verwandte.
 *   3. Genannt wird der heutige Name, und dazu der Weg direkt auf sein
 *      Profil. Frueher stand dort "alter Name (now: heutiger Name)" und ein
 *      Verweis auf die Statistikseite im Ganzen - der Betreiber musste den
 *      Spieler dort also noch einmal von Hand suchen, und der Zusatz in
 *      Klammern half ihm dabei kein bisschen.
 */
interface Treffer { name: string; link: string }

async function sucheSpieler(gesucht: string): Promise<Treffer[]> {
  const alleNamen = await spielerNamen();
  const genau: Treffer[] = [];
  const enthalten: Treffer[] = [];
  const schonDa = new Set<string>();

  for (const eintrag of Object.values(alleNamen)) {
    const kandidaten = [...new Set([
      ...(eintrag.namen ?? []), eintrag.haupt ?? '', eintrag.schluessel ?? '',
    ].filter(Boolean))];

    let genauGetroffen = false;
    let getroffen = false;
    for (const n of kandidaten) {
      const kern = schlicht(kernname(n));
      const voll = schlicht(n);
      if (kern === gesucht || voll === gesucht) { genauGetroffen = true; getroffen = true; break; }
      if (kern.includes(gesucht) || voll.includes(gesucht)) getroffen = true;
    }
    if (!getroffen) continue;

    /*
     * Angezeigt und verlinkt wird der heutige Name.
     *
     * Die Statistikseite loest "?spieler=" ueber ihre Suche auf und kennt
     * dort den gepflegten Anzeigenamen - das ist derselbe, der hier als
     * "haupt" steht. Ein alter Turniername wuerde dort ins Leere laufen.
     */
    const voll = ohneZierrat(eintrag.haupt || kandidaten[0]);
    /*
     * Der Kernname, nicht der volle Turniername.
     *
     * Aus "BIG vic0" wird "vic0", aus "bugha 6" wird "bugha" - Orgtag und
     * Startnummer gehoeren nicht zum Menschen. Nachgeprueft: die Suche der
     * Statistikseite loest beide Formen auf denselben Spieler auf, die
     * kuerzere liest sich nur besser.
     */
    const heute = kernname(voll) || voll;
    if (!heute || schonDa.has(heute.toLowerCase())) continue;
    schonDa.add(heute.toLowerCase());

    const eintragung: Treffer = {
      name: heute,
      link: `https://thecomphub.com/statistiken?spieler=${encodeURIComponent(heute)}`,
    };
    (genauGetroffen ? genau : enthalten).push(eintragung);

    if (genau.length >= 12) break;
  }

  // Genaue Treffer zuerst; die entfernteren nur, wenn sonst nichts da ist.
  return (genau.length ? genau : enthalten).slice(0, 12);
}

/* ──────────────────────────────────────────────────────────── Das Schreiben */

/**
 * Die Begruessung nach der Bestaetigung der Adresse.
 *
 * Genau einmal je Konto: gepruft wird, ob es schon ein Gespraech mit diesem
 * Konto gibt. Sonst bekaeme jemand, der seine Adresse zweimal bestaetigt,
 * zwei Begruessungen - und das wirkt kaputt, nicht freundlich.
 */
export async function begruesse(konto: {
  id: string; name: string; email: string;
}): Promise<boolean> {
  try {
    const schon = (await alle()).some((m) => m.vonId === konto.id);
    if (schon) return false;

    const m = await lege({
      thema: 'anderes',
      eigenesThema: 'Welcome',
      text: 'Account created and address confirmed.',
      bilder: [],
      vonId: konto.id,
      vonName: konto.name || konto.email,
      vonEmail: konto.email,
    });
    await antworte({ id: m.id, von: 'betreiber', name: BOT_NAME, text: WILLKOMMEN });

    /*
     * Fuer den Betreiber gleich als gelesen abhaken.
     *
     * Sonst zaehlte jede Begruessung als ungelesene Meldung, und am
     * Chatsymbol am Bildschirmrand stuende nach zehn Anmeldungen eine Zehn -
     * fuer zehn Gespraeche, die niemand eroeffnet hat und in denen nichts
     * steht, was jemand beantworten muesste. Die Zahl dort soll etwas
     * bedeuten; sonst sieht man irgendwann gar nicht mehr hin.
     *
     * Das Gespraech selbst bleibt vollstaendig im Archiv: wer nachsehen
     * will, wer wann begruesst wurde, findet es unter /nachrichten. Und
     * sobald der Betreffende dort etwas schreibt, zaehlt das ganz normal.
     */
    await markiereGelesen(m.id, 'betreiber');
    return true;
  } catch {
    // Eine ausgebliebene Begruessung ist aergerlich, aber kein Grund, die
    // Bestaetigung der Adresse scheitern zu lassen.
    return false;
  }
}

/**
 * Auf eine Nachricht im Chat antworten, wenn der Bot etwas weiss.
 *
 * Wird nach jeder Nachricht eines Nutzers aufgerufen. Gibt zurueck, ob
 * geantwortet wurde.
 */
export async function antworteWennMoeglich(
  gespraechId: string, text: string,
): Promise<boolean> {
  try {
    const antwort = await antwortAuf(text);
    if (!antwort) return false;
    await antworte({ id: gespraechId, von: 'betreiber', name: BOT_NAME, text: antwort });
    return true;
  } catch {
    return false;
  }
}
