import { findeSpieler, getToken, holeSeite, MAX_PAGES, gecacht, loeseNamenAuf } from '@/lib/epicCups';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { replayRegel } from '@/lib/replayRegel.mjs';
import { scrimsVon, type ScrimTreffer } from '@/lib/scrimsNoble';
import { freundesStatus, dienstAbruf, type FreundStatus } from '@/lib/epicFreundeStatus';
import { epicNamen } from '@/lib/epicNamenVorrat';
import { merke, verlaufVon, titelNachtragen, type VerlaufEintrag } from '@/lib/matchVerlauf';

/*
 * Der Match-ID-Finder fuer VIPs (Betreiber, 27.10.2026): "wenn man in einem Performance-Open-Cup von einem Spieler seine Match-ID will ... anzeigen, ob live
 * oder nicht live, dann kann man die Match-ID kopieren und ingame schauen - VIP only + Dashboard, Spieler als Favoriten - und das nicht erst, wenn er tot
 * ist, sondern sobald die Lobby eroeffnet wurde".
 *
 * Mehrere Quellen, alle von Epic (Reihenfolge in finde(): Live-Sitzung, dann Freund, dann Rangliste):
 *   - die Bestenliste des laufenden Cups: je Team die gespielten Matches mit ihrer Kennung (= Match-ID) und, auf derselben Seite, "liveSessions" - die
 *     Matches, in denen Teams gerade spielen. Die Bestenliste nennt ein Team erst nach seinem ersten Spiel.
 *   - Epics Sitzungssuche (matchmaking/session/findPlayer): die Sitzung, in der ein Konto gerade ist - auch vor dem ersten gewerteten Spiel.
 *   - der Freund-Status (lib/epicFreundeStatus, XMPP): die laufende Sitzung eines Freundes des Bot-Kontos "comphub." - schon in der Aufwaermphase, vor dem ersten Kill.
 *   - die RANGLISTE (quelle 'rangliste', seit 19.11.2026): die neueste Sitzung aus dem Bestenlisten-Verlauf eines Teams. Das ist die einzige Quelle, die
 *     OHNE Freundschaft fuer JEDES angemeldete Konto greift - aber erst nach dem ersten gewerteten Ereignis (Epics harte Grenze: davor fuehrt die
 *     Bestenliste das Team nicht). "liveSessions" und die Sitzungssuche sind fuer Fremde leer (geprueft Clix, 7.11.2026); die Rangliste schliesst diese Luecke.
 * Ausserhalb eines Cups ist alles leer (29.10.2026 geprueft, wie erwartet); "liveSessions" wird tolerant gelesen, der Admin sieht zusaetzlich den Rohwert.
 */

export interface FinderMatch { matchId: string; ende: string | null; platz: number | null; elims: number | null; windowId: string; titel: string }
export interface FinderLive { matchId: string; quelle: 'bestenliste' | 'sitzung' | 'freund' | 'rangliste'; windowId: string | null; titel: string | null; playlist: string | null; seit: string | null }
export interface FinderSpieler { live: FinderLive | null; matches: FinderMatch[]; rang: number | null; punkte: number | null; windowId: string | null; scrim?: ScrimTreffer | null }
export interface FinderCup { windowId: string; eventId: string; titel: string; region: string; live: boolean }

const FINDE = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer/';
/** Beendete Fenster zaehlen noch so lange mit - ihre letzten Matches stehen dann weiter da. */
const NACHLAUF_MS = 3 * 3600_000;
/*
 * Stellschraube (Betreiber): wie lange ein Finder-Ergebnis wiederverwendet wird, bevor Epic erneut gefragt wird. Kurz, damit die Rangliste-Match-ID
 * Sekunden nach dem ersten gewerteten Ereignis erscheint - lang genug, dass mehrere offene Seiten Epic nicht gleichzeitig durch alle hundert
 * Bestenlisten-Seiten jagen. Die Bestenlisten-Seiten selbst sind in lib/epicCups gestaffelt und einzeln gecacht (Seite 0 alle 3 s).
 */
const FINDER_CACHE_MS = 15_000;

interface KatalogFenster { windowId: string; eventId: string; region: string; status: string; begin?: number; end?: number; playlist?: string }

