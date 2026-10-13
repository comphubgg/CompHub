import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DATEN_ORT } from '@/lib/datenOrt';
import { namensSchluessel } from '@/lib/homoglyph';
import { FNCS_FAKTEN } from '@/lib/fncsFakten';
import { archivListe } from '@/lib/fncsBestenlisten';
import type { MapEintrag } from '@/lib/mapsVerzeichnis';

/*
 * Was die Spielerliste der Szene-Quelle (data/szene-quelle/spielerliste.json) ueber die FNCS-Endspiele weiss: je Spieler Land und
 * die Platzierung bei jedem Endspiel seit Chapter 1 Season X (Spalten CH1_SX ... GLOBALS_2025, dazu FNCS_WINS). Daraus laesst sich
 * zu jedem dieser Endspiele die ganze Platzierungsliste bilden: Spieler mit derselben Platzierung sind ein Team.
 *
 * Eigene Datei, damit lib/alteMaps (Teams einer alten Karte) und lib/fncsEreignisse (FNCS-Seite) sie beide nutzen koennen,
 * ohne sich gegenseitig einzubinden.
 */

export type Art = 'gf' | 'gc' | 'invitational' | 'summit' | 'royale' | 'allstar';

export const schluesselVon = (saison: string, art: Art) => `${saison}|${art}`;

/** Welches FNCS-Endspiel ist diese Karte - oder keins? */
export function endspielArt(e: MapEintrag): { art: Art; jahr?: string } | null {
  if (e.alt) {
    if (e.titel === 'FNCS Grand Finals') return { art: 'gf' };
    if (e.titel === 'FNCS Grand Royale') return { art: 'royale' };
    if (e.titel === 'FNCS All-Star Showdown') return { art: 'allstar' };
    if (e.titel === 'FNCS Invitational 2022') return { art: 'invitational', jahr: '2022' };
    const gc = /^FNCS Global Championship (\d{4}) Grand Finals$/.exec(e.titel);
    return gc ? { art: 'gc', jahr: gc[1] } : null;
  }
  if (/^S\d+_FNCSMajor\d_Final_EU$/.test(e.windowId)) return { art: 'gf' };
  const gc = /^FNCS_Global_Championship_(\d{4})$/.exec(e.windowId);
  if (gc) return { art: 'gc', jahr: gc[1] };
  return e.windowId === 'FNCS_Major_1_Summit_Final' ? { art: 'summit' } : null;
}

/** Die Spalte der Spielerliste je Endspiel. */
const SPALTE: Record<string, string> = {
  'S10|gf': 'CH1_SX', 'S11|gf': 'CH2_S1', 'S12|gf': 'CH2_S2', 'S12|invitational': 'CH2_S2_INVITATIONAL', 'S13|gf': 'CH2_S3',
  'S14|gf': 'CH2_S4', 'S15|gf': 'CH2_S5', 'S16|gf': 'CH2_S6', 'S17|allstar': 'ALL_STAR_SOLO', 'S17|gf': 'CH2_S7', 'S18|gf': 'CH2_S8',
  'S18|royale': 'GRAND_ROYALE', 'S19|gf': 'CH3_S1', 'S20|gf': 'CH3_S2', 'S21|gf': 'CH3_S3', 'S22|invitational': 'INVITATIONAL_2022',
  'S23|gf': 'CH4_S1', 'S24|gf': 'CH4_S2', 'S25|gf': 'CH4_S3', 'S26|gc': 'GLOBALS_2023', 'S28|gf': 'CH5_S1', 'S29|gf': 'CH5_S2',
  'S30|gf': 'CH5_S3', 'S31|gc': 'GLOBALS_2024', 'S33|gf': 'CH6_S1', 'S34|gf': 'CH6_S2', 'S36|gf': 'CH6_S3', 'S37|gc': 'GLOBALS_2025',
};

type Zeile = Record<string, unknown>;
let merker: { bis: number; liste: Zeile[] } | null = null;

async function liesListe(): Promise<Zeile[]> {
  if (merker && merker.bis > Date.now()) return merker.liste;
  let liste: Zeile[] = [];
  try {
    liste = JSON.parse(await fs.readFile(path.join(DATEN_ORT, 'szene-quelle', 'spielerliste.json'), 'utf8')) as Zeile[];
  } catch { /* ohne Liste gibt es keine Platzierungen und kein Land aus dem Namen */ }
  merker = { bis: Date.now() + 10 * 60_000, liste };
  return liste;
}

