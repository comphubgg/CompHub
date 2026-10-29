import { findeSpieler, getToken, holeSeite, MAX_PAGES, gecacht } from '@/lib/epicCups';
import { GET as katalogAbruf } from '@/app/api/cup-catalog/route';
import { replayRegel } from '@/lib/replayRegel.mjs';

/*
 * Der Match-ID-Finder fuer VIPs (Betreiber, 27.10.2026): "wenn man in einem Performance-Open-Cup von einem Spieler seine Match-ID will ... anzeigen, ob live
 * oder nicht live, dann kann man die Match-ID kopieren und ingame schauen - VIP only + Dashboard, Spieler als Favoriten - und das nicht erst, wenn er tot
 * ist, sondern sobald die Lobby eroeffnet wurde".
 *
 * Zwei Quellen, beide von Epic:
 *   - die Bestenliste des laufenden Cups: je Team die gespielten Matches mit ihrer Kennung (= Match-ID) und, auf derselben Seite, "liveSessions" - die
 *     Matches, in denen Teams gerade spielen. Die Bestenliste nennt ein Team erst nach seinem ersten Spiel.
 *   - Epics Sitzungssuche (matchmaking/session/findPlayer): die Sitzung, in der ein Konto gerade ist - auch vor dem ersten gewerteten Spiel.
 * Beides wurde am 29.10.2026 ausserhalb eines Cups geprueft (leer, wie erwartet); wie "liveSessions" waehrend eines Cups aufgebaut ist, steht erst beim
 * ersten echten Lauf fest - deshalb wird es hier tolerant gelesen und der Admin sieht den Rohwert.
 */

export interface FinderMatch { matchId: string; ende: string | null; platz: number | null; elims: number | null; windowId: string; titel: string }
export interface FinderLive { matchId: string; quelle: 'bestenliste' | 'sitzung'; windowId: string | null; titel: string | null; playlist: string | null; seit: string | null }
export interface FinderSpieler { live: FinderLive | null; matches: FinderMatch[]; rang: number | null; punkte: number | null; windowId: string | null }
export interface FinderCup { windowId: string; eventId: string; titel: string; region: string; live: boolean }

const FINDE = 'https://fngw-mcp-gc-livefn.ol.epicgames.com/fortnite/api/matchmaking/session/findPlayer/';
/** Beendete Fenster zaehlen noch so lange mit - ihre letzten Matches stehen dann weiter da. */
const NACHLAUF_MS = 3 * 3600_000;

interface KatalogFenster { windowId: string; eventId: string; region: string; status: string; begin?: number; end?: number }

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

export async function finde(ids: string[], mitRohwert = false): Promise<{ cups: FinderCup[]; spieler: Record<string, FinderSpieler>; roh?: unknown[] }> {
  const schluessel = `finder|${[...ids].sort().join(',')}|${mitRohwert ? 'roh' : ''}`;
  return gecacht(schluessel, 15_000, () => findeFrisch(ids, mitRohwert));
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
