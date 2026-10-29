import { gecacht } from '@/lib/epicCups';

/*
 * Laufende Scrims von Noble Practice - fuer den Match-ID-Finder (Betreiber, 29.10.2026: "rein hypothetisch muesste es gehen ... auf Noble bzw. ueber
 * Yunite wird die Match-ID angezeigt ... Juu ist gerade sogar erster Platz in dieser Session").
 *
 * Alles oeffentlich und ohne Anmeldung (so laedt es nobleprac.com selbst):
 *   map.nobleprac.com/api/sessions?guildId=<server>   die Sessions eines Servers, Status "progress" = laeuft
 *   map.nobleprac.com/api/session?id=<session>        dazu die Yunite-Kennung
 *   tournament.nobleprac.com/tournaments/<yunite>     das Session-Leaderboard: je Team Epic-Konten, Platz, Punkte und jedes Spiel
 *                                                     (Spielkennung - Noble zeigt nur die ersten vier Zeichen)
 *   wss://ws-map.nobleprac.com                        die Anmeldungen auf der Scrim-Karte (Discord-Namen) - schon vor dem ersten Spiel
 *
 * Gelesen wird hoechstens alle 30 Sekunden, fuer alle Favoriten zugleich.
 */

/** Die Noble-Server mit Scrims (aus nobleprac.com). */
const SERVER: Array<[string, string]> = [
  ['797443677403217940', 'Noble Pro Scrims'], ['858831001663963156', 'Noble X'], ['757573638995050608', 'Noble Division 1'],
  ['1539238647587405884', 'Noble Division 2'], ['902656971113644132', 'Noble Division 3'], ['1275856938940502047', 'Noble Division 0'],
  ['1403403384115040368', 'Noble Solos Closed'], ['1098721307077652630', 'Noble Solos'], ['854725181384556584', 'Noble Practice Scrims'],
];

export interface ScrimTreffer {
  session: string; server: string; platz: number | null; punkte: number | null; spiele: number; kills: number | null;
  /** Das letzte Spiel: Noble zeigt nur den Anfang der Kennung. */
  letztesSpiel: { code: string; ende: string | null; platz: number | null } | null;
  /** Nur angemeldet (Name auf der Scrim-Karte), noch kein gewertetes Spiel. */
  nurAngemeldet: boolean;
  link: string;
  beginn: string | null;
}

interface Session { sessionId: string; sessionName: string; createdAt: string; status: string }
interface LbTeam { placement: number; points: number; kills: number; players: Array<{ accountId: string; displayName: string }>; games: Array<{ sessionId: string; placement: number; timestamp: string }> }

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    return r.ok ? await r.json() as T : null;
  } catch { return null; }
}

/** Die Anmeldungen auf Nobles Scrim-Karte (Discord-Namen) - ueber den Websocket der Seite, hoechstens vier Sekunden. */
function anmeldungen(sessionId: string): Promise<string[]> {
  return new Promise((fertig) => {
    let ws: WebSocket | null = null;
    const ende = (namen: string[]) => { try { ws?.close(); } catch { /* egal */ } fertig(namen); };
    const uhr = setTimeout(() => ende([]), 4_000);
    try {
      ws = new WebSocket('wss://ws-map.nobleprac.com');
      ws.addEventListener('open', () => ws?.send(JSON.stringify({ event: 'connection', token: null, sessionId })));
      ws.addEventListener('message', (ev) => {
        try {
          const j = JSON.parse(String(ev.data)) as { event?: string; teams?: Array<{ username?: string }> };
          if (j.event !== 'connection-confirmed') return;
          clearTimeout(uhr);
          ende((j.teams ?? []).map((t) => t.username ?? '').filter(Boolean));
        } catch { /* weiter warten */ }
      });
      ws.addEventListener('error', () => { clearTimeout(uhr); ende([]); });
    } catch { clearTimeout(uhr); ende([]); }
  });
}

interface LaufendeSession { id: string; name: string; server: string; yunite: string | null; beginn: string; leaderboard: LbTeam[]; angemeldet: string[] }