/**
 * Das Land zu einem Spielernamen - fuer Quellen, die nur Namen kennen. Bei gleichen Namen gilt, wer bei den meisten Endspielen
 * dabei war. Kennt die Liste den Namen nicht, bleibt die Weltkugel: ein Land wird nicht geraten.
 */
let landMerker: { bis: number; karte: Map<string, string> } | null = null;
export async function landVonName(): Promise<(name: string) => string | null> {
  if (!landMerker || landMerker.bis < Date.now()) {
    const karte = new Map<string, string>();
    const punkte = new Map<string, number>();
    for (const p of await liesListe()) {
      const name = String(p.NAME ?? ''); const land = String(p.COUNTRY ?? '');
      if (!name || !/^[A-Za-z]{2}$/.test(land)) continue;
      const k = namensSchluessel(name);
      if (!k) continue;
      const gewicht = Object.entries(p).filter(([key, v]) => /^(CH\d|ALL_STAR|GRAND_ROYALE|INVITATIONAL|GLOBALS)/.test(key) && Number(v) > 0).length;
      if (!karte.has(k) || gewicht > (punkte.get(k) ?? 0)) { karte.set(k, land.toUpperCase()); punkte.set(k, gewicht); }
    }
    landMerker = { bis: Date.now() + 10 * 60_000, karte };
  }
  const karte = landMerker.karte;
  return (name) => karte.get(namensSchluessel(name)) ?? null;
}

export interface ListenTeam {
  rang: number;
  /** Punkte, Siege, Eliminierungen, Spiele - nur aus den archivierten Bestenlisten (lib/fncsBestenlisten). */
  punkte?: number; siege?: number; elims?: number; spiele?: number;
  spieler: Array<{ id: string; name: string; land: string | null }>;
}

/** Die Laender, deren Spieler in der Region Europa spielen - die Liste mischt alle Regionen, ihre Endspiele haben je einen Ersten, Zweiten ... */
const EUROPA = new Set('AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH UA GB TR GE AM AZ IL'.split(' '));

/** Die Platzierungsliste eines Endspiels aus der Spielerliste: je Platzierung ein Team. Leer, wo die Liste das Event nicht kennt. */
export async function listeTeams(key: string): Promise<ListenTeam[]> {
  const spalte = SPALTE[key];
  if (!spalte) return [];
  // Grand Finals, Grand Royale und All-Star gibt es je Region; die Liste fuehrt alle - hier zaehlt Europa. Global Championship und Invitational sind eine Runde fuer alle.
  const europaNur = /\|(gf|allstar|royale)$/.test(key);
  const nach = new Map<number, ListenTeam>();
  for (const p of await liesListe()) {
    const rang = Number(p[spalte]);
    const name = String(p.NAME ?? '');
    if (!(rang > 0) || !name) continue;
    const land = /^[A-Za-z]{2}$/.test(String(p.COUNTRY ?? '')) ? String(p.COUNTRY).toUpperCase() : null;
    if (europaNur && !(land && EUROPA.has(land))) continue;
    const t = nach.get(rang) ?? { rang, spieler: [] };
    t.spieler.push({ id: String(p.ID ?? '') || `n-${namensSchluessel(name)}`, name, land });
    nach.set(rang, t);
  }
  return [...nach.values()].sort((a, b) => a.rang - b.rang);
}

/**
 * Die Platzierungen eines Endspiels, so vollstaendig wie moeglich: die ersten fuenf Plaetze aus den Eckdaten (lib/fncsFakten - dort
 * stehen die ganzen Teams), danach die Liste der Szene-Quelle. In der Liste fehlt gelegentlich ein Spieler (Konten ohne
 * europaeisches Land), die ersten fuenf Teams sind darum immer die der Eckdaten.
 */
export async function plaetze(key: string): Promise<ListenTeam[]> {
  // Die archivierte Bestenliste (ganze Teams, Punkte, Siege, Eliminierungen, Spiele) geht vor: die Spielerliste unten kennt nur den Platz.
  const archiv = await archivListe(key);
  if (archiv?.length) return archiv;
  const fakt = FNCS_FAKTEN[key];
  const liste = await listeTeams(key);
  if (!fakt) return liste;
  const land = await landVonName();
  const kopf: ListenTeam[] = fakt.top.map((t) => ({
    rang: t.rang, spieler: t.spieler.map((n) => ({ id: `f-${namensSchluessel(n)}`, name: n, land: land(n) })),
  }));
  return [...kopf, ...liste.filter((t) => t.rang > fakt.top.length)];
}
