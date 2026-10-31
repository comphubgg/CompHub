import nodeFs from 'fs/promises';
import { gunzipSync } from 'zlib';
import path from 'path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { gecacht, holeBereich, type CupEintrag } from '@/lib/epicCups';

/*
 * Gleichstand im Endstand eines zweitaegigen Finales.
 *
 * Die gespeicherten Tagesdateien (data/epic-spieltage, data/platzierungen)
 * fuehren je Team nur Punkte, Matches und Elims - keine Siege. Zaehlt man
 * Day 1 + Day 2 zusammen, haben Teams mit gleichen Punkten deshalb denselben
 * Platz. Epics Bestenliste trennt sie: Punkte, dann Siege (Victory Royales),
 * dann Elims je Spiel, dann durchschnittliche Platzierung - dieselbe Reihenfolge
 * wie in app/api/cup-leaderboard (tageGesamt). Folge der gleichen Plaetze: das
 * Preisgeld (verdienst) hing am falschen Platz.
 *
 * Die Siege kommen aus der vollstaendigen Bestenliste der beiden Tage, entweder
 * aus dem Vorrat (data/vorrat/bestenliste-ganz) oder - nur wo erlaubt - frisch
 * bei Epic. Was einmal gelesen wurde, liegt unter data/vorrat/gleichstand, damit
 * die Reihenfolge auch bleibt, wenn Epic das Fenster nicht mehr vorhaelt.
 * Fehlen die Zahlen fuer ein Team, bleibt der geteilte Platz stehen - es wird
 * nichts geraten.
 */

export interface GleichstandWerte { punkte: number; siege: number; elims: number; spiele: number; plaetze: number[] }

const GANZ_ORDNER = path.join(DATEN_ORT, 'vorrat', 'bestenliste-ganz');
const MERK_ORDNER = path.join(DATEN_ORT, 'vorrat', 'gleichstand');
const sicher = (w: string) => w.replace(/[^\w.-]/g, '_');
const teamSchluessel = (ids: string[]) => [...ids].sort().join(',');

/** Event-Id eines Finales aus dem Fenster: "S39_SoloSeriesCupFinal_Day2_EU" -> "epicgames_S39_SoloSeriesCupFinal_EU". */
export function eventIdAusFenster(fenster: string): string {
  return `epicgames_${fenster.replace(/_?Day\d+(?=_|$)/i, '')}`;
}

async function ausVorrat(fenster: string): Promise<CupEintrag[] | null> {
  const datei = path.join(GANZ_ORDNER, `${sicher(fenster)}.json`);
  try {
    const roh = await nodeFs.readFile(`${datei}.gz`).then((b) => gunzipSync(b)).catch(() => nodeFs.readFile(datei));
    const d = JSON.parse(roh.toString('utf8')) as { entries?: CupEintrag[] };
    return d.entries?.length ? d.entries : null;
  } catch { return null; }
}

async function ausEpic(eventId: string, fenster: string): Promise<CupEintrag[] | null> {
  try {
    const d = await gecacht(`gleichstand|${eventId}|${fenster}`, 10 * 60_000, async () => {
      let alle: CupEintrag[] = [];
      for (let von = 0; von < 100; von += 25) {
        const r = await holeBereich(eventId, fenster, von, 25) as { entries?: CupEintrag[]; totalPages?: number };
        alle = alle.concat(r.entries ?? []);
        if (!(r.entries ?? []).length || von + 25 >= (r.totalPages ?? 0)) break;
      }
      return alle;
    });
    return d.length ? d : null;
  } catch { return null; }
}

/**
 * Siege, Elims, Spiele und Platzierungen je Team ueber alle Tage, Schluessel =
 * sortierte Konto-Ids. Null, wenn fuer einen Tag nichts zu bekommen ist.
 */
