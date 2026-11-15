/*
 * Die oeffentlichen Slash-Befehle in #check-stats (Betreiber, 15.11.2026: Server-Umbau, "Stats-Befehle").
 *
 *   /stats player:<name> [cup:<cup>]   letzte Ergebnisse eines Spielers, Saisonbilanz, Link zum Profil
 *   /cup name:<cup> [region:<r>]       die ersten zehn eines Cups
 *   /help                              die Befehle
 *
 * Alles Oeffentliche ist englisch. Die Zahlen kommen aus denselben Wegen wie auf der Seite - die Routen
 * werden hier direkt aufgerufen (wie lib/ergebnisPosts), nicht ueber das Netz:
 *   Spielersuche    /api/szene-stats?ansicht=suche&q=   (die Kopfsuche der Seite)
 *   Profil          /api/szene-stats?spieler=<id>       (das Profil auf /statistics)
 *   Cups            /api/cup-catalog?modus=standard
 *   Bestenliste     /api/cup-leaderboard + /api/echte-namen (wie scripts/ergebnisse-discord.mjs)
 *
 * Eliminierungen: je Spieltag aus den Spielerwerten des Archivs (werte.eliminations) oder, bei Tagen, die nur
 * Epic kennt, aus dem ausgewerteten Replay (replayElims) - so wie die Profilseite. Nie aus den Clutch-Punkten
 * ("solo"). Fehlt beides, steht ein Strich: Epics Bestenliste zaehlt Elims nur je Team.
 */

import { GET as szeneAbruf } from '@/app/api/szene-stats/route';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { GET as bestenlisteAbruf } from '@/app/api/cup-leaderboard/route';
import { POST as echteNamenAbruf } from '@/app/api/echte-namen/route';
import { finale as istFinaleFenster, fensterName, profilKarte, type KatalogCup, type KatalogFenster } from '@/lib/ergebnisPosts';
import { STATS_BEFEHLE, STATS_KANAL } from '@/lib/discordVorlagen.mjs';

const SEITE = 'https://www.thecomphub.com';
/** Das Blau der Seite (Sky 500) - kein Gruen (Betreiber: nichts von Osirion). */
const FARBE = 0x0ea5e9;

export { STATS_KANAL };
export const STATS_NAMEN = new Set(STATS_BEFEHLE.map((b) => b.name));

type Einbettung = Record<string, unknown>;
export interface Antwort { embeds?: Einbettung[]; components?: unknown[]; content?: string }

const flagge = (land?: string | null) => (land && /^[A-Za-z]{2}$/.test(land)
  ? [...land.toUpperCase()].map((c) => String.fromCodePoint(127397 + c.charCodeAt(0))).join('') : '');
const zahl = (n: number) => n.toLocaleString('en-US');
const kurz = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : zahl(Math.round(n)));
const knopf = (label: string, url: string) => ({ type: 1, components: [{ type: 2, style: 5, label, url }] });

