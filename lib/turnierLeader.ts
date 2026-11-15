import { promises as fs } from 'node:fs';
import path from 'node:path';
import { liesJson } from '@/lib/ablage';

/*
 * Tournament Leaders (Betreiber, 15.11.2026): je Spieltag - oder je mehrtaegigem Event - ein "Event MVP" und die besten fuenf in acht Kennzahlen.
 *
 * Die Zahlen sind genau die der Player Stats: sie kommen aus app/api/cup-spieler (?kennzahl=...), also aus unseren Replays bzw. der Szene-Quelle,
 * je Spieler - nie Epics Team-Werte. Damage Taken ist der Schaden von Spielern (ohne Sturm), wie bei der Damage Ratio. Mats Farmed und Distance
 * fehlen bewusst, bis sie exakt sind.
 *
 * CompHub Rating (0-100, transparent, ohne versteckte Gewichte):
 *
 *   Rating = 100 x ( 0.30 x Elims / bestes Elims
 *                  + 0.25 x Damage Dealt / bester Damage Dealt
 *                  + 0.15 x Damage Ratio / beste Damage Ratio
 *                  + 0.10 x Hits / meiste Hits
 *                  + 0.20 x Platzierung )
 *
 *   Platzierung = max(0, (101 - Platz) / 100)   -> Platz 1 = 1,00, Platz 10 = 0,91, Platz 100 = 0,01, dahinter 0
 *   "bestes ..." = der beste Wert unter den gewerteten Spielern dieses Spieltags/Events.
 *   Gewertet wird, wer mindestens die Haelfte der Spiele des Spielers mit den meisten Spielen gespielt hat (wie die Je-Spiel-Kacheln der Player Stats);
 *   die Damage Ratio zaehlt dieselbe Regel. Fehlt ein Wert (z. B. die Ratio), zaehlt dieser Teil 0. Kennt der Spieltag keine Platzierung,
 *   gilt Rating = (Summe der vier uebrigen Teile) / 0,80.
 *
 * Der Event MVP ist Platz 1 im Rating. Sein Foto nur, wenn es nachweislich zu genau diesem Epic-Konto gehoert (spielerbilder.json, Eintrag mit der
 * Konto-Id) - kein Abgleich ueber den Namen; sonst der Platzhalter. Die Flagge nur aus unseren gepflegten Profilen (cup-spieler: land).
 */

export const RATING_GEWICHTE = { elims: 0.30, damage: 0.25, quote: 0.15, hits: 0.10, platz: 0.20 } as const;
export const RATING_FORMEL = 'Rating = 100 × (0.30·Elims/max + 0.25·Damage/max + 0.15·Damage Ratio/max + 0.10·Hits/max + 0.20·Placement), Placement = max(0, (101 − place)/100); players with at least half of the most matches played.';

export interface LeaderZeile {
  epicId: string;
  name: string;
  land: string;
  wert: number;
  rang: number;
  platz: number | null;
  spiele: number;
}

export interface LeaderTafel {
  schluessel: string;
  titel: string;
  nachkomma: number;
  /** Sekunden, angezeigt als "2h 38m". */
  zeit?: boolean;
  zeilen: LeaderZeile[];
}

export interface LeaderMvp {
  epicId: string;
  name: string;
  land: string;
  platz: number | null;
  spiele: number;
  rating: number;
  elims: number;
  damage: number;
  quote: number | null;
  hits: number;
  headshots: number;
  builds: number | null;
  damageTaken: number;
  /** Datei in public/spielerbilder - nur bei nachgewiesener Zuordnung zur Konto-Id. */
  datei: string | null;
  gesicht: [number, number, number] | null;
}

export interface LeaderKopf { titel: string; saison: string; region: string; datum: number | null; bild: string | null }

export interface LeaderAntwort {
  vorhanden: boolean;
  /** Von der Route ergaenzt (app/api/turnier-leader). */
  kopf?: LeaderKopf;
  mvp: LeaderMvp | null;
  tafeln: LeaderTafel[];
  formel: string;
  gewichte: typeof RATING_GEWICHTE;
  mindestSpiele: number;
  spieleMax: number;
  gewertet: number;
  /** Die gewerteten Spieler fuer das Performance Board (Elims x Damage) - nur der Kreis der besten 50 je Kennzahl. */
  feld?: Array<{ epicId: string; name: string; land: string; elims: number; damage: number; platz: number | null; rating: number }>;
  /** Keine Platzierung bekannt - das Rating ohne den Platz-Anteil (hochgerechnet). */
  ohnePlatz?: boolean;
  hinweis?: string;
}