/** Alle Fenster des Katalogs (auch Ranked und niedrige Divisionen) mit Zeit und Playlist - um eine Sitzung ihrem Cup zuzuordnen. */
interface CupFenster { windowId: string; titel: string; region: string; begin: number; end: number; playlist: string }
async function cupFenster(): Promise<CupFenster[]> {
  return gecacht('finder|fenster', 5 * 60_000, async () => {
    const katalog = await (await katalogAbruf(new Request('http://localhost/api/cup-catalog?modus=alle'))).json() as {
      cups?: Array<{ titel?: string; regionen?: Record<string, KatalogFenster[]> }>;
    };
    const raus: CupFenster[] = [];
    for (const cup of katalog.cups ?? []) {
      for (const liste of Object.values(cup.regionen ?? {})) {
        for (const w of liste) {
          if (!w.begin || !w.end) continue;
          raus.push({ windowId: w.windowId, titel: cup.titel ?? w.windowId, region: w.region, begin: w.begin, end: w.end, playlist: w.playlist ?? '' });
        }
      }
    }
    return raus;
  });
}

const playlistKern = (p: string | null | undefined) => String(p ?? '').toLowerCase().replace(/^playlist_/, '');
/*
 * Der Cup zu einer Sitzung: ein Fenster mit derselben Playlist, in dem die Sitzung begann (10 min vorher bis 30 min nach dem Ende - Lobbys oeffnen frueh,
 * das letzte Match laeuft ueber). Mehrere (Regionen desselben Cups): das, in dem sie begann. Ohne passende Playlist: nichts - dann zeigt die Seite die
 * Playlist ("Tournament - Solo", "Ranked").
 */
function cupFuer(e: { von: string; playlist: string | null }, fenster: CupFenster[]): { windowId: string; titel: string } | null {
  const t = Date.parse(e.von) || 0;
  const pl = playlistKern(e.playlist);
  if (!t || !pl) return null;
  const passend = fenster.filter((w) => playlistKern(w.playlist) === pl && t >= w.begin - 10 * 60_000 && t <= w.end + 30 * 60_000);
  if (!passend.length) return null;
  const drin = passend.filter((w) => t >= w.begin && t <= w.end);
  const w = (drin.length ? drin : passend).sort((a, b) => Math.abs(t - a.begin) - Math.abs(t - b.begin))[0];
  return { windowId: w.windowId, titel: w.titel };
}

/** Der Verlauf der Konten (neueste zuerst): vorher den Stand des XMPP-Dienstes uebernehmen (ein Abruf) und fehlende Cup-Titel nachtragen. */
export async function verlaufFuer(ids: string[], vomDienst?: Record<string, VerlaufEintrag[]> | null): Promise<Record<string, VerlaufEintrag[]>> {
  if (!ids.length) return {};
  const dienst = vomDienst !== undefined ? vomDienst
    : (await dienstAbruf<{ verlauf?: Record<string, VerlaufEintrag[]> }>(`/verlauf?ids=${ids.join(',')}`))?.verlauf ?? null;
  if (dienst) await merke(Object.fromEntries(Object.entries(dienst).map(([id, l]) => [id, l.map((e) => ({ ...e, quelle: 'freund' as const }))])));
  const v = await verlaufVon(ids);
  const offen = Object.values(v).some((l) => l.some((e) => !e.titel && e.playlist));
  if (offen) {
    const fenster = await cupFenster().catch(() => [] as CupFenster[]);
    for (const [id, l] of Object.entries(v)) {
      for (const e of l) {
        if (e.titel || !e.playlist) continue;
        const c = cupFuer(e, fenster);
        if (c) { e.titel = c.titel; e.windowId = c.windowId; void titelNachtragen(id, e.matchId, c.windowId, c.titel); }
      }
    }
  }
  return v;
}

/** Die Live-Angabe aus dem Status eines Freundes - mit dem Cup, wenn er sich zuordnen laesst, sonst Epics Statuszeile. */
function freundLive(f: FreundStatus, fenster: CupFenster[]): FinderLive | null {
  if (!f.sessionId) return null;
  const c = cupFuer({ von: f.seit ?? new Date().toISOString(), playlist: f.playlist }, fenster);
  return { matchId: f.sessionId, quelle: 'freund', windowId: c?.windowId ?? null, titel: c?.titel ?? (f.zeile || null), playlist: f.playlist, seit: f.seit };
}

/** Die Live-Funde des Finders in den Verlauf (alle Quellen). */
function liveMerken(spieler: Record<string, { live: FinderLive | null }>) {
  const jetzt = new Date().toISOString();
  const funde: Record<string, VerlaufEintrag[]> = {};
  for (const [id, s] of Object.entries(spieler)) {
    const l = s.live;
    if (!l?.matchId) continue;
    funde[id] = [{
      matchId: l.matchId, von: l.seit ?? jetzt, bis: jetzt, playlist: l.playlist,
      windowId: l.windowId, titel: l.windowId ? l.titel : null, quelle: l.quelle,
    }];
  }
  void merke(funde).catch(() => {});
}

