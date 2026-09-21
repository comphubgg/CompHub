import { liesJson } from '@/lib/ablage';

/*
 * Die Team-Eliminierungen aus Epics Bestenlisten - fertige Listen je Jahr,
 * Saison und Region, einmal gerechnet (scripts/elims-archiv.mjs).
 *
 * Der Betreiber: "Team-elims statistics 2019 to 2023 from Epic
 * leaderboards." Epic fuehrt je Team die Eliminierungen des ganzen Teams,
 * nichts je Spieler; jedes Mitglied zaehlt sie hier fuer sich. Die
 * Bestenlisten sind auf die besten 500 Teams je Spieltag gekuerzt.
 *
 *   konten: [epicId, ...]
 *   listen["<jahr>|<region>"]   = { spieltage, plaetze: [[konto, teamElims, matches, spieltage], ...] }
 *   listen["<saison>|<region>"] = dasselbe je Saison, "0|" ist alle Zeit;
 *                                 Region leer heisst alle Regionen.
 */
type Zeile = [number, number, number, number];
interface Archiv {
  stand?: string;
  fenster?: number;
  konten: string[];
  listen: Record<string, { spieltage: number; plaetze: Zeile[] }>;
}

export interface TeamElimsPlatz {
  epicId: string;
  teamElims: number;
  /** Gespielte Matches ueber diese Spieltage. */
  matches: number;
  /** Spieltage, an denen das Konto in der Bestenliste stand. */
  spieltage: number;
  /**
   * Die Region, in der das Konto die meisten dieser Eliminierungen holte -
   * die gewaehlte, oder ohne Wahl die Regionsliste mit dem hoechsten Wert.
   * Leer, wenn es in keiner Regionsliste steht (nur LAN, oder weiter hinten).
   */
  region: string;
}

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

let merker: { archiv: Archiv; bis: number } | null = null;

export async function liesElimsArchiv(): Promise<Archiv> {
  if (merker && Date.now() < merker.bis) return merker.archiv;
  const roh = await liesJson<Archiv | null>('elims-archiv.json', null);
  const archiv = roh && Array.isArray(roh.konten) && roh.listen ? roh : { konten: [], listen: {} };
  merker = { archiv, bis: Date.now() + 10 * 60_000 };
  return archiv;
}

/**
 * Die Liste zu einem Zeitraum: eine Saison, ein Jahr oder 0 fuer alle Zeit,
 * dazu eine Region oder keine. Fehlt die Liste, kommt eine leere.
 */
export async function teamElimsListe(zeitraum: string | number, region?: string):
  Promise<{ spieltage: number; plaetze: TeamElimsPlatz[] }> {
  const archiv = await liesElimsArchiv();
  const liste = archiv.listen[`${zeitraum}|${region ?? ''}`];
  if (!liste) return { spieltage: 0, plaetze: [] };
  // Ohne Regionswahl: je Konto die Region mit den meisten Eliminierungen.
  const heimat = new Map<number, [string, number]>();
  if (!region) {
    for (const r of REGIONEN) {
      for (const z of archiv.listen[`${zeitraum}|${r}`]?.plaetze ?? []) {
        const da = heimat.get(z[0]);
        if (!da || z[1] > da[1]) heimat.set(z[0], [r, z[1]]);
      }
    }
  }
  return {
    spieltage: liste.spieltage,
    plaetze: liste.plaetze
      .filter((z) => archiv.konten[z[0]])
      .map((z) => ({
        epicId: archiv.konten[z[0]], teamElims: z[1], matches: z[2], spieltage: z[3],
        region: region ?? heimat.get(z[0])?.[0] ?? '',
      })),
  };
}