/** Die Tafeln in der Reihenfolge der Anzeige - Feld in cup-spieler, Titel, Nachkommastellen. */
export const TAFELN: Array<{ schluessel: string; feld: string; titel: string; nachkomma: number; zeit?: boolean }> = [
  { schluessel: 'rating', feld: 'rating', titel: 'Highest Rated', nachkomma: 1 },
  { schluessel: 'elims', feld: 'kills', titel: 'Most Eliminations', nachkomma: 0 },
  { schluessel: 'damage', feld: 'damage', titel: 'Most Damage Dealt', nachkomma: 0 },
  { schluessel: 'quote', feld: 'quote', titel: 'Best Damage Ratio', nachkomma: 2 },
  { schluessel: 'headshots', feld: 'headshots', titel: 'Most Headshots', nachkomma: 0 },
  // Statt Mats Farmed (noch nicht exakt, Betreiber 15.11.2026): die Ueberlebenszeit aus denselben Replays (lib/clutchLeben.mjs).
  { schluessel: 'timeAlive', feld: 'timeAlive', titel: 'Most Time Alive', nachkomma: 0, zeit: true },
  { schluessel: 'builds', feld: 'builds', titel: 'Most Builds Placed', nachkomma: 0 },
  { schluessel: 'hits', feld: 'hits', titel: 'Most Hits to Players', nachkomma: 0 },
  { schluessel: 'damageTaken', feld: 'damageTaken', titel: 'Most Damage Taken', nachkomma: 0 },
];

type Roh = Record<string, unknown> & { epicId: string };
type Holer = (kennzahl: string, pro: number) => Promise<Roh[]>;

const zahl = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const spieleVon = (z: Roh) => zahl(z.matches) ?? zahl(z.spiele) ?? 0;
const kills = (z: Roh) => zahl(z.kills) ?? zahl(z.elims) ?? 0;

/** Rating einer Zeile gegen die Bestwerte - siehe Formel oben. */
export function ratingVon(z: Roh, beste: { elims: number; damage: number; quote: number; hits: number }): number {
  const teil = (v: number | null, max: number) => (v && max > 0 ? Math.min(1, v / max) : 0);
  const platz = zahl(z.platz);
  const p = platz && platz > 0 ? Math.max(0, (101 - platz) / 100) : 0;
  const g = RATING_GEWICHTE;
  return 100 * (g.elims * teil(kills(z), beste.elims) + g.damage * teil(zahl(z.damage), beste.damage)
    + g.quote * teil(zahl(z.quote) ?? zahl(z.damageRatio), beste.quote) + g.hits * teil(zahl(z.hits), beste.hits) + g.platz * p);
}

/** Foto nur ueber die Konto-Id (kein Namensabgleich) - Datei ueber 4.000 Byte, sonst ist es die graue Silhouette. */
export async function fotoFuerKonto(epicId: string): Promise<{ datei: string | null; gesicht: [number, number, number] | null }> {
  const ordner = path.join(process.cwd(), 'public', 'spielerbilder');
  const id = epicId.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return { datei: null, gesicht: null };
  const verzeichnis = await liesJson<Array<{ epicId?: string; datei?: string }>>('spielerbilder.json', []).catch(() => []);
  const datei = verzeichnis.find((e) => e.epicId?.toLowerCase() === id && e.datei)?.datei ?? null;
  if (!datei || datei.includes('/') || datei.includes('\\')) return { datei: null, gesicht: null };
  const st = await fs.stat(path.join(ordner, datei)).catch(() => null);
  if (!st?.isFile() || st.size <= 4000) return { datei: null, gesicht: null };
  const gesichter = await fs.readFile(path.join(ordner, '_gesichter.json'), 'utf8').then((t) => JSON.parse(t) as Record<string, number[]>).catch(() => ({} as Record<string, number[]>));
  const g = gesichter[datei];
  return { datei, gesicht: Array.isArray(g) && g.length >= 3 ? [g[0], g[1], g[2]] : null };
}

/**
 * Die Leaders aus den Seiten der Player Stats. `hole(kennzahl, pro)` liefert die besten Zeilen einer Kennzahl (app/api/cup-spieler ?kennzahl=).
 * Der Kreis fuer das Rating: die besten 50 jeder Kennzahl zusammen - wer in keiner davon unter den besten 50 steht, kann das Rating nicht anfuehren.
 */