export async function gleichstandWerte(
  fenster: string, tage: number, opt: { eventId?: string; epic: boolean },
): Promise<Map<string, GleichstandWerte> | null> {
  const merk = path.join(MERK_ORDNER, `${sicher(fenster)}.json`);
  try {
    const gelesen = JSON.parse(await nodeFs.readFile(merk, 'utf8')) as Record<string, GleichstandWerte>;
    if (Object.keys(gelesen).length) return new Map(Object.entries(gelesen));
  } catch { /* nichts gemerkt */ }

  const eventId = opt.eventId || eventIdAusFenster(fenster);
  const summe = new Map<string, GleichstandWerte>();
  for (let t = 1; t <= tage; t++) {
    const tagFenster = fenster.replace(/Day\d+/, `Day${t}`);
    const eintraege = await ausVorrat(tagFenster) ?? (opt.epic ? await ausEpic(eventId, tagFenster) : null);
    if (!eintraege) return null;
    for (const e of eintraege) {
      if (!e.players?.length) continue;
      const k = teamSchluessel(e.players.map((p) => p.id));
      const z = summe.get(k) ?? { punkte: 0, siege: 0, elims: 0, spiele: 0, plaetze: [] };
      z.punkte += e.points ?? 0; z.siege += e.wins ?? 0; z.elims += e.elims ?? 0; z.spiele += e.games ?? 0;
      for (const m of e.matches ?? []) if (typeof m.placement === 'number') z.plaetze.push(m.placement);
      summe.set(k, z);
    }
  }
  if (!summe.size) return null;
  try {
    await nodeFs.mkdir(MERK_ORDNER, { recursive: true });
    await nodeFs.writeFile(merk, JSON.stringify(Object.fromEntries(summe)));
  } catch { /* nur ein Merkzettel */ }
  return summe;
}

export interface TeamSumme { spieler: string[]; punkte: number }

/**
 * Plaetze fuer die Summenliste vergeben. Gleiche Punkte teilen sich den Platz,
 * ausser die Werte trennen sie: Siege, dann Elims je Spiel, dann mittlere
 * Platzierung (besser = kleiner). Fehlen auch nur einem Team einer Punktgruppe
 * die Werte (oder weichen deren Punkte von unserer Summe ab), bleibt die ganze Gruppe beim geteilten Platz.
 */
export function platzeMitGleichstand<T extends TeamSumme>(
  liste: T[], werte: Map<string, GleichstandWerte> | null,
): Array<T & { platz: number }> {
  const mittel = (z: GleichstandWerte) => z.plaetze.reduce((a, b) => a + b, 0) / z.plaetze.length;
  const kennzahl = (t: T): [number, number, number] | null => {
    const z = werte?.get(teamSchluessel(t.spieler));
    return z && z.punkte === t.punkte && z.spiele > 0 && z.plaetze.length ? [z.siege, z.elims / z.spiele, mittel(z)] : null;
  };
  const gruppen = new Map<number, T[]>();
  for (const t of liste) gruppen.set(t.punkte, [...(gruppen.get(t.punkte) ?? []), t]);

  const raus: Array<T & { platz: number }> = [];
  let beginn = 1;
  for (const punkte of [...gruppen.keys()].sort((a, b) => b - a)) {
    const g = gruppen.get(punkte)!;
    const k = g.map(kennzahl);
    if (g.length > 1 && k.every((x) => x !== null)) {
      const bund = g.map((t, i) => ({ t, k: k[i]! }))
        .sort((a, b) => b.k[0] - a.k[0] || b.k[1] - a.k[1] || a.k[2] - b.k[2]);
      let platz = beginn;
      bund.forEach((x, i) => {
        const v = bund[i - 1]?.k;
        if (i > 0 && !(v[0] === x.k[0] && v[1] === x.k[1] && v[2] === x.k[2])) platz = beginn + i;
        raus.push({ ...x.t, platz });
      });
    } else {
      g.forEach((t) => raus.push({ ...t, platz: beginn }));
    }
    beginn += g.length;
  }
  return raus;
}
