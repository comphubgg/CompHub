// Scrims der Community-Server - ueber Yunite.
//
// Noble, Vital, Manu und die anderen veranstalten ihre Scrims mit Yunite
// (yunite.xyz), einem Discord-Bot. Was Fortnite Tracker unter "Community
// Events" zeigt, kommt von dort - nicht von Epic. Der Betreiber wollte
// dasselbe auf seiner Seite: "wirklich Scrims Games unter Events ... wenn
// sie live sind, sieht das dann mit dem Leaderboard aus, mit Statistics wie
// Wins, Matches, Points."
//
// Wie der Zugang funktioniert:
//
//   - Eine App bei Yunite (Entwicklerportal) hat genau einen Schluessel,
//     hier YUNITE_TOKEN. Er steht in .env.local, nie im Verzeichnis.
//   - Jeder Discord-Server schaltet die App einzeln frei und vergibt dabei
//     Rechte; fuer alles hier genuegt READ_TOURNAMENTS.
//   - Der Server braucht Yunite-Premium. Ohne das antwortet Yunite mit 402,
//     und zwar fuer diesen Server allein - deshalb sagt die Oberflaeche das
//     je Server und nicht als allgemeiner Fehler.
//
// Yunites Nutzungsregeln: nichts dauerhaft speichern, ein Zwischenspeicher
// darf nach Stunden ablaufen, aber nicht auf die Platte. Deshalb liegt hier
// alles nur im Arbeitsspeicher des Vorgangs (gecacht), und nichts davon geht
// in die Ablage. Ausgenommen sind laut Doku ausdruecklich die Bestenlisten
// ("You MAY store leaderboard data permanently") - auch die werden hier
// aber nur gehalten, solange sie frisch sind.

import { gecacht } from '@/lib/epicCups';

const BASIS = 'https://yunite.xyz/api/v3';
const FRIST_MS = 20_000;

export function yuniteDa(): boolean {
  return Boolean((process.env.YUNITE_TOKEN ?? '').trim());
}

/** Der Server hat kein Yunite-Premium - ohne das gibt Yunite seine Daten nicht heraus. */
export class KeinPremium extends Error {
  constructor(public guildId: string) {
    super('Dieser Discord-Server hat kein Yunite-Premium.');
    this.name = 'KeinPremium';
  }
}

/** Die App ist auf diesem Server nicht (mehr) freigeschaltet. */
export class NichtFreigegeben extends Error {
  constructor(public guildId: string) {
    super('Die App ist auf diesem Server nicht freigeschaltet.');
    this.name = 'NichtFreigegeben';
  }
}

export class YuniteFehlt extends Error {
  constructor() { super('YUNITE_TOKEN fehlt - ohne Schluessel keine Scrims.'); this.name = 'YuniteFehlt'; }
}

/*
 * Rate-Limits: Yunite schickt je Antwort einen "Bucket", wie viele Anfragen
 * darin noch frei sind und wann er sich zuruecksetzt. Die Doku verlangt
 * ausdruecklich, sich danach zu richten und nichts fest einzubauen ("Repeated
 * violation of rate-limits will result in a permanent ban of your
 * application"). Also gemerkt je Bucket, und wenn nichts mehr frei ist, wird
 * gewartet.
 */
const buckets = new Map<string, { frei: number; bis: number }>();

async function warteAufBucket(name: string | null) {
  if (!name) return;
  const b = buckets.get(name);
  if (!b || b.frei > 0) return;
  const rest = b.bis - Date.now();
  if (rest > 0) await new Promise((r) => setTimeout(r, Math.min(rest + 50, 10_000)));
}

