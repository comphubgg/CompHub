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
 *   gilt Rating = (Summe der vier uebrigen Teile) / 0,80. Fehlen Treffer/Ratio bei mehr als 10 % der Gewerteten (Replay-Auswertung laeuft noch),
 *   gilt Rating = 100 x (0.30 Elims + 0.25 Damage + 0.20 Platz) / 0.75.
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
  hits: number | null;
  headshots: number | null;
  builds: number | null;
  damageTaken: number | null;
  /** Datei in public/spielerbilder - nur bei nachgewiesener Zuordnung zur Konto-Id. */
  datei: string | null;
  gesicht: [number, number, number] | null;
}

export interface LeaderLand {
  land: string; spieler: number; rating: number; elims: number; damage: number;
  hits: number | null; builds: number | null; reboots: number | null;
  bester: { name: string; rating: number } | null;
}

export interface LeaderKopf { titel: string; saison: string; region: string; datum: number | null; bild: string | null }

export interface LeaderAntwort {
  vorhanden: boolean;
  /** Von der Route ergaenzt (app/api/turnier-leader). */
  kopf?: LeaderKopf;
  /** Die volle Replay-Auswertung liegt hinter Epic (z. B. 7 von 8 Spielen) - Treffer, Kopftreffer, Bauteile, erlittener Schaden und Ratio erst danach. */
  replayStand?: { gelesen: number; gesamt: number } | null;
  mvp: LeaderMvp | null;
  tafeln: LeaderTafel[];
  formel: string;
  gewichte: typeof RATING_GEWICHTE;
  mindestSpiele: number;
  spieleMax: number;
  gewertet: number;
  /** Die gewerteten Spieler fuer das Performance Board (Elims x Damage) - nur der Kreis der besten 50 je Kennzahl. */
  feld?: Array<{ epicId: string; name: string; land: string; elims: number; damage: number; platz: number | null; rating: number }>;
  /** Laenderuebersicht ueber die gewerteten Spieler (Land nur aus unseren Profilen; '' = unbekannt). */
  laender?: LeaderLand[];
  /** Ob der Kreis das ganze Feld abdeckt - sonst gilt die Laenderuebersicht nur fuer die gewerteten Spitzenspieler. */
  ganzesFeld?: boolean;
  /** Keine Platzierung bekannt - das Rating ohne den Platz-Anteil (hochgerechnet). */
  ohnePlatz?: boolean;
  /** Treffer und Ratio fehlen bei mehr als 10 % der Gewerteten - das Rating ohne diese beiden Teile. */
  ohneReplay?: boolean;
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
  // Nach den neun der Grundansicht (das Bild zeigt nur diese neun): Reboots und Wiederbeleben (nur Reload/Teams - im Solo ohne Reload liefert cup-spieler keinen Wert),
  // und die niedrigsten Ratings - nur, wenn der Kreis das ganze Feld abdeckt (sonst waere es nur das Ende der Besten).
  { schluessel: 'reboots', feld: 'reboots', titel: 'Most Reboots & Revives', nachkomma: 0 },
  { schluessel: 'lowest', feld: 'lowest', titel: 'Lowest Rated', nachkomma: 1 },
];

type Roh = Record<string, unknown> & { epicId: string };
/** Die besten Zeilen einer Kennzahl; `gesamt` = wie viele Spieler diese Kennzahl im ganzen Feld haben (fuer Lowest Rated). */
type Holer = (kennzahl: string, pro: number) => Promise<Roh[] & { gesamt?: number }>;

const zahl = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const spieleVon = (z: Roh) => zahl(z.matches) ?? zahl(z.spiele) ?? 0;
const kills = (z: Roh) => zahl(z.kills) ?? zahl(z.elims) ?? 0;