export async function baueLeader(hole: Holer): Promise<LeaderAntwort> {
  const listen = await Promise.all(TAFELN.filter((t) => t.feld !== 'rating').map(async (t) => [t, await hole(t.feld === 'kills' ? 'elims' : t.feld, 50).catch(() => [])] as const));
  const kreis = new Map<string, Roh>();
  for (const [, zeilen] of listen) for (const z of zeilen) if (z?.epicId && !kreis.has(z.epicId)) kreis.set(z.epicId, z);
  const alle = [...kreis.values()];
  const leer: LeaderAntwort = { vorhanden: false, mvp: null, tafeln: [], formel: RATING_FORMEL, gewichte: RATING_GEWICHTE, mindestSpiele: 0, spieleMax: 0, gewertet: 0 };
  if (!alle.length) return leer;

  const spieleMax = alle.reduce((m, z) => Math.max(m, spieleVon(z)), 0);
  const mindestSpiele = Math.max(1, Math.ceil(spieleMax / 2));
  const gewertet = alle.filter((z) => spieleVon(z) >= mindestSpiele);
  const max = (f: (z: Roh) => number | null) => gewertet.reduce((m, z) => Math.max(m, f(z) ?? 0), 0);
  const beste = { elims: max(kills), damage: max((z) => zahl(z.damage)), quote: max((z) => zahl(z.quote) ?? zahl(z.damageRatio)), hits: max((z) => zahl(z.hits)) };
  // Kennt der Spieltag (noch) keine Platzierung, faellt dieser Teil weg und die uebrigen 80 % werden auf 100 hochgerechnet - sonst laege jeder um 20 Punkte zu tief.
  const ohnePlatz = !gewertet.some((z) => (zahl(z.platz) ?? 0) > 0);
  const rating = new Map(gewertet.map((z) => [z.epicId, ohnePlatz ? ratingVon(z, beste) / (1 - RATING_GEWICHTE.platz) : ratingVon(z, beste)]));

  const zeile = (z: Roh, wert: number, rang: number): LeaderZeile => ({
    epicId: z.epicId, name: String(z.name ?? z.epicId.slice(0, 8)), land: String(z.land ?? ''), wert, rang, platz: zahl(z.platz), spiele: spieleVon(z),
  });
  /** Die ersten fuenf - gleicher (angezeigter) Wert, gleicher Rang. */
  const fuenf = (liste: Array<{ z: Roh; w: number }>, nachkomma: number) => {
    const sortiert = liste.filter((x) => Number.isFinite(x.w) && x.w > 0).sort((a, b) => b.w - a.w);
    const raus: LeaderZeile[] = [];
    sortiert.slice(0, 5).forEach((x, i) => {
      const gleich = i > 0 && +sortiert[i - 1].w.toFixed(nachkomma) === +x.w.toFixed(nachkomma);
      raus.push(zeile(x.z, +x.w.toFixed(nachkomma), gleich ? raus[i - 1].rang : i + 1));
    });
    return raus;
  };

  const tafeln: LeaderTafel[] = [];
  for (const t of TAFELN) {
    let zeilen: LeaderZeile[];
    if (t.feld === 'rating') zeilen = fuenf(gewertet.map((z) => ({ z, w: rating.get(z.epicId) ?? 0 })), t.nachkomma);
    // Je-Spiel-Werte (Ratio) nur fuer Gewertete - sonst fuehrt einer mit wenigen Spielen.
    else if (t.feld === 'quote') zeilen = fuenf(gewertet.map((z) => ({ z, w: zahl(z.quote) ?? zahl(z.damageRatio) ?? 0 })), t.nachkomma);
    else zeilen = fuenf(alle.map((z) => ({ z, w: t.feld === 'kills' ? kills(z) : zahl(z[t.feld]) ?? 0 })), t.nachkomma);
    if (zeilen.length) tafeln.push({ schluessel: t.schluessel, titel: t.titel, nachkomma: t.nachkomma, ...(t.zeit ? { zeit: true } : {}), zeilen });
  }

  const erster = tafeln.find((t) => t.schluessel === 'rating')?.zeilen[0];
  const z = erster ? kreis.get(erster.epicId) : null;
  const mvp: LeaderMvp | null = z ? {
    epicId: z.epicId, name: String(z.name ?? z.epicId.slice(0, 8)), land: String(z.land ?? ''), platz: zahl(z.platz), spiele: spieleVon(z),
    rating: +(rating.get(z.epicId) ?? 0).toFixed(1), elims: kills(z), damage: zahl(z.damage) ?? 0, quote: zahl(z.quote) ?? zahl(z.damageRatio),
    hits: zahl(z.hits) ?? 0, headshots: zahl(z.headshots) ?? 0, builds: zahl(z.builds), damageTaken: zahl(z.damageTaken) ?? 0,
    ...(await fotoFuerKonto(z.epicId)),
  } : null;

  return { vorhanden: tafeln.length > 0, mvp, tafeln, formel: RATING_FORMEL, gewichte: RATING_GEWICHTE, mindestSpiele, spieleMax, gewertet: gewertet.length, ...(ohnePlatz ? { ohnePlatz: true } : {}),
    feld: gewertet.map((x) => ({ epicId: x.epicId, name: String(x.name ?? x.epicId.slice(0, 8)), land: String(x.land ?? ''), elims: kills(x), damage: zahl(x.damage) ?? 0, platz: zahl(x.platz), rating: +(rating.get(x.epicId) ?? 0).toFixed(1) }))
      .filter((x) => x.elims > 0 || x.damage > 0) };
}