async function ruf<T>(pfad: string, guildId?: string): Promise<T> {
  const token = (process.env.YUNITE_TOKEN ?? '').trim();
  if (!token) throw new YuniteFehlt();

  for (let versuch = 0; ; versuch += 1) {
    const r = await fetch(`${BASIS}${pfad}`, {
      headers: { 'Y-Api-Token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(FRIST_MS),
    });

    const bucket = r.headers.get('Y-RateLimit-Bucket');
    if (bucket) {
      buckets.set(bucket, {
        frei: Number(r.headers.get('Y-RateLimit-Permits') ?? 1),
        bis: Date.now() + Number(r.headers.get('Y-RateLimit-ResetIn') ?? 0),
      });
    }

    if (r.status === 429) {
      // Yunite nennt selbst, wie lange zu warten ist.
      const wieder = Number((await r.json().catch(() => ({})))?.retryIn ?? 2000);
      if (versuch >= 2) throw new Error('Yunite drosselt gerade.');
      await new Promise((x) => setTimeout(x, Math.min(wieder + 50, 15_000)));
      continue;
    }
    if (r.status === 402) throw new KeinPremium(guildId ?? '');
    if (r.status === 403 || r.status === 404) throw new NichtFreigegeben(guildId ?? '');
    if (r.status === 401) throw new YuniteFehlt();
    if (!r.ok) throw new Error(`Yunite ${r.status} bei ${pfad}`);
    await warteAufBucket(bucket);
    return await r.json() as T;
  }
}

/* ------------------------------------------------------------ Die Server */

export interface YuniteServer {
  guildId: string;
  name: string;
  bild: string | null;
  rechte: string[];
}

/**
 * Die Server, die die App freigeschaltet haben.
 *
 * Zehn Minuten gemerkt: eine Freigabe kommt selten, und der Name je Server
 * kostet Yunite spuerbar Zeit ("this will significantly slow down your
 * request").
 */
export async function server(): Promise<YuniteServer[]> {
  return gecacht('yunite|app', 10 * 60_000, async () => {
    const j = await ruf<{
      authorizedGuilds?: Array<{ guildId: string; guildName?: string; guildAvatar?: string; permissions?: string[] }>;
    }>('/app?withGuildNames=true');
    return (j.authorizedGuilds ?? []).map((g) => ({
      guildId: g.guildId,
      name: g.guildName ?? g.guildId,
      bild: g.guildAvatar ?? null,
      rechte: g.permissions ?? [],
    }));
  });
}

/* --------------------------------------------------------- Die Turniere */

export interface YuniteTurnier {
  id: string;
  name: string;
  beschreibung?: string;
  bild?: string;
  /** Spieler je Team: 1 Solo, 2 Duo, 3 Trio, 4 Squad. */
  teamGroesse: number;
  region: string;
  beginn: number;
  ende: number;
  /** Epics Wertung: Punkte je Kill, Punkte je Platzierung, Kill-Grenze. */
  punkte?: { pointsPerKill?: number; killCap?: number; pointsPerPlacement?: unknown };
  /** SCRIM oder TOURNAMENT - Yunite unterscheidet das selbst. */
  art: string;
  bauen?: string | null;
  spielart?: string | null;
  preispool?: unknown;
  /** Laeuft gerade - aus Beginn und Ende gegen die Uhr. */
  live: boolean;
  vorbei: boolean;
}

interface RohTurnier {
  id: string; name: string; description?: string; bannerUrl?: string;
  queueSize?: number; region?: string; startDate?: string; endDate?: string;
  pointSystem?: YuniteTurnier['punkte']; tournamentType?: string;
  buildMode?: string | null; gameMode?: string | null; prizePool?: unknown;
}

function formeTurnier(t: RohTurnier): YuniteTurnier {
  const beginn = Date.parse(t.startDate ?? '') || 0;
  const ende = Date.parse(t.endDate ?? '') || 0;
  const jetzt = Date.now();
  return {
    id: t.id,
    name: t.name,
    beschreibung: t.description,
    bild: t.bannerUrl,
    teamGroesse: t.queueSize ?? 1,
    region: (t.region ?? '').toUpperCase(),
    beginn,
    ende,
    punkte: t.pointSystem,
    art: t.tournamentType ?? 'TOURNAMENT',
    bauen: t.buildMode ?? null,
    spielart: t.gameMode ?? null,
    preispool: t.prizePool,
    live: beginn > 0 && jetzt >= beginn && (!ende || jetzt <= ende),
    vorbei: ende > 0 && jetzt > ende,
  };
}

/**
 * Die Turniere und Scrims eines Servers - die juengsten zuerst.
 *
 * Fuenf Minuten gemerkt. Waehrend eines laufenden Scrims aendert sich an
 * dieser Liste nichts; was sich aendert, steht in der Bestenliste.
 */
export async function turniere(guildId: string, seite = 1, proSeite = 100): Promise<{
  turniere: YuniteTurnier[]; seiten: number; gesamt: number;
}> {
  return gecacht(`yunite|turniere|${guildId}|${seite}|${proSeite}`, 5 * 60_000, async () => {
    const j = await ruf<{ tournaments?: RohTurnier[]; pagination?: { totalPages?: number; totalEntries?: number } }>(
      `/guild/${guildId}/tournaments?page=${seite}&pageSize=${proSeite}`, guildId);
    const liste = (j.tournaments ?? []).map(formeTurnier);
    return {
      turniere: liste,
      seiten: j.pagination?.totalPages ?? 1,
      gesamt: j.pagination?.totalEntries ?? liste.length,
    };
  });
}

/* ------------------------------------------------------- Die Bestenliste */

export interface YuniteTeam {
  teamId: string;
  spieler: Array<{ discordId?: string; epicId?: string; name: string }>;
  platz: number;
  punkte: number;
  elims: number;
  matches: number;
  siege: number;
  punkteAusPlatz: number;
  punkteAusElims: number;
  elimsJeMatch: number;
  schnittPlatz: number;
  /** Sekunden am Leben, aufsummiert und im Schnitt. */
  zeitGesamt: number;
  zeitSchnitt: number;
  spiele: Array<{
    platz: number; elims: number; zeit: number; punkte: number;
    sessionId: string; runde: number; zeitpunkt: number; zaehlt: boolean;
  }>;
}

interface RohTeam {
  teamId: string;
  users?: Array<{ discordId?: string; epicId?: string; name?: string }>;
  placement?: number; score?: number; kills?: number; countedKills?: number;
  games?: number; countedGames?: number; wins?: number; countedWins?: number;
  placementScore?: number; eliminationScore?: number; kpm?: number;
  averagePlacement?: number; sumSecondsSurvived?: number; averageSecondsSurvived?: number;
  gameList?: Array<{
    placement?: number; kills?: number; survivalTime?: number; score?: number;
    sessionId?: string; round?: number; timestamp?: string; counts?: boolean;
  }>;
}

/**
 * Die Bestenliste eines Turniers.
 *
 * Eine Minute gemerkt, solange es laeuft - der Betreiber will waehrend eines
 * Scrims zusehen koennen. Danach zehn Minuten; ein beendetes Scrim aendert
 * sich nur noch, wenn der Veranstalter von Hand nachtraegt.
 */
export async function bestenliste(guildId: string, turnierId: string, live = false): Promise<YuniteTeam[]> {
  return gecacht(`yunite|lb|${guildId}|${turnierId}`, live ? 60_000 : 10 * 60_000, async () => {
    const roh = await ruf<RohTeam[]>(`/guild/${guildId}/tournaments/${turnierId}/leaderboard`, guildId);
    return (roh ?? []).map((t) => ({
      teamId: t.teamId,
      spieler: (t.users ?? []).map((u) => ({
        discordId: u.discordId, epicId: u.epicId, name: u.name ?? '',
      })),
      platz: t.placement ?? 0,
      punkte: t.score ?? 0,
      elims: t.countedKills ?? t.kills ?? 0,
      matches: t.countedGames ?? t.games ?? 0,
      siege: t.countedWins ?? t.wins ?? 0,
      punkteAusPlatz: t.placementScore ?? 0,
      punkteAusElims: t.eliminationScore ?? 0,
      elimsJeMatch: t.kpm ?? 0,
      schnittPlatz: t.averagePlacement ?? 0,
      zeitGesamt: t.sumSecondsSurvived ?? 0,
      zeitSchnitt: t.averageSecondsSurvived ?? 0,
      spiele: (t.gameList ?? []).map((g) => ({
        platz: g.placement ?? 0, elims: g.kills ?? 0, zeit: g.survivalTime ?? 0,
        punkte: g.score ?? 0, sessionId: g.sessionId ?? '', runde: g.round ?? 0,
        zeitpunkt: Date.parse(g.timestamp ?? '') || 0, zaehlt: g.counts !== false,
      })),
    })).sort((a, b) => a.platz - b.platz);
  });
}

/* ----------------------------------------------------------- Die Matches */

export interface YuniteMatch {
  sessionId: string;
  zeitpunkt: number;
  gastgeber: string | null;
  spieler: number;
  gewertet: string;
  ignoriert: boolean;
}

/** Die Runden eines Turniers - die juengste zuerst, so wie Yunite sie liefert. */
export async function matches(guildId: string, turnierId: string, live = false): Promise<YuniteMatch[]> {
  return gecacht(`yunite|matches|${guildId}|${turnierId}`, live ? 60_000 : 10 * 60_000, async () => {
    const roh = await ruf<Array<{
      sessionId: string; timestamp?: string; host?: { name?: string } | null;
      players?: number; status?: string; ignored?: boolean;
    }>>(`/guild/${guildId}/tournaments/${turnierId}/matches`, guildId);
    return (roh ?? []).map((m) => ({
      sessionId: m.sessionId,
      zeitpunkt: Date.parse(m.timestamp ?? '') || 0,
      gastgeber: m.host?.name ?? null,
      spieler: m.players ?? 0,
      gewertet: m.status ?? 'NOT_SCORED',
      ignoriert: m.ignored === true,
    }));
  });
}
