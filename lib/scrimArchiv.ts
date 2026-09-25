/*
 * Das Archiv der Scrims - was scripts/scrims-holen.mjs stuendlich von Noble
 * und Poyo sammelt und am GitHub-Release ablegt.
 *
 *   scrims/_index.json                      alle Sessions, kurz
 *   scrims/<YYYY-MM-DD>/<quelle>-<id>.json  je Server und Tag die Leaderboards
 *
 * Die Teams liegen dort in Kurzform (siehe das Skript); hier werden sie zu
 * dem, was die Scrims-Seite zeigt - mit Siegen, Schnittplatz, Elims und
 * Punkten je Runde, gerechnet aus den einzelnen Runden.
 */

import { speicher } from '@/lib/ablage';

export interface ArchivServer {
  quelle: 'noble' | 'poyo'; guildId: string; name: string; region: string;
  bild?: string | null; inaktiv?: boolean;
  /** Die Discord-Einladung des Servers. */
  einladung?: string | null;
  /** Poyo: der letzte Tag mit Sessions (fuer Server, die gerade ruhen). */
  letzterTag?: string | null;
}
export interface ArchivKurz {
  id: string; quelle: 'noble' | 'poyo'; guildId: string; server: string; name: string;
  tag: string; beginn: number; ende: number; teamGroesse: number; modus?: string | null;
  teams: number; runden: number; nichtDa?: boolean;
}
export interface ArchivVerzeichnis { stand: number; server: ArchivServer[]; sitzungen: ArchivKurz[] }

type Runde = [number, number, number, number, string, number];
interface KurzTeam {
  t: string; s: Array<[string, string | null, string | null, string | null]>;
  p: number; P: number; k: number; g: Runde[];
}
interface ArchivSitzung extends Omit<ArchivKurz, 'teams' | 'runden'> {
  beschreibung?: string; teams: KurzTeam[];
}

async function lies<T>(name: string): Promise<T | null> {
  const roh = await speicher.lies(name);
  return roh ? JSON.parse(roh.toString('utf8')) as T : null;
}

export function scrimVerzeichnis(): Promise<ArchivVerzeichnis | null> {
  return lies<ArchivVerzeichnis>('scrims/_index.json');
}

/** Woher die Spieler kommen - nur, wer ein Land hinterlegt hat, der Rest als "—". */
export function laenderVon(spieler: Array<{ land?: string | null }>): Array<[string, number]> {
  const zaehler = new Map<string, number>();
  let ohne = 0;
  for (const p of spieler) {
    if (p.land) zaehler.set(p.land, (zaehler.get(p.land) ?? 0) + 1);
    else ohne += 1;
  }
  const sortiert = [...zaehler.entries()].sort((a, b) => b[1] - a[1]);
  const raus: Array<[string, number]> = sortiert.slice(0, 5);
  const rest = sortiert.slice(5).reduce((a, [, z]) => a + z, 0);
  if (rest) raus.push(['Other', rest]);
  // Ohne ein einziges Land gibt es keinen Kringel - dann sagt die Seite es.
  if (ohne && raus.length) raus.push(['—', ohne]);
  return raus;
}

const auf2 = (x: number) => Math.round(x * 100) / 100;

/** Eine abgelegte Session, fertig fuer die Seite - oder null. */
export async function scrimSession(id: string) {
  const verzeichnis = await scrimVerzeichnis();
  const kurz = verzeichnis?.sitzungen.find((s) => s.id === id);
  if (!kurz) return null;
  const tag = await lies<{ sitzungen: ArchivSitzung[] }>(`scrims/${kurz.tag}/${kurz.quelle}-${kurz.guildId}.json`);
  const s = tag?.sitzungen.find((x) => x.id === id);
  if (!s) return null;

  const teams = s.teams.map((x) => {
    const n = x.g.length;
    return {
      teamId: x.t,
      spieler: x.s.map(([name, epicId, land, discordId]) => ({
        name, epicId: epicId ?? undefined, land, discordId: discordId ?? undefined,
      })),
      platz: x.p, punkte: x.P, elims: x.k, matches: n,
      siege: x.g.filter((g) => g[0] === 1).length,
      elimsJeMatch: n ? auf2(x.k / n) : 0,
      schnittPlatz: n ? Math.round((x.g.reduce((a, g) => a + g[0], 0) / n) * 10) / 10 : 0,
      zeitSchnitt: n ? Math.round(x.g.reduce((a, g) => a + (g[5] || 0), 0) / n) : 0,
      spiele: x.g.map((g) => ({
        platz: g[0], elims: g[1], punkte: g[2], zeitpunkt: g[3] * 1000, zaehlt: true, runde: g[4],
      })),
    };
  }).sort((a, b) => a.platz - b.platz);

  // Die Runden: jede Match-Id einmal, mit der Zahl ihrer Spieler.
  const runden = new Map<string, {
    sessionId: string; zeitpunkt: number; gastgeber: null; spieler: number;
    gewertet: 'SCORED'; ignoriert: false;
  }>();
  for (const tm of teams) {
    for (const g of tm.spiele) {
      const r = runden.get(g.runde);
      if (r) {
        r.spieler += tm.spieler.length;
        if (g.zeitpunkt && (!r.zeitpunkt || g.zeitpunkt < r.zeitpunkt)) r.zeitpunkt = g.zeitpunkt;
      } else {
        runden.set(g.runde, {
          sessionId: g.runde, zeitpunkt: g.zeitpunkt, gastgeber: null,
          spieler: tm.spieler.length, gewertet: 'SCORED', ignoriert: false,
        });
      }
    }
  }

  return {
    turnier: {
      id: s.id, name: s.name, beschreibung: s.beschreibung, teamGroesse: s.teamGroesse,
      region: 'EU', beginn: s.beginn, ende: s.ende, art: 'SCRIM', modus: s.modus ?? null,
      live: false, vorbei: true, guildId: s.guildId,
    },
    teams,
    runden: [...runden.values()].sort((a, b) => b.zeitpunkt - a.zeitpunkt),
    laender: laenderVon(teams.flatMap((x) => x.spieler)),
    nichtDa: !!s.nichtDa,
  };
}
