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
import { STATS_BEFEHLE, STATS_KANAL, statsAnleitung } from '@/lib/discordVorlagen.mjs';
import { namensKey, namenVorschlaege, namenVorwaermen, kontoZuName, kontoErgebnisse, kontoSpieltageSofort, bestandVorwaermen, bekannterName, type KontoSuche } from '@/lib/discordSpielerSuche';
import { schickeAlarm } from '@/lib/discord';

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
async function katalogVorschlaege(q: string, warten = 1_500): Promise<Array<{ name: string; value: string }>> {
  const liste = await cups(Math.max(100, warten));
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

const kurzDatum = (ms: number) => (ms ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

/*
 * "cup:" bei /stats: ist der Spieler schon gewaehlt, nur die Spieltage, an denen er wirklich Ergebnisse hat (neueste zuerst,
 * "FNCS Solos Reload · Heat 1 · EU · 14 Nov") - Betreiber, 15.11.2026, wie beim Mitbewerber "erst Spieler, dann Turnier".
 * Der Wert ist dann "w:<Fenster>". Ohne Spieler (oder solange seine Ergebnisse noch laden) die juengsten Cups des Katalogs.
 *
 * Discord verwirft Vorschlaege nach drei Sekunden ("Optionen koennen nicht geladen werden"; Betreiber, 15.11.2026, nach "iL juanit0 · Epic account").
 * Vorher wartete diese Stelle zwei Sekunden auf das Profil und danach noch einmal bis zu zwei auf den Katalog - und fuer ein Konto ohne Szene-Profil
 * las das Profil 160 Bestenlisten vom Release, was Minuten dauerte. Jetzt: hoechstens 1,5 Sekunden insgesamt. Die Spieltage kommen sofort aus dem
 * Bestand im Speicher (lib/discordSpielerSuche, alle Bestenlisten der letzten drei Wochen), dazu das Profil, falls es schon geladen ist; das Profil
 * wird beim ersten Mal im Hintergrund angeworfen und ist beim naechsten Tastendruck da.
 */
export async function cupVorschlaege(q: string, spielerEingabe?: string): Promise<Array<{ name: string; value: string }>> {
  const frist = Date.now() + 1_500;
  bestandVorwaermen();
  const s = String(spielerEingabe ?? '').trim();
  if (s.length >= 2) {
    const id = /^[0-9a-f]{32}$/i.test(s) ? s.toLowerCase() : idGemerkt.get(namensKey(s)) ?? null;
    if (id) {
      const profil = spielerDaten(id).catch(() => null);
      // Liegt der Bestand schon vor, nur kurz auf das Profil warten - sonst etwas laenger (es ist dann die einzige Quelle).
      const schnell = kontoSpieltageSofort(id) ?? [];
      const daten = await Promise.race([profil, new Promise<null>((r) => setTimeout(() => r(null), schnell.length ? 250 : 700))]);
      const alle = new Map<string, { windowId: string; titel: string; region: string; datum: number }>();
      for (const e of daten?.ergebnisse ?? []) alle.set(e.windowId, e);
      for (const z of schnell) {
        if (alle.has(z.windowId)) continue;
        alle.set(z.windowId, { windowId: z.windowId, region: z.region, datum: z.datum, titel: ausBestenlisten({ zeilen: [z], gesucht: 1, gelesen: 1, tage: 0 })[0].titel });
      }
      if (alle.size) {
        const t = q.trim().toLowerCase();
        const raus = [...alle.values()]
          .sort((a, b) => b.datum - a.datum)
          .map((e) => ({ e, name: `${e.titel} · ${e.region}${e.datum ? ` · ${kurzDatum(e.datum)}` : ''}` }))
          .filter(({ name, e }) => !t || name.toLowerCase().includes(t) || e.windowId.toLowerCase().includes(t))
          .slice(0, 25)
          .map(({ e, name }) => ({ name: name.slice(0, 100), value: `w:${e.windowId}`.slice(0, 100) }));
        if (raus.length) return raus;
      }
    }
  }
  return katalogVorschlaege(q, frist - Date.now());
}

/* --------------------------------------------------------------- Spieler */

interface Treffer { epicId: string; anzeige: string; name: string; land: string | null; matches: number; aktuell?: string | null }

/** Name (vergleichbar) -> Konto, aus den letzten Suchen - damit "cup:" den Spieler kennt, auch wenn er getippt statt gewaehlt wurde. */
const idGemerkt = new Map<string, string>();
const merke = (name: string, id: string) => {
  const k = namensKey(name);
  if (!k) return;
  idGemerkt.delete(k); idGemerkt.set(k, id);
  while (idGemerkt.size > 2_000) idGemerkt.delete(idGemerkt.keys().next().value as string);
};

/** Zwei, drei Versuche mit kurzer Pause - fuer alles, was intern ueber eine Route oder das Netz geht. */
async function nochmal<T>(f: () => Promise<T | null>, versuche = 3): Promise<T | null> {
  for (let i = 0; i < versuche; i += 1) {
    const w = await f().catch(() => null);
    if (w !== null) return w;
    if (i < versuche - 1) await new Promise((r) => setTimeout(r, 400 * 3 ** i));
  }
  return null;
}

async function suche(q: string): Promise<Treffer[] | null> {
  const j = await json<{ spieler?: Treffer[] }>(szeneAbruf(new Request(`${SEITE}/api/szene-stats?ansicht=suche&q=${encodeURIComponent(q)}`)));
  return j ? j.spieler ?? [] : null;
}
/** Die Suche der Seite, gemerkt fuer eine Minute (beim Tippen kommt dieselbe Anfrage mehrmals). */
const sucheVorrat = new Map<string, { bis: number; wert: Promise<Treffer[] | null> }>();
function sucheGemerkt(q: string): Promise<Treffer[] | null> {
  const k = q.toLowerCase();
  const da = sucheVorrat.get(k);
  if (da && da.bis > Date.now()) return da.wert;
  const wert = suche(q);
  sucheVorrat.set(k, { bis: Date.now() + 60_000, wert });
  wert.then((w) => { if (w === null) sucheVorrat.delete(k); }).catch(() => sucheVorrat.delete(k));
  while (sucheVorrat.size > 300) sucheVorrat.delete(sucheVorrat.keys().next().value as string);
  return wert;
}

/** Vorschlaege fuer "player:" - die Suche der Seite, dazu alle Epic-Namen, die CompHub kennt. Mit Frist (Discord gibt drei Sekunden). */
export async function spielerVorschlaege(q: string): Promise<Array<{ name: string; value: string }>> {
  namenVorwaermen();
  if (q.trim().length < 2) return [];
  const frist = <T,>(p: Promise<T>, leer: T, ms: number) => Promise.race([p.catch(() => leer), new Promise<T>((r) => setTimeout(() => r(leer), ms))]);
  const [seite, namen] = await Promise.all([
    frist(sucheGemerkt(q.trim()).then((t) => t ?? []), [] as Treffer[], 2_000),
    frist(namenVorschlaege(q, 15, 1_800), [], 2_000),
  ]);
  const raus: Array<{ name: string; value: string }> = [];
  const da = new Set<string>();
  for (const s of seite) {
    if (da.has(s.epicId)) continue;
    da.add(s.epicId); merke(s.anzeige, s.epicId);
    raus.push({ name: `${s.anzeige}${s.aktuell && s.aktuell !== s.anzeige ? ` (${s.aktuell})` : ''}`.slice(0, 100), value: s.epicId });
  }
  for (const n of namen) {
    if (da.has(n.epicId)) continue;
    da.add(n.epicId); merke(n.name, n.epicId);
    raus.push({ name: `${n.name} · Epic account`.slice(0, 100), value: n.epicId });
  }
  return raus.slice(0, 25);
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
  /** Nur Team-Elims bekannt (Epic zaehlt Elims je Team; kein Replay ausgewertet). */
  teamElims?: number | null;
  /** Aus der gespeicherten Bestenliste: das Event und wann die Liste geholt wurde (ms). */
  eventId?: string; geholt?: number | null;
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

/** Die Zeilen aus den gespeicherten Bestenlisten (lib/discordSpielerSuche) als Ergebnisse. */
function ausBestenlisten(s: KontoSuche): Ergebnis[] {
  return s.zeilen.map((z) => ({
    windowId: z.windowId, region: z.region, season: z.season, datum: z.datum,
    titel: [z.titel, fensterName(z.windowId, false) || (/Event(\d+)/i.exec(z.windowId) ? `Event ${/Event(\d+)/i.exec(z.windowId)![1]}` : '')].filter(Boolean).join(' · '),
    platz: z.platz, punkte: z.punkte, elims: z.elims, schaden: null, matches: z.matches || null,
    teamElims: z.elims === null ? z.teamElims : null,
    eventId: z.eventId, geholt: z.geholt,
  }));
}

interface SpielerDaten {
  epicId: string;
  /** null: die Seite kennt das Konto nicht (kein Profil). */
  profil: Profil | null;
  ergebnisse: Ergebnis[];
  /** Was die Suche in den Bestenlisten ergab (nur fuer Konten ohne Szene-Archiv). */
  bestenlisten: KontoSuche | null;
  /** Das Profil der Seite antwortete nicht (nur die Bestenlisten zaehlen). */
  profilFehlt?: boolean;
}

/*
 * Alles zu einem Konto, zehn Minuten gemerkt (Autocomplete und Antwort fragen oft kurz hintereinander).
 * Das Profil der Seite zuerst; wer kein Szene-Archiv hat (nur Epic-Zeilen oder gar nichts), wird zusaetzlich in den
 * gespeicherten Bestenlisten der letzten drei Wochen gesucht - sonst fehlten gerade die frischen Cups.
 * null: die Seite antwortete auch nach drei Versuchen nicht.
 */
const datenVorrat = new Map<string, { bis: number; wert: Promise<SpielerDaten | null> }>();
function spielerDaten(epicId: string): Promise<SpielerDaten | null> {
  const id = epicId.toLowerCase();
  const da = datenVorrat.get(id);
  if (da && da.bis > Date.now()) return da.wert;
  const wert = (async (): Promise<SpielerDaten | null> => {
    const p = await nochmal(() => json<Profil>(szeneAbruf(new Request(`${SEITE}/api/szene-stats?spieler=${id}`))));
    const aufSeite = p?.spieler ? ergebnisse(p) : [];
    let bestenlisten: KontoSuche | null = null;
    let liste = aufSeite;
    // Ohne Szene-Archiv - oder wenn das Profil gar nicht antwortet - die gespeicherten Bestenlisten.
    if (!(p?.verlauf ?? []).length) {
      bestenlisten = await kontoErgebnisse(id).catch(() => null);
      if (bestenlisten) {
        const schon = new Set(aufSeite.map((e) => `${e.windowId}|${e.region}`));
        liste = [...aufSeite, ...ausBestenlisten(bestenlisten).filter((e) => !schon.has(`${e.windowId}|${e.region}`))]
          .sort((a, b) => b.datum - a.datum);
      }
    }
    // Weder Profil noch Bestenlisten lesbar: nicht "keine Ergebnisse" behaupten.
    if (!p && !bestenlisten?.gelesen) return null;
    return { epicId: id, profil: p?.spieler ? p : null, ergebnisse: liste, bestenlisten, profilFehlt: !p };
  })();
  datenVorrat.set(id, { bis: Date.now() + 10 * 60_000, wert });
  wert.then((w) => { if (!w) datenVorrat.delete(id); }).catch(() => datenVorrat.delete(id));
  while (datenVorrat.size > 200) datenVorrat.delete(datenVorrat.keys().next().value as string);
  return wert;
}

function zeileText(e: Ergebnis): string {
  const elims = e.elims !== null ? `${zahl(e.elims)} elims`
    : typeof e.teamElims === 'number' ? `${zahl(e.teamElims)} team elims` : '– elims';
  const teile = [
    e.punkte !== null ? `${zahl(e.punkte)} pts` : null,
    elims,
    e.schaden !== null ? `${kurz(e.schaden)} dmg` : null,
    e.matches ? `${e.matches} ${e.matches === 1 ? 'match' : 'matches'}` : null,
  ].filter(Boolean);
  const wann = e.datum ? ` · <t:${Math.floor(e.datum / 1000)}:d>` : '';
  return `\`${e.platz ? `#${zahl(e.platz)}`.padStart(7) : '      –'}\` **${e.titel}** (${e.region})${wann}\n${teile.join(' · ')}`;
}

const profilLink = (id: string) => `${SEITE}/statistics?spieler=${encodeURIComponent(id)}`;

/** Wenn intern etwas nicht antwortet: nie ein nackter Fehler, sondern ein Satz und der Link - und eine Zeile in #admin-alarm. */
function langsam(eingabe: string, grund: string, epicId?: string): Antwort {
  void schickeAlarm({
    titel: '/stats laedt nicht',
    text: `Eingabe: "${eingabe.slice(0, 80)}"${epicId ? ` · Konto ${epicId}` : ''}\n${grund}\nDer Nutzer bekam "loading slower than usual".`,
  }).catch(() => null);
  return {
    embeds: [{
      title: 'Stats are loading slower than usual',
      description: `We could not load the stats for **${eingabe.slice(0, 64)}** just now - please try again in a minute.`
        + (epicId ? '\nIn the meantime, the full profile is on thecomphub.com.' : ''),
      color: FARBE,
      footer: { text: 'thecomphub.com · stats' },
    }],
    components: [knopf(epicId ? 'Open profile → thecomphub.com' : 'Open thecomphub.com', epicId ? profilLink(epicId) : `${SEITE}/statistics`)],
  };
}

/** Welches Konto ist gemeint? Die Suche der Seite, dann alle Epic-Namen, die CompHub kennt, dann Epic selbst. */
async function kontoFinden(q: string): Promise<{ epicId: string; name: string } | null | 'fehler'> {
  if (/^[0-9a-f]{32}$/i.test(q)) return { epicId: q.toLowerCase(), name: (await bekannterName(q).catch(() => null)) ?? q.slice(0, 8) };
  const t = await nochmal(() => sucheGemerkt(q));
  const key = namensKey(q);
  const genau = (t ?? []).find((s) => [s.anzeige, s.name, s.aktuell ?? ''].some((n) => n && namensKey(n) === key));
  if (genau) return { epicId: genau.epicId, name: genau.anzeige };
  // Kein genauer Treffer auf der Seite: der genaue Epic-Name schlaegt einen bloss aehnlichen Szene-Spieler.
  const k = await kontoZuName(q);
  if (k && k !== 'fehler') return { epicId: k.epicId, name: k.name };
  if (t?.length) return { epicId: t[0].epicId, name: t[0].anzeige };
  return t === null || k === 'fehler' ? 'fehler' : null;
}

/** /stats - die Antwort fertig zum Nachtragen (Einbettung und Link-Knopf). */
export async function statsAntwort(spielerEingabe: string, cupWahl?: string): Promise<Antwort> {
  namenVorwaermen();
  const q = spielerEingabe.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return { content: 'Type at least two letters of the player name.' };

  const konto = await kontoFinden(q);
  if (konto === 'fehler') return langsam(q, 'Spielersuche und Epic-Namensdienst antworteten nicht.');
  if (!konto) {
    return {
      embeds: [{
        title: 'No player found',
        description: `There is no Epic account named **${q.slice(0, 64)}**. Check the spelling (spaces and numbers count) `
          + 'or pick a suggestion while typing.',
        color: FARBE,
        footer: { text: 'thecomphub.com · stats' },
      }],
    };
  }
  merke(q, konto.epicId); merke(konto.name, konto.epicId);

  const daten = await spielerDaten(konto.epicId);
  if (!daten) return langsam(q, 'Das Profil (szene-stats) und die Bestenlisten am Release antworteten nach drei Versuchen nicht.', konto.epicId);
  if (daten.profilFehlt) {
    void schickeAlarm({ titel: '/stats ohne Profil', text: `Konto ${konto.epicId}: szene-stats antwortete nicht - Antwort nur aus den Bestenlisten.` }).catch(() => null);
  }
  const p = daten.profil;
  const name = p?.spieler?.anzeige ?? konto.name;
  const alle = daten.ergebnisse;

  if (!alle.length && daten.profilFehlt) return langsam(q, 'Das Profil (szene-stats) antwortete nicht, und in den Bestenlisten stand nichts.', konto.epicId);
  if (!alle.length) {
    const s = daten.bestenlisten;
    return {
      embeds: [{
        title: name.slice(0, 256),
        url: profilLink(konto.epicId),
        color: FARBE,
        description: 'We know this Epic account but have no tournament results for it yet '
          + '(only the top 10,000 of each cup are public).'
          + (s ? `\n\nSearched the ${zahl(s.gelesen)} most recent cup sessions (last ${s.tage} days, all regions).` : ''),
        footer: { text: 'thecomphub.com · stats' },
      }],
      components: [knopf('Full profile → thecomphub.com', profilLink(konto.epicId))],
    };
  }

  // Welche Spieltage: ein gewaehlter Spieltag ("w:"), ein Cup des Katalogs, sonst der letzte Cup des Spielers.
  const katalogCups = await cups();
  const cupVon = new Map<string, Cup>();
  for (const c of katalogCups) for (const f of fensterVon(c)) cupVon.set(f.windowId, c);


  let gewaehlt: Ergebnis[];
  let cupTitel = '';
  if (cupWahl?.startsWith('w:')) {
    const w = cupWahl.slice(2);
    gewaehlt = alle.filter((e) => e.windowId === w);
    cupTitel = gewaehlt[0]?.titel ?? cupVon.get(w)?.titel ?? w;
    if (!gewaehlt.length) {
      return { content: `${name} has no result in ${cupTitel}.`, components: [knopf('Full profile', profilLink(konto.epicId))] };
    }
  } else if (cupWahl) {
    const c = katalogCups.find((x) => x.id === cupWahl)
      ?? katalogCups.filter((x) => x.titel.toLowerCase().includes(cupWahl.toLowerCase())).sort((a, b) => zuletzt(b) - zuletzt(a))[0];
    const fenster = new Set(c ? fensterVon(c).map((f) => f.windowId) : []);
    gewaehlt = alle.filter((e) => fenster.has(e.windowId));
    cupTitel = c?.titel ?? cupWahl;
    if (!gewaehlt.length) {
      return { content: `${name} has no results in ${cupTitel}.`, components: [knopf('Full profile', profilLink(konto.epicId))] };
    }
  } else {
    const c = cupVon.get(alle[0].windowId);
    if (c) {
      const fenster = new Set(fensterVon(c).map((f) => f.windowId));
      gewaehlt = alle.filter((e) => fenster.has(e.windowId));
      cupTitel = c.titel;
    } else {
      // Nicht im Katalog (alte Saison, oder nur aus den Bestenlisten): die juengsten Spieltage.
      gewaehlt = alle.slice(0, 6);
    }
  }
  gewaehlt = gewaehlt.slice(0, 8);

  const felder: Array<{ name: string; value: string; inline?: boolean }> = [];
  felder.push({
    name: cupTitel && !cupWahl?.startsWith('w:') ? `Latest results · ${cupTitel}`.slice(0, 256) : cupWahl?.startsWith('w:') ? 'Result' : 'Latest results',
    value: gewaehlt.map(zeileText).join('\n').slice(0, 1024),
  });

  // Saisonbilanz: die Saison des juengsten Spieltags, ueber alle Tage, die wir kennen.
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
      bester ? `Best: **#${zahl(bester.platz ?? 0)}** · ${bester.titel} (${bester.region})` : null,
    ].filter(Boolean);
    felder.push({ name: `Season · ${p?.saisonNamen?.[saison] ?? saison}`.slice(0, 256), value: zeilen.join('\n').slice(0, 1024) });
  }
  if (p?.rang?.global) {
    felder.push({
      name: 'Ranking (elims, all seasons)',
      value: `Global **#${zahl(p.rang.global)}** of ${zahl(p.rang.globalVon)}`
        + (p.rang.regional && p.rang.region ? ` · ${p.rang.region} **#${zahl(p.rang.regional)}** of ${zahl(p.rang.regionalVon)}` : ''),
    });
  }

  // Ehrlich sagen, woher die Zahlen kommen, wenn die Seite das Konto nicht fuehrt.
  const s = daten.bestenlisten;
  const ausListen = s?.zeilen.length ?? 0;
  const beschreibung = !p && s
    ? `Found in **${ausListen}** ${ausListen === 1 ? 'cup session' : 'cup sessions'} of the last ${s.tage} days `
      + `(searched ${zahl(s.gelesen)} sessions, all regions). Own elims come from replays where we have them - otherwise Epic only counts elims per team.`
    : undefined;

  const sp = p?.spieler;
  // Nur echte Fotos (szene-stats liefert bild nur dann) - als volle Adresse, Discord laedt sie selbst.
  const bild = sp?.bild && sp.bild.startsWith('/') ? `${SEITE}${sp.bild}` : null;
  return {
    embeds: [{
      title: `${flagge(sp?.land)} ${name}`.trim().slice(0, 256),
      url: profilLink(konto.epicId),
      color: FARBE,
      ...(beschreibung ? { description: beschreibung } : {}),
      ...(bild ? { thumbnail: { url: bild } } : {}),
      fields: felder,
      footer: { text: 'thecomphub.com · stats' },
    }],
    components: [knopf('Full profile → thecomphub.com', profilLink(konto.epicId))],
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

  const lb = await nochmal(() => json<{ entries?: Platz[] }>(bestenlisteAbruf(new Request(
    `${SEITE}/api/cup-leaderboard?event=${encodeURIComponent(f.eventId)}&window=${encodeURIComponent(f.windowId)}`))));
  if (!lb) {
    void schickeAlarm({ titel: '/cup laedt nicht', text: `${c.titel} (${region}) · ${f.windowId}: cup-leaderboard antwortete nach drei Versuchen nicht.` }).catch(() => null);
    return {
      embeds: [{ title: 'Standings are loading slower than usual', description: `We could not load **${c.titel}** (${region}) just now - please try again in a minute.`, color: FARBE }],
      components: [knopf('Open on CompHub', link)],
    };
  }
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
    embeds: [statsAnleitung()],
    components: [knopf('Open thecomphub.com', `${SEITE}/statistics`)],
  };
}

/*
 * Beim Laden des Moduls (der Waechter klopft alle zwei Minuten an die Route, scripts/dauerbetrieb.ps1) gleich den Namensvorrat und den Bestand der
 * Bestenlisten anwerfen - sonst ist die erste Vorschlagsliste nach einem Neustart kalt. Nicht beim Bauen (next build laedt die Module auch).
 */
if (process.env.NEXT_PHASE !== 'phase-production-build' && !process.env.COMPHUB_KEIN_HINTERGRUND) {
  setTimeout(() => { try { namenVorwaermen(); bestandVorwaermen(); void cups(0).catch(() => null); } catch { /* beim naechsten Befehl */ } }, 5_000).unref?.();
}