/** Rating einer Zeile gegen die Bestwerte - siehe Formel oben. */
export function ratingVon(z: Roh, beste: { elims: number; damage: number; quote: number; hits: number }, ohneReplay = false): number {
  const teil = (v: number | null, max: number) => (v && max > 0 ? Math.min(1, v / max) : 0);
  const platz = zahl(z.platz);
  const p = platz && platz > 0 ? Math.max(0, (101 - platz) / 100) : 0;
  const g = RATING_GEWICHTE;
  const basis = g.elims * teil(kills(z), beste.elims) + g.damage * teil(zahl(z.damage), beste.damage) + g.platz * p;
  if (ohneReplay) return (100 * basis) / (g.elims + g.damage + g.platz);
  return 100 * (basis + g.quote * teil(zahl(z.quote) ?? zahl(z.damageRatio), beste.quote) + g.hits * teil(zahl(z.hits), beste.hits));
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
export async function baueLeader(hole: Holer, opt: { replayHinten?: () => boolean } = {}): Promise<LeaderAntwort> {
  const listen = await Promise.all(TAFELN.filter((t) => t.feld !== 'rating' && t.feld !== 'lowest').map(async (t) => [t, await hole(t.feld === 'kills' ? 'elims' : t.feld, 50).catch(() => [])] as const));
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
  /*
   * Liegt die volle Replay-Auswertung noch hinter Epic (Treffer und Ratio nur bei einem Teil der Spieler), zaehlen Treffer und Ratio fuer niemanden - sonst
   * stuende vorn, wer zufaellig schon ganz gelesen ist. Dann: Rating = 100 x (0.30 Elims + 0.25 Damage + 0.20 Platz) / 0.75.
   */
  // Nur wenn die volle Auswertung hinter Epic liegt (cup-spieler: replayStand) - bei grossen offenen Cups sind bewusst nur die besten Teams ganz gelesen, das bleibt wie in den Player Stats.
  const ohneReplay = !!opt.replayHinten?.() && gewertet.filter((z) => zahl(z.hits) !== null).length < gewertet.length * 0.9;
  const rating = new Map(gewertet.map((z) => {
    const r = ratingVon(z, beste, ohneReplay);
    const g = RATING_GEWICHTE;
    const ohneP = ohneReplay ? (g.elims + g.damage) / (g.elims + g.damage + g.platz) : 1 - g.platz;
    return [z.epicId, ohnePlatz ? r / ohneP : r];
  }));

  const zeile = (z: Roh, wert: number, rang: number): LeaderZeile => ({
    epicId: z.epicId, name: String(z.name ?? z.epicId.slice(0, 8)), land: String(z.land ?? ''), wert, rang, platz: zahl(z.platz), spiele: spieleVon(z),
  });
  /** Die ersten fuenf - gleicher (angezeigter) Wert, gleicher Rang. */
  const fuenf = (liste: Array<{ z: Roh; w: number }>, nachkomma: number, aufsteigend = false) => {
    const sortiert = liste.filter((x) => Number.isFinite(x.w) && (aufsteigend ? x.w >= 0 : x.w > 0)).sort((a, b) => (aufsteigend ? a.w - b.w : b.w - a.w));
    const raus: LeaderZeile[] = [];
    sortiert.slice(0, 5).forEach((x, i) => {
      const gleich = i > 0 && +sortiert[i - 1].w.toFixed(nachkomma) === +x.w.toFixed(nachkomma);
      raus.push(zeile(x.z, +x.w.toFixed(nachkomma), gleich ? raus[i - 1].rang : i + 1));
    });
    return raus;
  };

  const tafeln: LeaderTafel[] = [];
  // Waehrend die Replay-Auswertung hinter Epic liegt, nur die Tafeln, die fuer alle gelten (Rating, Elims, Damage) - eine Top 5 aus den wenigen schon ganz Gelesenen waere falsch.
  const NUR_EPIC = new Set(['rating', 'elims', 'damage']);
  for (const t of TAFELN) {
    if (ohneReplay && !NUR_EPIC.has(t.schluessel)) continue;
    let zeilen: LeaderZeile[];
    if (t.feld === 'lowest') {
      // Nur wenn der Kreis jeden Spieler mit Elims kennt (kleine Felder: Heats, Finals) - sonst fehlen die Schwaechsten im Kreis.
      const feldGesamt = Math.max(0, ...listen.map(([, l]) => (l as { gesamt?: number }).gesamt ?? 0));
      if (!feldGesamt || kreis.size < feldGesamt) continue;
      zeilen = fuenf(gewertet.map((z) => ({ z, w: rating.get(z.epicId) ?? 0 })), t.nachkomma, true);
    } else if (t.feld === 'rating') zeilen = fuenf(gewertet.map((z) => ({ z, w: rating.get(z.epicId) ?? 0 })), t.nachkomma);
    // Je-Spiel-Werte (Ratio) nur fuer Gewertete - sonst fuehrt einer mit wenigen Spielen.
    else if (t.feld === 'quote') zeilen = fuenf(gewertet.map((z) => ({ z, w: zahl(z.quote) ?? zahl(z.damageRatio) ?? 0 })), t.nachkomma);
    else zeilen = fuenf(alle.map((z) => ({ z, w: t.feld === 'kills' ? kills(z) : zahl(z[t.feld]) ?? 0 })), t.nachkomma);
    if (zeilen.length) tafeln.push({ schluessel: t.schluessel, titel: t.titel, nachkomma: t.nachkomma, ...(t.zeit ? { zeit: true } : {}), zeilen });
  }

  // Laender: je Land Anzahl, mittleres Rating, Summen; Treffer/Bauteile/Reboots nur, wenn jeder Spieler des Landes sie hat (sonst eine halbe Summe).
  const feldGesamt0 = Math.max(0, ...listen.map(([, l]) => (l as { gesamt?: number }).gesamt ?? 0));
  const nachLand = new Map<string, Roh[]>();
  for (const x of gewertet) { const l = String(x.land ?? '').toUpperCase(); nachLand.set(l, [...(nachLand.get(l) ?? []), x]); }
  const summeOderNull = (xs: Roh[], f: string) => (xs.every((x) => zahl(x[f]) !== null) ? xs.reduce((a, x) => a + (zahl(x[f]) ?? 0), 0) : null);
  const laender: LeaderLand[] = [...nachLand].map(([land, xs]) => {
    const best = [...xs].sort((a, b) => (rating.get(b.epicId) ?? 0) - (rating.get(a.epicId) ?? 0))[0];
    return {
      land, spieler: xs.length,
      rating: +(xs.reduce((a, x) => a + (rating.get(x.epicId) ?? 0), 0) / xs.length).toFixed(1),
      elims: xs.reduce((a, x) => a + kills(x), 0), damage: xs.reduce((a, x) => a + (zahl(x.damage) ?? 0), 0),
      hits: ohneReplay ? null : summeOderNull(xs, 'hits'), builds: ohneReplay ? null : summeOderNull(xs, 'builds'), reboots: summeOderNull(xs, 'reboots'),
      bester: best ? { name: String(best.name ?? best.epicId.slice(0, 8)), rating: +(rating.get(best.epicId) ?? 0).toFixed(1) } : null,
    };
  }).sort((a, b) => (a.land === '' ? 1 : 0) - (b.land === '' ? 1 : 0) || b.spieler - a.spieler || b.rating - a.rating);

  const erster = tafeln.find((t) => t.schluessel === 'rating')?.zeilen[0];
  const z = erster ? kreis.get(erster.epicId) : null;
  const mvp: LeaderMvp | null = z ? {
    epicId: z.epicId, name: String(z.name ?? z.epicId.slice(0, 8)), land: String(z.land ?? ''), platz: zahl(z.platz), spiele: spieleVon(z),
    rating: +(rating.get(z.epicId) ?? 0).toFixed(1), elims: kills(z), damage: zahl(z.damage) ?? 0, quote: zahl(z.quote) ?? zahl(z.damageRatio),
    hits: zahl(z.hits), headshots: zahl(z.headshots), builds: zahl(z.builds), damageTaken: zahl(z.damageTaken),
    ...(await fotoFuerKonto(z.epicId)),
  } : null;

  return { vorhanden: tafeln.length > 0, mvp, tafeln, formel: RATING_FORMEL, gewichte: RATING_GEWICHTE, mindestSpiele, spieleMax, gewertet: gewertet.length, ...(ohnePlatz ? { ohnePlatz: true } : {}), ...(ohneReplay ? { ohneReplay: true } : {}), laender, ganzesFeld: !!feldGesamt0 && kreis.size >= feldGesamt0,
    feld: gewertet.map((x) => ({ epicId: x.epicId, name: String(x.name ?? x.epicId.slice(0, 8)), land: String(x.land ?? ''), elims: kills(x), damage: zahl(x.damage) ?? 0, platz: zahl(x.platz), rating: +(rating.get(x.epicId) ?? 0).toFixed(1) }))
      .filter((x) => x.elims > 0 || x.damage > 0) };
}