/** Alle laufenden Noble-Sessions mit Leaderboard und Anmeldungen - 30 Sekunden im Vorrat. */
export async function laufendeScrims(): Promise<LaufendeSession[]> {
  return gecacht('noble|scrims', 30_000, async () => {
    const listen = await Promise.all(SERVER.map(async ([gilde, server]) => {
      const j = await json<{ sessionDatas?: Session[] }>(`https://map.nobleprac.com/api/sessions?guildId=${gilde}`);
      // Nur, was laeuft und heute begonnen hat (alte Sessions bleiben bei Noble manchmal auf "progress" stehen).
      return (j?.sessionDatas ?? []).filter((s) => s.status === 'progress' && Date.now() - Date.parse(s.createdAt) < 8 * 3600_000).map((s) => ({ s, server }));
    }));
    return Promise.all(listen.flat().map(async ({ s, server }) => {
      const d = await json<{ sessionData?: { yuniteId?: string } }>(`https://map.nobleprac.com/api/session?id=${s.sessionId}`);
      const yunite = d?.sessionData?.yuniteId ?? null;
      const [lb, angemeldet] = await Promise.all([
        yunite ? json<{ leaderboard?: LbTeam[] }>(`https://tournament.nobleprac.com/tournaments/${yunite}`) : Promise.resolve(null),
        anmeldungen(s.sessionId),
      ]);
      return { id: s.sessionId, name: s.sessionName, server, yunite, beginn: s.createdAt, leaderboard: lb?.leaderboard ?? [], angemeldet };
    }));
  });
}

/** Namen vergleichbar (wie die Spielersuche): Doppelgaenger-Zeichen wie normale, ohne Clan-Kuerzel-Leerraum. */
const DOPPEL: Record<string, string> = { 'ǃ': '!', 'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'і': 'i', 'к': 'k', 'м': 'm', 'т': 't' };
const vergleichbar = (s: string) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[ǃаеорсхуікмт]/g, (c) => DOPPEL[c] ?? c);

/**
 * Die Favoriten in laufenden Scrims: im Leaderboard ueber die Epic-Konto-Id (sicher), sonst ueber den Namen auf der Anmeldeliste (ab dem ersten Spiel
 * steht er dann auch im Leaderboard).
 */
export async function scrimsVon(favoriten: Array<{ id: string; namen: string[] }>): Promise<Record<string, ScrimTreffer>> {
  const sessions = await laufendeScrims().catch(() => []);
  const raus: Record<string, ScrimTreffer> = {};
  for (const s of sessions) {
    const link = s.yunite ? `https://nobleprac.com/leaderboards/${s.yunite}` : 'https://nobleprac.com';
    for (const f of favoriten) {
      if (raus[f.id] && !raus[f.id].nurAngemeldet) continue;
      const team = s.leaderboard.find((t) => t.players.some((p) => p.accountId?.toLowerCase() === f.id));
      if (team) {
        const spiele = [...team.games].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
        raus[f.id] = {
          session: s.name, server: s.server, platz: team.placement, punkte: team.points, spiele: team.games.length, kills: team.kills,
          letztesSpiel: spiele[0] ? { code: spiele[0].sessionId, ende: spiele[0].timestamp ?? null, platz: spiele[0].placement ?? null } : null,
          nurAngemeldet: false, link, beginn: s.beginn,
        };
        continue;
      }
      // Nur der Name: das ganze Wort muss vorkommen ("t3eny" in "AUR t3eny"), mindestens drei Zeichen.
      const namen = f.namen.map(vergleichbar).filter((n) => n.length >= 3);
      const angemeldet = s.angemeldet.some((a) => {
        const w = vergleichbar(a).split(/[\s|·.,_-]+/);
        return namen.some((n) => w.includes(n) || vergleichbar(a) === n);
      });
      if (angemeldet && !raus[f.id]) {
        raus[f.id] = { session: s.name, server: s.server, platz: null, punkte: null, spiele: 0, kills: null, letztesSpiel: null, nurAngemeldet: true, link, beginn: s.beginn };
      }
    }
  }
  return raus;
}
