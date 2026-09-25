/*
 * Poyo live - was heute kommt oder gerade laeuft, von scrims.poyocup.com.
 *
 * Beendete Sessions liegen im Archiv (scripts/scrims-holen.mjs, stuendlich).
 * Hier geht es um das, was das Archiv noch nicht haben kann: die Lobbys des
 * heutigen Tages, die erst anstehen ("in 14 minutes", Upcoming) oder gerade
 * gespielt werden. Der Betreiber (25.9.2026): "wenn du so zukuenftige
 * Upcoming ... anzeigen koenntest, waere auch noch geil."
 *
 * Offen, ohne Anmeldung und ohne Schluessel; gemerkt wird nur kurz im
 * Speicher, abgelegt nichts.
 */

const POYO = 'https://scrims.poyocup.com/api/view/servers';
const KOPF = { 'User-Agent': 'Mozilla/5.0 (CompHub; +https://www.thecomphub.com)' };
const GROESSE: Record<string, number> = { Solo: 1, Duo: 2, Trio: 3, Squad: 4 };

const vorrat = new Map<string, { bis: number; wert: unknown }>();

async function hole<W>(url: string, haltbarMs: number): Promise<W | null> {
  const da = vorrat.get(url);
  if (da && da.bis > Date.now()) return da.wert as W;
  const r = await fetch(url, { headers: KOPF, cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (r.status === 400 || r.status === 404) return null;
  if (!r.ok) throw new Error(`scrims.poyocup.com antwortet mit ${r.status}`);
  const wert = await r.json() as W;
  vorrat.set(url, { bis: Date.now() + haltbarMs, wert });
  if (vorrat.size > 200) vorrat.delete(vorrat.keys().next().value as string);
  return wert;
}

interface RohLobby {
  _id: string; status: string; sessionNumber: number; lobbyNumber: number;
  gameMode?: string; teamSize?: string; playerCount?: number; playerLimit?: number;
  registrationTime?: string; createdAt?: string;
}

export interface PoyoHeute {
  id: string; name: string; guildId: string; teamGroesse: number; modus: string | null;
  beginn: number; live: boolean; vorbei: boolean; spieler: number; plaetze: number;
}

/**
 * Heute ansteht oder laeuft - je Server, ohne das schon Beendete.
 * Ein Server, der nicht antwortet, steht unter "fehler" - nie als leere Liste.
 */
export async function poyoHeute(guildIds: string[]): Promise<{
  heute: Record<string, PoyoHeute[]>; fehler: Record<string, string>;
}> {
  const raus: Record<string, PoyoHeute[]> = {};
  const fehler: Record<string, string> = {};
  await Promise.all(guildIds.map(async (id) => {
    try {
      const d = await hole<{ sessions?: RohLobby[] }>(`${POYO}/${encodeURIComponent(id)}`, 60_000);
      raus[id] = (d?.sessions ?? [])
        .filter((s) => s.status !== 'ended')
        .map((s) => ({
          id: s._id, guildId: id,
          name: `Session ${s.sessionNumber} Lobby ${s.lobbyNumber}`,
          teamGroesse: GROESSE[s.teamSize ?? ''] ?? 0, modus: s.gameMode ?? null,
          beginn: Date.parse(s.registrationTime || s.createdAt || '') || 0,
          // "upcoming" wartet noch; alles andere, was nicht "ended" ist, laeuft.
          live: s.status !== 'upcoming', vorbei: false,
          spieler: s.playerCount ?? 0, plaetze: s.playerLimit ?? 0,
        }));
    } catch (e) { fehler[id] = (e as Error).message; }
  }));
  return { heute: raus, fehler };
}

/**
 * Eine Lobby, die das Archiv noch nicht hat - gerade laufend oder eben
 * vorbei. Dieselbe Form wie lib/scrimArchiv, damit die Seite nichts
 * unterscheiden muss.
 */
export async function poyoLobby(guildId: string, lobbyId: string) {
  const lb = await hole<{
    available?: boolean;
    tournament?: { name?: string; description?: string | null; totalGames?: number };
    standings?: Array<{
      rank: number; teamId: string; totalScore: number; totalKills: number;
      players?: Array<{ name: string; discordId?: string }>;
      games?: Array<{ placement: number; kills: number; score: number; sessionId: string }>;
    }>;
  }>(`${POYO}/${encodeURIComponent(guildId)}/lobby/${encodeURIComponent(lobbyId)}/leaderboard`, 60_000);
  if (!lb || lb.available === false) return null;
  const teams = (lb.standings ?? []).filter((x) => (x.games ?? []).length).map((x) => {
    const g = x.games ?? [];
    const n = g.length;
    return {
      teamId: x.teamId,
      spieler: (x.players ?? []).map((p) => ({ name: p.name, discordId: p.discordId, land: null })),
      platz: x.rank, punkte: x.totalScore, elims: x.totalKills, matches: n,
      siege: g.filter((s) => s.placement === 1).length,
      elimsJeMatch: n ? Math.round((x.totalKills / n) * 100) / 100 : 0,
      schnittPlatz: n ? Math.round((g.reduce((a, s) => a + s.placement, 0) / n) * 10) / 10 : 0,
      zeitSchnitt: 0,
      spiele: g.map((s) => ({
        platz: s.placement, elims: s.kills, punkte: s.score, zeitpunkt: 0, zaehlt: true, runde: s.sessionId,
      })),
    };
  });
  const runden = new Map<string, { sessionId: string; zeitpunkt: number; gastgeber: null;
    spieler: number; gewertet: 'SCORED'; ignoriert: false }>();
  for (const tm of teams) {
    for (const s of tm.spiele) {
      const r = runden.get(s.runde);
      if (r) r.spieler += tm.spieler.length;
      else runden.set(s.runde, { sessionId: s.runde, zeitpunkt: 0, gastgeber: null,
        spieler: tm.spieler.length, gewertet: 'SCORED', ignoriert: false });
    }
  }
  return {
    teams, runden: [...runden.values()],
    beschreibung: lb.tournament?.description || undefined,
  };
}