export interface FreundZeile {
  id: string; name: string; live: FinderLive | null; verlauf: VerlaufEintrag[];
  /** Eingeloggt - auch in der Lobby ohne Match (gruener Punkt), und was er gerade macht, wie in Fortnites Freundesliste (Betreiber, 25.11.2026). */
  online: boolean; zeile: string | null;
}

/*
 * Fuer den Admin (Betreiber, 17.11.2026): ALLE Epic-Freunde des Bot-Kontos "comphub." - NUR dieses Konto, nicht das persoenliche des Betreibers ("haupt",
 * 23.11.2026: er will seine eigenen Freunde/Match-IDs hier nicht dabei haben). Ohne sie als Favoriten anzulegen - Live-Status, Match-ID, Cup und Verlauf.
 * Ein einziger Abruf beim XMPP-Dienst (/freunde?alle=1: Status, Freundesliste, Verlauf), keine Epic-Abfrage je Freund; die Namen kommen gesammelt
 * (100 je Abfrage, im Vorrat gemerkt).
 */
export async function alleFreunde(): Promise<{ freunde: FreundZeile[]; quelle: 'dienst' | 'seite' }> {
  const d = await dienstAbruf<{ freunde?: Record<string, FreundStatus | null>; liste?: string[]; verlauf?: Record<string, VerlaufEintrag[]> }>('/freunde?alle=1');
  let status: Map<string, FreundStatus>;
  let liste: string[] = [];
  let quelle: 'dienst' | 'seite' = 'dienst';
  if (d) {
    status = new Map(Object.entries(d.freunde ?? {}).filter((e): e is [string, FreundStatus] => !!e[1]));
    liste = d.liste ?? [];
  } else {
    // Ohne Dienst (Entwicklung, Rueckfall): was dieser Prozess selbst sieht.
    status = (await freundesStatus().catch(() => null))?.freunde ?? new Map();
    quelle = 'seite';
  }
  const ids = [...new Set([...liste, ...status.keys(), ...Object.keys(d?.verlauf ?? {})])].filter((x) => /^[0-9a-f]{32}$/.test(x));
  const [verlauf, fenster, namen] = await Promise.all([
    verlaufFuer(ids, d ? d.verlauf ?? {} : null),
    cupFenster().catch(() => [] as CupFenster[]),
    getToken().then(({ token }) => loeseNamenAuf(ids, token)).catch(async () => {
      const v = await epicNamen();
      return Object.fromEntries(ids.map((id) => [id, v[id] ?? id.slice(0, 8)]));
    }),
  ]);
  const freunde: FreundZeile[] = ids.map((id) => {
    const f = status.get(id);
    // Aeltere Dienst-Staende kennen "online" nicht: "abgemeldet" leert dort die Statuszeile, also heisst eine Zeile (oder eine Match-ID) eingeloggt.
    const online = !!f && (f.online ?? (!!f.zeile || !!f.sessionId));
    return {
      id, name: namen[id] ?? id.slice(0, 8), live: f ? freundLive(f, fenster) : null, verlauf: (verlauf[id] ?? []).slice(0, 20),
      online, zeile: online && f?.zeile ? f.zeile : null,
    };
  });
  liveMerken(Object.fromEntries(freunde.map((f) => [f.id, f])));
  freunde.sort((a, b) => Number(!!b.live) - Number(!!a.live) || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { freunde, quelle };
}

/** Die Cups, die gerade laufen oder vor kurzem endeten - ohne die, fuer die keine Replays geholt werden (Ranked, niedrige Divisionen). */
export async function finderCups(): Promise<FinderCup[]> {
  return gecacht('finder|cups', 60_000, async () => {
    const katalog = await (await katalogAbruf(new Request('http://localhost/api/cup-catalog?modus=alle'))).json() as {
      cups?: Array<{ id?: string; titel?: string; regionen?: Record<string, KatalogFenster[]> }>;
    };
    const jetzt = Date.now();
    const raus: FinderCup[] = [];
    for (const cup of katalog.cups ?? []) {
      if (replayRegel(cup) === 'nichts') continue;
      for (const liste of Object.values(cup.regionen ?? {})) {
        for (const w of liste) {
          const live = w.status === 'live';
          if (!live && !(w.status === 'vorbei' && jetzt - (w.end ?? 0) < NACHLAUF_MS)) continue;
          raus.push({ windowId: w.windowId, eventId: w.eventId, titel: cup.titel ?? w.windowId, region: w.region, live });
        }
      }
    }
    return raus.sort((a, b) => Number(b.live) - Number(a.live)).slice(0, 16);
  });
}

/** In "liveSessions" nach dem Team oder einem seiner Konten suchen - als Objekt (Schluessel -> Sitzung) oder als Liste. */
function liveAus(roh: unknown, ids: string[], teamId: string | null): string | null {
  if (!roh || typeof roh !== 'object') return null;
  const kennung = (v: unknown): string | null => {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const s = o.sessionId ?? o.id ?? o.liveSessionId;
      return typeof s === 'string' ? s : null;
    }
    return null;
  };
  const enthaelt = (v: unknown) => { const s = JSON.stringify(v); return ids.some((id) => s.includes(id)); };
  if (Array.isArray(roh)) {
    for (const v of roh) if (enthaelt(v)) return kennung(v);
    return null;
  }
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if ((teamId && k === teamId) || ids.some((id) => k.includes(id)) || enthaelt(v)) return kennung(v) ?? (/^[0-9a-f]{32}$/i.test(k) ? k : null);
  }
  return null;
}

