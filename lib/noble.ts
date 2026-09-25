/*
 * Die Scrims von Noble Practice - echt, von nobleprac.com.
 *
 * Der Betreiber (25.9.2026): "kannst du irgendwie Webseite scripten, also so,
 * dass du das alles abliest von Leaderboards ... unter nobleprac.com ... dann
 * unter Scrims, dann unter Leaderboard findest du fuer jeden einzelnen Server
 * eigentlich alle Sessions." Die wichtigsten seien Division 1 und die Pro
 * Scrims, die Sessions sollen "genau gleich" heissen wie dort.
 *
 * Gelesen wird nicht die Seite, sondern die Adresse, von der sie selbst ihre
 * Daten holt (tournament.nobleprac.com) - offen, ohne Anmeldung und ohne
 * Schluessel. Je Server die letzten hundert Leaderboards, je Leaderboard die
 * Teams mit Konto-Id, Name und Land und jede einzelne Runde.
 *
 * Hier wird live gefragt und die Antwort ein paar Minuten im Speicher
 * gemerkt - fuer das, was gerade laeuft oder noch nicht gesammelt ist.
 * Beendete Sessions legt scripts/scrims-holen.mjs stuendlich ins Archiv
 * (lib/scrimArchiv), denn nobleprac.com gibt aeltere oft nicht mehr heraus.
 */

import { laenderVon } from '@/lib/scrimArchiv';

const QUELLE = 'https://tournament.nobleprac.com';

export interface NobleServer {
  guildId: string; name: string; logo: string;
  /** Offen fuer alle - viele Lobbys zugleich statt einer. */
  offen?: boolean;
  /** Gerade ohne Scrims (Noble X, laut Betreiber "gerade inaktiv"). */
  inaktiv?: boolean;
}

/*
 * Die Server in der Reihenfolge von nobleprac.com/leaderboards. Die Ids
 * stehen dort im Programm der Seite; die Logos sind Nobles eigene.
 */
export const NOBLE_SERVER: NobleServer[] = [
  { guildId: '854725181384556584', name: 'Noble Practice Scrims', logo: '/scrims/noble-gelb.jpg', offen: true },
  { guildId: '1098721307077652630', name: 'Noble Solos', logo: '/scrims/noble-solos.jpg', offen: true },
  { guildId: '1403403384115040368', name: 'Noble Solos Closed', logo: '/scrims/noble-solos-closed.jpg' },
  { guildId: '1275856938940502047', name: 'Noble Division 0', logo: '/scrims/noble-division-0.jpg' },
  { guildId: '902656971113644132', name: 'Noble Division 3', logo: '/scrims/noble-blau.jpg' },
  { guildId: '1539238647587405884', name: 'Noble Division 2', logo: '/scrims/noble-lachs.jpg' },
  { guildId: '757573638995050608', name: 'Noble Division 1', logo: '/scrims/noble-gruen.jpg' },
  { guildId: '797443677403217940', name: 'Noble Pro Scrims', logo: '/scrims/noble-gold.jpg' },
  { guildId: '858831001663963156', name: 'Noble X', logo: '/scrims/noble-x.jpg', inaktiv: true },
];

/* ------------------------------------------------------------ Rohdaten */

interface RohListe { id: string; name: string; startDate: string; endDate: string }
interface RohSpiel {
  sessionId: string; placement: number; kills: number;
  survivalTime: number; score: number; timestamp: string;
}
interface RohTeam {
  teamId: string; placement: number; points: number; kills: number; wins: number;
  players: Array<{ accountId: string; displayName: string; country?: string }>;
  games: RohSpiel[];
}
interface RohTurnier extends RohListe {
  description?: string; guildId: string; leaderboard: RohTeam[];
}

/* --------------------------------------------------------- Kurzspeicher */

const vorrat = new Map<string, { bis: number; wert: unknown }>();