async function json<T>(antwort: Response | Promise<Response>): Promise<T | null> {
  try {
    const r = await antwort;
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

/* ------------------------------------------------------------------ Cups */

interface Fenster extends KatalogFenster { begin?: number }
interface Cup extends KatalogCup { regionen?: Record<string, Fenster[]> }

/*
 * Der Cup-Katalog, im Prozess gemerkt. Die Vorschlagsliste (Autocomplete) muss in drei Sekunden antworten,
 * und der Katalog braucht kalt laenger - also wird er im Hintergrund erneuert und der letzte Stand genommen.
 */
let katalog: { cups: Cup[]; stand: number } | null = null;
let katalogLaeuft: Promise<Cup[]> | null = null;
const KATALOG_FRISCH = 10 * 60_000;

function katalogHolen(): Promise<Cup[]> {
  katalogLaeuft ??= (async () => {
    const j = await json<{ cups?: Cup[] }>(katalogAbruf(new Request(`${SEITE}/api/cup-catalog?modus=standard`)));
    if (j?.cups?.length) katalog = { cups: j.cups, stand: Date.now() };
    return katalog?.cups ?? [];
  })().finally(() => { katalogLaeuft = null; });
  return katalogLaeuft;
}

/** Den Katalog - hoechstens so lange warten, wie gesagt; sonst den letzten Stand (oder nichts). */
async function cups(warten = 25_000): Promise<Cup[]> {
  if (katalog && Date.now() - katalog.stand < KATALOG_FRISCH) return katalog.cups;
  const neu = katalogHolen();
  if (katalog) return katalog.cups;
  return Promise.race([neu, new Promise<Cup[]>((r) => setTimeout(() => r([]), warten))]);
}

const fensterVon = (c: Cup) => Object.values(c.regionen ?? {}).flat();
/** Wann der Cup zuletzt gespielt wurde (Ende des letzten gelaufenen Fensters). */
const zuletzt = (c: Cup) => Math.max(0, ...fensterVon(c)
  .filter((f) => f.status === 'vorbei' || f.status === 'live').map((f) => f.end ?? f.begin ?? 0));

/** Vorschlaege fuer "cup:" / "name:" - die juengsten Cups zuerst, passend zum Getippten. */
export async function cupVorschlaege(q: string): Promise<Array<{ name: string; value: string }>> {
  const liste = await cups(2_200);
  const t = q.trim().toLowerCase();
  return liste
    .filter((c) => c.id.length <= 100 && zuletzt(c) > 0)
    .filter((c) => !t || c.titel.toLowerCase().includes(t) || c.id.toLowerCase().includes(t))
    .sort((a, b) => zuletzt(b) - zuletzt(a))
    .slice(0, 25)
    .map((c) => {
      const tag = new Date(zuletzt(c)).toISOString().slice(0, 10);
      return { name: `${c.titel} · ${tag}`.slice(0, 100), value: c.id };
    });
}

/* --------------------------------------------------------------- Spieler */

interface Treffer { epicId: string; anzeige: string; name: string; land: string | null; matches: number; aktuell?: string | null }

async function suche(q: string): Promise<Treffer[]> {
  const j = await json<{ spieler?: Treffer[] }>(szeneAbruf(new Request(`${SEITE}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)));
  return j?.spieler ?? [];
}

/** Vorschlaege fuer "player:" - die Suche der Seite, mit Frist (Discord gibt drei Sekunden). */
export async function spielerVorschlaege(q: string): Promise<Array<{ name: string; value: string }>> {
  if (q.trim().length < 2) return [];
  const treffer = await Promise.race([suche(q.trim()), new Promise<Treffer[]>((r) => setTimeout(() => r([]), 2_200))]);
  return treffer.slice(0, 25).map((s) => ({
    name: `${s.anzeige}${s.aktuell && s.aktuell !== s.anzeige ? ` (${s.aktuell})` : ''}`.slice(0, 100),
    value: s.epicId,
  }));
}

interface Werte { eliminations?: number; damageDealt?: number; matchesPlayed?: number }
interface Zeile {
  windowId: string; region: string; season: string; datum: number | null;
  platz: number | null; punkte: number | null;
  event?: string; titel?: string; werte?: Werte; matches?: number; replayElims?: number; nurEpic?: boolean;
}
interface Profil {
  spieler: { epicId: string; anzeige: string; land: string | null; bild: string | null; heimat?: string; x?: string | null } | null;
  verlauf?: Zeile[]; epicZeilen?: Zeile[]; saisonNamen?: Record<string, string>;
  rang?: { global: number; globalVon: number; regional: number | null; regionalVon: number; region: string } | null;
}

/** Eine Zeile, wie sie im Embed steht. */
interface Ergebnis {
  windowId: string; region: string; season: string; datum: number; titel: string;
  platz: number | null; punkte: number | null; elims: number | null; schaden: number | null; matches: number | null;
}

function ergebnisse(p: Profil): Ergebnis[] {
  const raus = new Map<string, Ergebnis>();
  for (const z of p.verlauf ?? []) {
    raus.set(`${z.windowId}|${z.region}`, {
      windowId: z.windowId, region: z.region, season: z.season, datum: z.datum ?? 0,
      titel: z.event ?? z.windowId, platz: z.platz, punkte: z.punkte,
      elims: typeof z.werte?.eliminations === 'number' ? z.werte.eliminations : null,
      schaden: typeof z.werte?.damageDealt === 'number' && z.werte.damageDealt > 0 ? Math.round(z.werte.damageDealt) : null,
      matches: z.werte?.matchesPlayed ?? null,
    });
  }
  // Tage, die nur Epic kennt: Platz, Punkte, Matches - Elims nur aus dem Replay.
  for (const z of p.epicZeilen ?? []) {
    const k = `${z.windowId}|${z.region}`;
    if (raus.has(k)) continue;
    raus.set(k, {
      windowId: z.windowId, region: z.region, season: z.season, datum: z.datum ?? 0,
      titel: z.titel ?? z.windowId, platz: z.platz, punkte: z.punkte,
      elims: typeof z.replayElims === 'number' ? z.replayElims : null,
      schaden: null, matches: z.matches ?? null,
    });
  }
  return [...raus.values()].sort((a, b) => b.datum - a.datum);
}

function zeileText(e: Ergebnis): string {
  const teile = [
    e.punkte !== null ? `${zahl(e.punkte)} pts` : null,
    `${e.elims !== null ? zahl(e.elims) : '–'} elims`,
    e.schaden !== null ? `${kurz(e.schaden)} dmg` : null,
  ].filter(Boolean);
  const wann = e.datum ? ` · <t:${Math.floor(e.datum / 1000)}:d>` : '';
  return `\`${e.platz ? `#${e.platz}`.padStart(6) : '     –'}\` **${e.titel}** (${e.region})${wann}\n${teile.join(' · ')}`;
}

const profilLink = (id: string) => `${SEITE}/statistics?spieler=${encodeURIComponent(id)}`;

/** /stats - die Antwort fertig zum Nachtragen (Einbettung und Link-Knopf). */
export async function statsAntwort(spielerEingabe: string, cupId?: string): Promise<Antwort> {
  const q = spielerEingabe.trim();
  if (q.length < 2) return { content: 'Type at least two letters of the player name.' };
  const istId = /^[0-9a-f]{32}$/i.test(q);
  let epicId = istId ? q.toLowerCase() : '';
  if (!epicId) {
    const t = await suche(q);
    const genau = t.find((s) => [s.anzeige, s.name, s.aktuell ?? ''].some((n) => n.toLowerCase() === q.toLowerCase()));
    epicId = (genau ?? t[0])?.epicId ?? '';
  }
  if (!epicId) return { content: `No player found for "${q}". Try the Epic name or pick a suggestion.` };

  const p = await json<Profil>(szeneAbruf(new Request(`${SEITE}/api/szene-stats?spieler=${epicId}`)));
  if (!p?.spieler) {
    return {
      content: p ? `No results on record for "${q}" yet.` : 'The stats are not answering right now - please try again in a minute.',
      components: [knopf('Full profile', profilLink(epicId))],
    };
  }
  const s = p.spieler;
  const alle = ergebnisse(p);

  // Welche Spieltage: die des gewaehlten Cups, sonst die des letzten Cups des Spielers.
  const katalogCups = await cups();
  const cupVon = new Map<string, Cup>();
  for (const c of katalogCups) for (const f of fensterVon(c)) cupVon.set(f.windowId, c);
  let gewaehlt: Ergebnis[];
  let cupTitel = '';
  if (cupId) {
    const c = katalogCups.find((x) => x.id === cupId);
    const fenster = new Set(c ? fensterVon(c).map((f) => f.windowId) : []);
    gewaehlt = alle.filter((e) => fenster.has(e.windowId));
    cupTitel = c?.titel ?? cupId;
    if (!gewaehlt.length) {
      return {
        content: `${s.anzeige} has no results in ${cupTitel}.`,
        components: [knopf('Full profile', profilLink(s.epicId))],
      };
    }
  } else if (alle.length) {
    const c = cupVon.get(alle[0].windowId);
    if (c) {
      const fenster = new Set(fensterVon(c).map((f) => f.windowId));
      gewaehlt = alle.filter((e) => fenster.has(e.windowId));
      cupTitel = c.titel;
    } else {
      // Nicht im Katalog (alte Saison): die juengsten Spieltage.
      gewaehlt = alle.slice(0, 5);
    }
  } else gewaehlt = [];
  gewaehlt = gewaehlt.slice(0, 8);

  const felder: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (gewaehlt.length) {
    felder.push({
      name: cupTitel ? `Latest results · ${cupTitel}`.slice(0, 256) : 'Latest results',
      value: gewaehlt.map(zeileText).join('\n').slice(0, 1024),
    });
  }

  // Saisonbilanz: die Saison des juengsten Spieltags, ueber alle Tage, die das Archiv kennt.
  const saison = alle[0]?.season;
  if (saison) {
    const tage = alle.filter((e) => e.season === saison);
    const mitElims = tage.filter((e) => e.elims !== null);
    const elims = mitElims.reduce((a, e) => a + (e.elims ?? 0), 0);
    const schaden = tage.reduce((a, e) => a + (e.schaden ?? 0), 0);
    const matches = tage.reduce((a, e) => a + (e.matches ?? 0), 0);
    const bester = tage.filter((e) => e.platz).sort((a, b) => (a.platz ?? 0) - (b.platz ?? 0))[0];
    const zeilen = [
      `**${tage.length}** ${tage.length === 1 ? 'day' : 'days'}${matches ? ` · **${zahl(matches)}** matches` : ''}`,
      mitElims.length ? `**${zahl(elims)}** elims${mitElims.length < tage.length ? ` (from ${mitElims.length} of ${tage.length} days)` : ''}`
        + (schaden ? ` · **${kurz(schaden)}** damage` : '') : null,
      bester ? `Best: **#${bester.platz}** · ${bester.titel} (${bester.region})` : null,
    ].filter(Boolean);
    felder.push({ name: `Season · ${p.saisonNamen?.[saison] ?? saison}`.slice(0, 256), value: zeilen.join('\n').slice(0, 1024) });
  }
  if (p.rang?.global) {
    felder.push({
      name: 'Ranking (elims, all seasons)',
      value: `Global **#${zahl(p.rang.global)}** of ${zahl(p.rang.globalVon)}`
        + (p.rang.regional && p.rang.region ? ` · ${p.rang.region} **#${zahl(p.rang.regional)}** of ${zahl(p.rang.regionalVon)}` : ''),
    });
  }
  if (!felder.length) felder.push({ name: 'Results', value: 'No results on record yet.' });

  // Nur echte Fotos (szene-stats liefert bild nur dann) - als volle Adresse, Discord laedt sie selbst.
  const bild = s.bild && s.bild.startsWith('/') ? `${SEITE}${s.bild}` : null;
  return {
    embeds: [{
      title: `${flagge(s.land)} ${s.anzeige}`.trim().slice(0, 256),
      url: profilLink(s.epicId),
      color: FARBE,
      ...(bild ? { thumbnail: { url: bild } } : {}),
      fields: felder,
      footer: { text: 'thecomphub.com · stats' },
    }],
    components: [knopf('Full profile → thecomphub.com', profilLink(s.epicId))],
  };
}

/* ------------------------------------------------------------------- /cup */

interface Platz { rank: number; points: number; wins?: number; elims?: number; players?: Array<{ id?: string; name: string }> }

export async function cupAntwort(cupId: string, regionWunsch?: string): Promise<Antwort> {
  const liste = await cups();
  const t = cupId.trim().toLowerCase();
  const c = liste.find((x) => x.id === cupId)
    ?? liste.filter((x) => x.titel.toLowerCase().includes(t)).sort((a, b) => zuletzt(b) - zuletzt(a))[0];
  if (!c) return { content: liste.length ? `No cup found for "${cupId}" - pick one from the suggestions.` : 'The cup list is not answering right now - please try again in a minute.' };
  const regionen = Object.keys(c.regionen ?? {});
  const region = regionWunsch && regionen.includes(regionWunsch) ? regionWunsch : regionen.includes('EU') ? 'EU' : regionen[0];
  const fenster = (c.regionen?.[region] ?? []);
  const gelaufen = fenster.filter((f) => f.status === 'vorbei' || f.status === 'live')
    .sort((a, b) => (b.end ?? b.begin ?? 0) - (a.end ?? a.begin ?? 0));
  // Das juengste Finale, sonst der juengste Spieltag.
  const f = gelaufen.find((x) => istFinaleFenster(c, x, fenster)) ?? gelaufen[0];
  const link = `${SEITE}/events/${encodeURIComponent(c.id)}`;
  if (!f) return { content: `${c.titel} (${region}) has not started yet.`, components: [knopf('Open on CompHub', link)] };

  const lb = await json<{ entries?: Platz[] }>(bestenlisteAbruf(new Request(
    `${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}`)));
  const zehn = (lb?.entries ?? []).slice(0, 10);
  if (!zehn.length) return { content: `No standings for ${c.titel} (${region}) yet.`, components: [knopf('Open on CompHub', link)] };

  const ids = zehn.flatMap((e) => (e.players ?? []).map((x) => x.id).filter((x): x is string => Boolean(x)));
  const echt = (await json<{ namen?: Record<string, string> }>(echteNamenAbruf(new Request(`${SEITE}/api/echte-namen`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, event: f.eventId }),
  }))))?.namen ?? {};
  const karte = await profilKarte().catch(() => null);
  const land = (id?: string) => {
    if (!id || !karte) return '';
    const k = id.toLowerCase();
    return flagge(karte.profile.get(k)?.land || karte.szene.get(k)?.land);
  };
  const zeilen = zehn.map((e) => {
    const namen = (e.players ?? []).map((x) => `${land(x.id)} ${(x.id && echt[x.id]) || x.name}`.trim()).join(' + ');
    const teile = [`${zahl(e.points)} pts`];
    if (e.wins) teile.push(`${e.wins} ${e.wins === 1 ? 'win' : 'wins'}`);
    if (typeof e.elims === 'number') teile.push(`${e.elims} elims`);
    return `\`${String(e.rank).padStart(2)}.\` **${namen}** · ${teile.join(' · ')}`;
  });
  const tag = fensterName(f.windowId, istFinaleFenster(c, f, fenster));
  return {
    embeds: [{
      title: `${c.titel}${tag ? ` · ${tag}` : ''} · ${region}`.slice(0, 256),
      url: link,
      color: FARBE,
      description: `${f.status === 'live' ? '🔴 **Live** - standings update during the session\n\n' : ''}${zeilen.join('\n')}`.slice(0, 4000),
      footer: { text: 'thecomphub.com · top 10' },
      ...(f.end ? { timestamp: new Date(f.end).toISOString() } : {}),
    }],
    components: [knopf('Full standings → thecomphub.com', link)],
  };
}

/* ------------------------------------------------------------------ /help */

export function hilfeAntwort(): Antwort {
  return {
    embeds: [{
      title: 'CompHub bot · commands',
      color: FARBE,
      description: [
        '**/stats** `player:` `cup:` - a player\'s latest results (place, points, elims, damage), season summary and ranking. '
          + '`cup:` is optional - without it you get the player\'s latest cup.',
        '**/cup** `name:` `region:` - the top 10 of a cup (latest finals or session). Region defaults to EU.',
        '**/help** - this list.',
        '',
        `Use the commands in #📈-${STATS_KANAL}. Full stats, leaderboards and drop maps: **${SEITE}**`,
      ].join('\n'),
      footer: { text: 'thecomphub.com' },
    }],
    components: [knopf('Open thecomphub.com', `${SEITE}/statistics`)],
  };
}