/** Die Sitzung, in der ein Konto gerade ist (Epics Sitzungssuche) - oder null. */
async function sitzungVon(id: string): Promise<FinderLive | null> {
  try {
    const { token } = await getToken();
    const r = await fetch(FINDE + id, { headers: { Authorization: token }, cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const liste = await r.json() as Array<{ id?: string; started?: boolean; lastUpdated?: string; attributes?: Record<string, unknown> }>;
    const s = Array.isArray(liste) ? liste.find((x) => typeof x.id === 'string') : null;
    if (!s?.id) return null;
    const playlist = s.attributes?.PLAYLISTNAME_s;
    return { matchId: s.id, quelle: 'sitzung', windowId: null, titel: null, playlist: typeof playlist === 'string' ? playlist : null, seit: s.lastUpdated ?? null };
  } catch { return null; }
}

/*
 * Wer in einem Cup nicht mitspielt, wird dort drei Minuten lang nicht noch einmal gesucht: sonst blaettert jede Abfrage alle hundert Seiten eines offenen
 * Cups durch, nur um festzustellen, dass der Favorit nicht dabei ist.
 */
const nichtDabei = new Map<string, number>();
const NICHT_DABEI_MS = 3 * 60_000;

export async function finde(ids: string[], mitRohwert = false, namen: Record<string, string> = {}): Promise<{ cups: FinderCup[]; spieler: Record<string, FinderSpieler>; roh?: unknown[]; verlauf: Record<string, VerlaufEintrag[]> }> {
  const schluessel = `finder|${[...ids].sort().join(',')}|${mitRohwert ? 'roh' : ''}`;
  const [r, scrims] = await Promise.all([
    gecacht(schluessel, FINDER_CACHE_MS, () => findeFrisch(ids, mitRohwert)),
    // Laufende Scrims (Noble): ueber die Epic-Konto-Id im Session-Leaderboard, vor dem ersten Spiel ueber den Namen auf der Anmeldeliste.
    (async () => {
      const aktuell = await epicNamen();
      return scrimsVon(ids.map((id) => ({ id, namen: [namen[id] ?? '', aktuell[id] ?? ''].filter(Boolean) }))).catch(() => ({} as Record<string, ScrimTreffer>));
    })(),
  ]);
  /*
   * Kein Turnier-Game, aber ein Freund des CompHub-Kontos in einem Game: die volle Match-ID aus seinem Epic-Status (Scrims, Pubs, Ranked, Custom).
   * Nur fuer Freunde dieses Kontos - Epic schickt den Status niemandem sonst.
   */
  const [freunde, fenster] = await Promise.all([
    freundesStatus().then((x) => x.freunde).catch(() => new Map<string, FreundStatus>()),
    cupFenster().catch(() => [] as CupFenster[]),
  ]);
  const spieler = Object.fromEntries(Object.entries(r.spieler).map(([id, s]) => {
    const f = freunde.get(id.toLowerCase());
    const fl = f ? freundLive(f, fenster) : null;
    /*
     * Der Freund-Status ist die schnellste Quelle - Epic schickt ihn schon in der Aufwaermphase, vor dem ersten Kill - und geht darum vor der Rangliste
     * (die erst nach dem ersten gewerteten Ereignis etwas hat). Epics eigene Live-Sitzungen (bestenliste/sitzung) bleiben wie bisher ganz vorn.
     */
    const live = (s.live && s.live.quelle !== 'rangliste') ? s.live : (fl ?? s.live);
    return [id, { ...s, live, scrim: scrims[id] ?? null, freund: freunde.has(id.toLowerCase()) }];
  }));
  // Jede gesehene Sitzung bleibt im Verlauf (Betreiber, 17.11.2026) - auch nachdem der Spieler das Match verlassen hat.
  liveMerken(spieler);
  const verlauf = await verlaufFuer(ids).catch(() => ({} as Record<string, VerlaufEintrag[]>));
  return { ...r, spieler, verlauf };
}

async function findeFrisch(ids: string[], mitRohwert: boolean): Promise<{ cups: FinderCup[]; spieler: Record<string, FinderSpieler>; roh?: unknown[] }> {
  const cups = await finderCups().catch(() => [] as FinderCup[]);
  const spieler: Record<string, FinderSpieler> = Object.fromEntries(ids.map((id) => [id, { live: null, matches: [], rang: null, punkte: null, windowId: null }]));
  const roh: unknown[] = [];

  // Je Cup einmal durch die Bestenliste, alle Favoriten zugleich (findeSpieler merkt sich, auf welcher Seite sie standen).
  await Promise.all(cups.map(async (c) => {
    const jetzt = Date.now();
    const gesucht = ids.filter((id) => (nichtDabei.get(`${c.windowId}|${id}`) ?? 0) < jetzt);
    if (!gesucht.length) return;
    try {
      const r = await findeSpieler(c.eventId, c.windowId, [], gesucht, c.live ? MAX_PAGES : 20);
      const gefunden = new Set(r.entries.flatMap((e) => e.players.map((p) => p.id)));
      for (const id of gesucht) if (!gefunden.has(id)) nichtDabei.set(`${c.windowId}|${id}`, jetzt + NICHT_DABEI_MS);
      for (const e of r.entries) {
        const seite = c.live && e.page !== undefined ? await holeSeite(c.eventId, c.windowId, e.page, true).catch(() => null) : null;
        if (seite?.liveSessions && mitRohwert && roh.length < 3) roh.push({ windowId: c.windowId, page: e.page, liveSessions: seite.liveSessions });
        for (const p of e.players) {
          const s = spieler[p.id];
          if (!s) continue;
          for (const m of e.matches) {
            if (!m.sessionId) continue;
            s.matches.push({ matchId: m.sessionId, ende: m.endTime ?? null, platz: m.placement ?? null, elims: m.elims ?? null, windowId: c.windowId, titel: c.titel });
          }
          if (c.live || s.rang === null) { s.rang = e.rank; s.punkte = e.points; s.windowId = c.windowId; }
          const live = seite ? liveAus(seite.liveSessions, e.players.map((x) => x.id), e.teamId) : null;
          if (live && !e.matches.some((m) => m.sessionId === live)) {
            s.live = { matchId: live, quelle: 'bestenliste', windowId: c.windowId, titel: c.titel, playlist: null, seit: null };
          }
          /*
           * Rangliste - OHNE Freundschaft: die neueste Sitzung aus dem Bestenlisten-Verlauf des Teams. Sie steht fuer jedes angemeldete Team da,
           * sobald Epic sie wertet - also Sekunden nach dem ersten gewerteten Ereignis (erstem Kill/erster Platzierung); vorher fuehrt Epic das Team
           * gar nicht in der Liste. Nur fuer laufende Cups, und nur als Rueckfall: Epics Live-Sitzungen (oben) und der Freund-Status (in finde()) gehen vor.
           */
          if (c.live && !s.live) {
            const neuste = [...e.matches].filter((m) => m.sessionId)
              .sort((a, b) => (Date.parse(b.endTime ?? '') || Date.now()) - (Date.parse(a.endTime ?? '') || Date.now()))[0];
            if (neuste?.sessionId) {
              s.live = { matchId: neuste.sessionId, quelle: 'rangliste', windowId: c.windowId, titel: c.titel, playlist: null, seit: neuste.endTime ?? null };
            }
          }
        }
      }
    } catch { /* dieser Cup gerade nicht lesbar - die anderen zaehlen */ }
  }));

  // Wer in keiner Bestenliste live steht: Epics Sitzungssuche (auch vor dem ersten gewerteten Spiel).
  await Promise.all(ids.filter((id) => !spieler[id].live).map(async (id) => { spieler[id].live = await sitzungVon(id); }));
  for (const s of Object.values(spieler)) {
    s.matches.sort((a, b) => (Date.parse(b.ende ?? '') || 0) - (Date.parse(a.ende ?? '') || 0));
    s.matches = s.matches.slice(0, 12);
  }
  return { cups, spieler, ...(mitRohwert ? { roh } : {}) };
}