async function hole<W>(weg: string, haltbarMs: number): Promise<W> {
  const da = vorrat.get(weg);
  if (da && da.bis > Date.now()) return da.wert as W;
  const r = await fetch(QUELLE + weg, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new NobleFehler(r.status);
  const wert = await r.json() as W;
  vorrat.set(weg, { bis: Date.now() + haltbarMs, wert });
  // Nicht endlos wachsen lassen - die aeltesten Eintraege gehen zuerst.
  if (vorrat.size > 400) vorrat.delete(vorrat.keys().next().value as string);
  return wert;
}

export class NobleFehler extends Error {
  constructor(public status: number) { super(`nobleprac.com antwortet mit ${status}`); }
}

/* ------------------------------------------------------ In unsere Form */

export interface NobleSitzung {
  id: string; name: string; beschreibung?: string;
  teamGroesse: number; region: string; beginn: number; ende: number;
  art: 'SCRIM'; live: boolean; vorbei: boolean; guildId: string;
}

/** Solo, Duo, Trio aus dem Namen - "Solo Practice Session 3". */
function groesseAusName(name: string): number {
  const n = name.toLowerCase();
  if (/\bsolos?\b/.test(n)) return 1;
  if (/\bduos?\b/.test(n)) return 2;
  if (/\btrios?\b/.test(n)) return 3;
  if (/\bsquads?\b/.test(n)) return 4;
  return 0;
}

function alsSitzung(t: RohListe, guildId: string, jetzt = Date.now()): NobleSitzung {
  const beginn = Date.parse(t.startDate) || 0;
  const ende = Date.parse(t.endDate) || 0;
  return {
    id: t.id, name: t.name.trim(), teamGroesse: groesseAusName(t.name),
    region: 'EU', beginn, ende, art: 'SCRIM', guildId,
    live: beginn <= jetzt && jetzt < ende,
    vorbei: !!ende && ende <= jetzt,
  };
}

/** Die Sessions eines Servers, neueste zuerst. Noble X antwortet mit 400. */
export async function nobleSitzungen(guildId: string): Promise<NobleSitzung[]> {
  const liste = await hole<RohListe[]>(`/guilds/${encodeURIComponent(guildId)}`, 5 * 60_000);
  const jetzt = Date.now();
  return (Array.isArray(liste) ? liste : [])
    .map((t) => alsSitzung(t, guildId, jetzt))
    .sort((a, b) => b.beginn - a.beginn);
}

export interface NobleTeam {
  teamId: string;
  spieler: Array<{ name: string; epicId: string; land: string | null }>;
  platz: number; punkte: number; elims: number; matches: number; siege: number;
  elimsJeMatch: number; schnittPlatz: number; zeitSchnitt: number;
  spiele: Array<{ platz: number; elims: number; punkte: number; zeitpunkt: number; zaehlt: boolean; runde: string }>;
}
export interface NobleRunde {
  sessionId: string; zeitpunkt: number; gastgeber: null;
  spieler: number; gewertet: 'SCORED'; ignoriert: false;
}

const runde2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Ein Leaderboard: Teams, Runden und woher die Spieler kommen.
 *
 * Die Werte je Spieler, wie sie nobleprac.com beim Klick auf einen Namen
 * zeigt - Siege, Schnittplatz, Elims und Punkte je Match, gespielte Runden,
 * Kills - rechnen sich hier aus den einzelnen Runden. Ein Sieg ist eine
 * Runde auf Platz 1; das Feld "wins" des Leaderboards steht auch bei
 * Siegern oft auf 0.
 */
export async function nobleLeaderboard(id: string) {
  // Laufende Sessions kurz merken, beendete laenger - die aendern sich nicht mehr.
  const vorab = vorrat.get(`/tournaments/${id}`)?.wert as RohTurnier | undefined;
  const laeuft = !vorab || Date.parse(vorab.endDate) > Date.now();
  const weg = `/tournaments/${encodeURIComponent(id)}`;
  const t = await hole<RohTurnier>(weg, laeuft ? 60_000 : 30 * 60_000);

  /*
   * Aeltere Leaderboards kommen oft als {"error": true} - nobleprac.com
   * selbst kann sie dann auch nicht zeigen und springt zur Liste zurueck.
   * Das ist kein leeres Leaderboard und wird auch nicht so dargestellt;
   * gemerkt wird es nur kurz, vielleicht klappt es beim naechsten Mal.
   */
  if (!Array.isArray(t.leaderboard)) {
    vorrat.set(weg, { bis: Date.now() + 2 * 60_000, wert: t });
    return {
      turnier: alsSitzung(t, t.guildId), teams: [] as NobleTeam[], runden: [] as NobleRunde[],
      laender: [] as Array<[string, number]>, nichtDa: true,
    };
  }

  const teams: NobleTeam[] = (t.leaderboard ?? []).map((x) => {
    const spiele = [...(x.games ?? [])].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    const n = spiele.length;
    return {
      teamId: x.teamId,
      spieler: (x.players ?? []).map((p) => ({
        name: p.displayName, epicId: p.accountId,
        // "global" heisst dort: kein Land hinterlegt.
        land: p.country && p.country !== 'global' ? p.country.toUpperCase() : null,
      })),
      platz: x.placement, punkte: x.points, elims: x.kills, matches: n,
      siege: spiele.filter((s) => s.placement === 1).length,
      elimsJeMatch: n ? runde2(x.kills / n) : 0,
      schnittPlatz: n ? Math.round((spiele.reduce((a, s) => a + s.placement, 0) / n) * 10) / 10 : 0,
      zeitSchnitt: n ? Math.round(spiele.reduce((a, s) => a + (s.survivalTime || 0), 0) / n) : 0,
      spiele: spiele.map((s) => ({
        platz: s.placement, elims: s.kills, punkte: s.score,
        zeitpunkt: Date.parse(s.timestamp) || 0, zaehlt: true, runde: s.sessionId,
      })),
    };
  }).sort((a, b) => a.platz - b.platz);

  // Die Runden: jede Match-Kennung einmal, mit der Zahl ihrer Spieler.
  const runden = new Map<string, NobleRunde>();
  for (const tm of teams) {
    for (const s of tm.spiele) {
      const r = runden.get(s.runde);
      if (r) {
        r.spieler += tm.spieler.length;
        if (s.zeitpunkt && s.zeitpunkt < r.zeitpunkt) r.zeitpunkt = s.zeitpunkt;
      } else {
        runden.set(s.runde, {
          sessionId: s.runde, zeitpunkt: s.zeitpunkt, gastgeber: null,
          spieler: tm.spieler.length, gewertet: 'SCORED', ignoriert: false,
        });
      }
    }
  }

  // Woher die Spieler kommen. Wer kein Land hinterlegt hat, zaehlt sichtbar
  // mit - sonst stuenden vier Spieler mit Flagge da wie das ganze Feld.
  const laender = laenderVon(teams.flatMap((x) => x.spieler));

  const sitzung = alsSitzung(t, t.guildId);
  const groesse = teams.find((x) => x.spieler.length)?.spieler.length ?? 0;
  if (groesse) sitzung.teamGroesse = groesse;
  if (t.description) {
    sitzung.beschreibung = t.description.replace(/\\n/g, '\n')
      // Discord-Verweise [Text](Adresse) - hier steht nur der Text.
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  }

  return {
    turnier: sitzung,
    teams,
    runden: [...runden.values()].sort((a, b) => b.zeitpunkt - a.zeitpunkt),
    laender, nichtDa: false,
  };
}
