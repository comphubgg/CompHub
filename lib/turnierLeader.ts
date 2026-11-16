import { promises as fs } from 'node:fs';
import path from 'node:path';
import { liesJson } from '@/lib/ablage';

/*
 * Tournament Leaders (Betreiber, 15.11.2026): je Spieltag - oder je mehrtaegigem Event - ein "Event MVP" und die besten fuenf in acht Kennzahlen.
 *
 * Die Zahlen (16.11.2026): bei Solo-Spieltagen genau die von app/api/cup-stats (Damage, Elims, Time Alive, Headshots aus Epics Bestenliste, Hits, Builds,
 * Damage Taken aus den vollen Replays), sonst aus app/api/cup-spieler (unsere Replays bzw. die Szene-Quelle, je Spieler - nie Epics Team-Werte).
 * Siehe app/api/turnier-leader (rechneLeader). Eine Kennzahl, die weniger als 90 % der Gewerteten haben, bekommt keine Tafel, sondern steht in "fehlend" - ausser bei einem vorbeien Spieltag mit einer kleinen Luecke, die nachweislich niemanden aus der Top 5 betrifft (sicherOhne, Tafel mit "basis"). Damage Taken ist der Schaden von Spielern (ohne Sturm), wie bei der Damage Ratio. Mats Farmed und Distance
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
 *   Gewertet wird, wer mindestens die Haelfte der Spiele des Spielers mit den meisten Spielen gespielt hat (wie die Je-Spiel-Kacheln der Player Stats; "die meisten" ohne Ausreisser: die hoechste Spielzahl, die 5 % des Kreises erreichen);
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
  /** Die Tafel steht trotz Luecke (siehe sicherOhne in baueLeader): gerechnet aus `mit` von `von` gewerteten Spielern. */
  basis?: { mit: number; von: number };
}

export interface LeaderMvp {
  epicId: string;
  name: string;
  land: string;
  platz: number | null;
  spiele: number;
  rating: number;
  elims: number;
  /** null: fuer diesen Spieltag (noch) kein Schaden je Spieler - die Karte zeigt "–" statt 0. */
  damage: number | null;
  quote: number | null;
  hits: number | null;
  headshots: number | null;
  builds: number | null;
  damageTaken: number | null;
  /** Reboots & Revives (nur Reload/Teams) und Mats Farmed (nur Spitzhacke, Leser-Fassung 19) - null, wo es den Wert nicht (fuer genug Spieler) gibt. */
  reboots?: number | null;
  matsFarmed?: number | null;
  /** Datei in public/spielerbilder - nur bei nachgewiesener Zuordnung zur Konto-Id. */
  datei: string | null;
  gesicht: [number, number, number] | null;
}

export interface LeaderLand {
  /** Mittleres Rating der Gewerteten des Landes - null, wo es nicht fuer jeden sicher ist (oder bei "Unknown" ueber das ganze Feld). */
  land: string; spieler: number; rating: number | null; elims: number; damage: number | null;
  hits: number | null; builds: number | null; reboots: number | null;
  /** Mittlere Platzierung (Epics Endstand des Teams) - null, wenn sie nicht fuer jeden Spieler des Landes bekannt ist. */
  platz?: number | null;
  /** Bester im Rating - null, wenn ein Spieler ohne alle Werte ihn nachweislich noch ueberholen koennte. */
  bester: { name: string; rating: number } | null;
}

/** Summen ueber Spieler ohne bekanntes Land (das ganze Feld, siehe feldNachLand) - Summen nur, wenn jeder den Wert hat. */
export interface FeldSumme {
  spieler: number; platzSumme: number; platzAnzahl: number; elims: number;
  damage: number | null; hits: number | null; builds: number | null; reboots: number | null;
  /**
   * Fuer die Obergrenze des Ratings ausserhalb des Kreises: je Wert die hoechste Spielzahl unter den Spielern ohne diesen Wert (0 = keiner ohne). Nur wer
   * mindestens die Mindestzahl an Spielen hat, wird gewertet - ein fehlender Wert bei weniger Spielen aendert kein Rating.
   */
  ohne: { damage: number; hits: number; quote: number; platz: number };
}

/** Das ganze Feld nach Land: Spieler mit Land aus unseren Profilen einzeln (ein paar hundert hoechstens), der Rest als Summe. */
export interface FeldLaender { bekannt: Array<Record<string, unknown> & { epicId: string }>; unbekannt: FeldSumme }

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
  /** Kein Schaden je Spieler fuer diesen Spieltag (z. B. Team-Cup, dessen Replays noch nicht gelesen sind) - das Rating ohne den Damage-Anteil. */
  ohneDamage?: boolean;
  /**
   * Kennzahlen, deren Tafel fehlt, und warum (16.11.2026, Betreiber: keine Karte mit einem Spieler, wenn Daten fehlen - erst die Daten, und nur was es wirklich
   * nicht gibt, ehrlich benannt): 'laeuft' = die Replay-Auswertung ist noch nicht fertig, 'fehlt' = fuer diesen Spieltag gibt es (noch) keine volle
   * Replay-Auswertung, 'format' = die Kennzahl gibt es in diesem Format nicht (Reboots im Solo ohne Reload), 'neu' = der Spieltag wird gerade mit einer neueren
   * Leser-Fassung neu gelesen, 'alt' = der Spieltag ist fertig gelesen, die damals benutzte Leser-Fassung hat den Wert aber nicht erfasst (16.11.2026: S42 FNCS
   * Heat 2 EU vom 18.10. zeigte bei Builds "Auswertung laeuft noch" - dort laeuft nichts mehr, Bauteile kamen erst mit Fassung 18 dazu).
   */
  fehlend?: Array<{ schluessel: string; titel: string; grund: 'laeuft' | 'fehlt' | 'format' | 'neu' | 'alt' }>;
  /** Wie viele der Gewerteten ganz aus den Replays gelesen sind (fuer den Hinweis, solange die Auswertung laeuft). */
  replayAbdeckung?: { gelesen: number; von: number };
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

/**
 * Das ganze Feld nach Land aufteilen (app/api/cup-spieler ?laender=1, app/api/turnier-leader bei Solo-Cups). Ein Durchlauf, nichts wird aufgehoben.
 * `landVon` liefert das Land aus unseren Profilen ('' = unbekannt), `platzVon` Epics Endplatz (des Teams).
 */
export function feldNachLand<Z extends Record<string, unknown> & { epicId: string }>(alle: Z[], landVon: (z: Z) => string, platzVon: (z: Z) => number | null): FeldLaender {
  const bekannt: FeldLaender['bekannt'] = [];
  const u: FeldSumme = { spieler: 0, platzSumme: 0, platzAnzahl: 0, elims: 0, damage: 0, hits: 0, builds: 0, reboots: 0, ohne: { damage: 0, hits: 0, quote: 0, platz: 0 } };
  const plus = (k: 'damage' | 'hits' | 'builds' | 'reboots', v: unknown) => { const n = zahl(v); u[k] = n === null || u[k] === null ? null : (u[k] as number) + n; };
  for (const z of alle) {
    const land = landVon(z);
    const platz = platzVon(z);
    if (land) { bekannt.push({ ...z, land, platz }); continue; }
    u.spieler += 1;
    if (platz && platz > 0) { u.platzSumme += platz; u.platzAnzahl += 1; } else u.ohne.platz = Math.max(u.ohne.platz, spieleVon(z));
    u.elims += zahl(z.kills) ?? zahl(z.elims) ?? 0;
    plus('damage', z.damage); plus('hits', z.hits); plus('builds', z.builds); plus('reboots', z.reboots);
    const sp = spieleVon(z);
    if (zahl(z.damage) === null) u.ohne.damage = Math.max(u.ohne.damage, sp);
    if (zahl(z.hits) === null) u.ohne.hits = Math.max(u.ohne.hits, sp);
    if ((zahl(z.quote) ?? zahl(z.damageRatio)) === null) u.ohne.quote = Math.max(u.ohne.quote, sp);
  }
  return { bekannt, unbekannt: u };
}
const spieleVon = (z: Roh) => zahl(z.matches) ?? zahl(z.spiele) ?? 0;
const kills = (z: Roh) => zahl(z.kills) ?? zahl(z.elims) ?? 0;

/**
 * Rating einer Zeile gegen die Bestwerte - siehe Formel oben. Fehlt ein Teil fuer den ganzen Spieltag (keine Platzierung, keine Replay-Werte, kein Schaden),
 * zaehlen die uebrigen Teile, auf 100 hochgerechnet: Rating = 100 x Summe(Gewicht x Teil) / Summe(Gewichte der vorhandenen Teile). Mit allen Teilen ist das
 * genau die Formel oben; ohne Platz die bisherige "/ 0,80", ohne Treffer und Ratio die bisherige "/ 0,75".
 */
export function ratingVon(z: Roh, beste: { elims: number; damage: number; quote: number; hits: number },
  ohne: { replay?: boolean; platz?: boolean; damage?: boolean } = {}): number {
  const teil = (v: number | null, max: number) => (v && max > 0 ? Math.min(1, v / max) : 0);
  const platz = zahl(z.platz);
  const p = platz && platz > 0 ? Math.max(0, (101 - platz) / 100) : 0;
  const g = RATING_GEWICHTE;
  let summe = g.elims * teil(kills(z), beste.elims); let gewicht = g.elims;
  if (!ohne.damage) { summe += g.damage * teil(zahl(z.damage), beste.damage); gewicht += g.damage; }
  if (!ohne.platz) { summe += g.platz * p; gewicht += g.platz; }
  if (!ohne.replay) {
    summe += g.quote * teil(zahl(z.quote) ?? zahl(z.damageRatio), beste.quote) + g.hits * teil(zahl(z.hits), beste.hits);
    gewicht += g.quote + g.hits;
  }
  return (100 * summe) / gewicht;
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
export async function baueLeader(hole: Holer, opt: {
  replayHinten?: () => boolean;
  /** Gibt es fuer den Spieltag ueberhaupt Werte aus den vollen Replays? Nein: fehlende Tafeln heissen 'fehlt', sonst 'laeuft'. */
  schadenDa?: () => boolean;
  /** Stand der vollen Auswertung: noch teilweise ('laeuft'), wird neu gelesen ('neu') oder fertig ('fertig': was dann fehlt, hat der Leser nicht erfasst). */
  replayStand?: () => 'laeuft' | 'neu' | 'fertig';
  /** Der Spieltag ist vorbei - nur dann darf eine Tafel mit einer kleinen, nachweislich harmlosen Luecke stehen (sicherOhne). */
  vorbei?: () => boolean;
  /** Das ganze Feld nach Land (feldNachLand) - fuer die Laenderuebersicht ueber alle Spieler statt nur den Kreis. */
  feld?: () => Promise<FeldLaender | null | undefined>;
} = {}): Promise<LeaderAntwort> {
  const listen = await Promise.all(TAFELN.filter((t) => t.feld !== 'rating' && t.feld !== 'lowest').map(async (t) => [t, await hole(t.feld === 'kills' ? 'elims' : t.feld, 50).catch(() => [])] as const));
  const kreis = new Map<string, Roh>();
  for (const [, zeilen] of listen) for (const z of zeilen) if (z?.epicId && !kreis.has(z.epicId)) kreis.set(z.epicId, z);
  const alle = [...kreis.values()];
  const leer: LeaderAntwort = { vorhanden: false, mvp: null, tafeln: [], formel: RATING_FORMEL, gewichte: RATING_GEWICHTE, mindestSpiele: 0, spieleMax: 0, gewertet: 0 };
  if (!alle.length) return leer;

  /*
   * "Die meisten Spiele" ohne Ausreisser (16.11.2026): Cups ohne Spielgrenze kennen Teams, die frueh sterben und doppelt so oft spielen - Performance Evaluation
   * Cup Round 1 EU: BlackMonkey 77 und zikai. mit 16 Spielen (Platz 649), alle anderen hoechstens 8. Mit 16 galt "mindestens 8 Spiele", und Chap (61 Elims,
   * Platz 1, 7 Spiele) fiel aus dem Rating. Jetzt: die hoechste Spielzahl, die mindestens 5 % des Kreises erreichen.
   */
  const spielzahlen = alle.map(spieleVon).sort((a, b) => b - a);
  const spieleMax = spielzahlen[Math.min(spielzahlen.length - 1, Math.max(0, Math.ceil(spielzahlen.length * 0.05) - 1))] ?? 0;
  const mindestSpiele = Math.max(1, Math.ceil(spieleMax / 2));
  const gewertet = alle.filter((z) => spieleVon(z) >= mindestSpiele);
  // Kennt der Spieltag (noch) keine Platzierung, faellt dieser Teil weg und die uebrigen werden auf 100 hochgerechnet - sonst laege jeder um 20 Punkte zu tief.
  const ohnePlatz = !gewertet.some((z) => (zahl(z.platz) ?? 0) > 0);
  /*
   * Abdeckung je Kennzahl (16.11.2026): Anteil der Gewerteten, die einen Wert haben. cup-spieler und cup-stats geben Werte aus den vollen Replays nur fuer
   * Spieler, deren Spiele alle gelesen sind - waehrend die Auswertung laeuft (oder nach einem Neu-Lesen), sind das oft nur die mit wenigen Spielen. Eine Top 5
   * daraus waere falsch (FNCS Solos Reload Heat 2 EU am Morgen des 16.11.: "Most Damage Dealt" mit Nova, skinny covx, Kami). Unter 90 % entfaellt die Tafel
   * und steht in "fehlend" mit dem Grund.
   */
  const abdeckung = (feld: string) => (gewertet.length ? gewertet.filter((z) => zahl(feld === 'kills' ? kills(z) : z[feld]) !== null).length / gewertet.length : 0);
  const reicht = (feld: string) => abdeckung(feld) >= 0.9;
  const ohneDamage = !reicht('damage');
  // Treffer und Ratio fehlen (Replay-Auswertung laeuft oder fehlt): sie zaehlen fuer niemanden - sonst stuende vorn, wer zufaellig schon ganz gelesen ist.
  const ohneReplay = !reicht('hits') || !reicht('quote');
  const max = (f: (z: Roh) => number | null) => gewertet.reduce((m, z) => Math.max(m, f(z) ?? 0), 0);
  const beste = { elims: max(kills), damage: max((z) => zahl(z.damage)), quote: max((z) => zahl(z.quote) ?? zahl(z.damageRatio)), hits: max((z) => zahl(z.hits)) };
  const ohneTeile = { replay: ohneReplay, platz: ohnePlatz, damage: ohneDamage };
  const rating = new Map(gewertet.map((z) => [z.epicId, ratingVon(z, beste, ohneTeile)]));
  /*
   * Sicher der Beste? (16.11.2026, Event MVP und "Best Player" der Laender auf der Cup-Seite: nichts zeigen, was wegen fehlender Replay-Werte falsch sein
   * koennte.) Fehlt einem Gewerteten ein Wert, der ins Rating eingeht, zaehlt dieser Teil bei ihm 0. Seine Obergrenze: derselbe Spieler mit dem besten Wert
   * des Spieltags an jeder fehlenden Stelle (und Platz 1, wenn der Platz fehlt). Liegt sie ueber dem Rating des Kandidaten, ist der Kandidat nicht bewiesen.
   */
  const fehltTeil = (z: Roh) => (!ohneDamage && zahl(z.damage) === null) || (!ohnePlatz && !(zahl(z.platz) ?? 0))
    || (!ohneReplay && (zahl(z.hits) === null || (zahl(z.quote) ?? zahl(z.damageRatio)) === null));
  const obergrenze = (z: Roh) => ratingVon({
    ...z, damage: zahl(z.damage) ?? beste.damage, hits: zahl(z.hits) ?? beste.hits, quote: zahl(z.quote) ?? zahl(z.damageRatio) ?? beste.quote,
    damageRatio: null, platz: zahl(z.platz) || 1,
  }, beste, ohneTeile);
  /** Ob `kandidat` mit `wert` vor jedem Spieler aus `menge` liegt, auch wenn dessen fehlende Werte die besten waeren. */
  const sicherVor = (kandidat: string, wert: number, menge: Roh[]) => menge.every((z) => z.epicId === kandidat || !fehltTeil(z) || obergrenze(z) <= wert);
  const replayDa = opt.schadenDa ? opt.schadenDa() : true;
  const stand = opt.replayStand ? opt.replayStand() : 'laeuft';
  const gelesen = gewertet.filter((z) => zahl(z.hits) !== null).length;
  const fehlend: NonNullable<LeaderAntwort['fehlend']> = [];

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

  const wertVon = (z: Roh, feld: string) => (feld === 'quote' ? zahl(z.quote) ?? zahl(z.damageRatio) : zahl(z[feld]));
  /*
   * Kleine Luecke bei einem vorbeien Spieltag (Betreiber, 16.11.2026: die Leaders eines fertigen Cups sollen nie leer aussehen). Fehlt eine Kennzahl bei
   * hoechstens einem Viertel der Gewerteten, steht die Tafel mit "based on X of Y players" - aber nur, wenn keiner der Fehlenden die Top 5 plausibel
   * erreichen koennte. Der Massstab kommt aus dem Spieltag selbst: "Erreicher" sind die Gewerteten mit Wert, die mindestens 80 % des fuenften Werts haben.
   * Ein Fehlender ist harmlos, wenn er schwaecher ist als jeder Erreicher - gemessen an dem, woran die Kennzahl haengt: Damage, Treffer, Kopftreffer und
   * Ratio an den Elims (weniger Elims als der Erreicher mit den wenigsten), Time Alive an der Platzierung (schlechter platziert als der am schlechtesten
   * platzierte Erreicher), alles andere (Bauteile, erlittener Schaden, Reboots) an beidem. Nur die Elims reichen bei Damage nicht doppelt zu pruefen: im Trio
   * ist ein Spieler mit 3 Elims oft gut platziert (sein Team), das sagt ueber seinen Schaden nichts. Haengt eine Kennzahl kaum am Massstab, sind unter den
   * Erreichern auch schwache Spieler - die Schwelle faellt, und die Tafel bleibt verborgen. Lieber eine Tafel zu wenig als eine falsche Top 5.
   * Gegenprobe (Performance Evaluation Cup Event 1 Round 1 EU, ganz gelesen, die schwaechsten 14 % kuenstlich ohne Werte): Damage, Treffer, Kopftreffer und
   * Ratio stehen mit "based on", Time Alive, Bauteile und erlittener Schaden bleiben verborgen; fehlt zusaetzlich ein starker Spieler, bleibt alles verborgen.
   * Beispiel Performance Evaluation Cup Round 1 EU (12.11.2026), 16.11. mittags: die 32 Fehlenden waren Chap, swizzy, akiira, KAAN ... (61, 60, 50, 48 Elims;
   * Platz 1 und 2) - ihre Spiele lagen in den 20 noch nicht voll gelesenen Matches. Die Regel haelt diese Tafeln zurueck.
   */
  const sicherOhne = (feld: string) => {
    if (!(opt.vorbei?.() ?? false) || !replayDa) return false;
    // Derselbe Kreis wie die Tafel: die Ratio nur unter Gewerteten, die Summen-Kennzahlen unter allen.
    const kreisDerTafel = feld === 'quote' ? gewertet : alle;
    const ohne = kreisDerTafel.filter((z) => wertVon(z, feld) === null);
    if (!ohne.length || ohne.length > 0.25 * kreisDerTafel.length) return false;
    const mit = kreisDerTafel.map((z) => ({ z, w: wertVon(z, feld) })).filter((x): x is { z: Roh; w: number } => x.w !== null && x.w > 0).sort((a, b) => b.w - a.w);
    if (mit.length < 5) return false;
    const erreicher = mit.filter((x) => x.w >= 0.8 * mit[4].w);
    const minElims = Math.min(...erreicher.map((x) => kills(x.z)));
    const plaetze = erreicher.map((x) => zahl(x.z.platz));
    const schlechtester = ohnePlatz ? null : plaetze.every((p) => p !== null && p > 0) ? Math.max(...(plaetze as number[])) : -1;
    if (schlechtester === -1) return false;
    const nachElims = feld !== 'timeAlive';
    const nachPlatz = !['damage', 'hits', 'headshots', 'quote'].includes(feld);
    // Time Alive ohne bekannte Platzierung: kein Massstab - verborgen lassen.
    if (nachPlatz && schlechtester === null && !nachElims) return false;
    return ohne.every((z) => {
      const p = zahl(z.platz);
      return (!nachElims || kills(z) < minElims) && (!nachPlatz || schlechtester === null || (p !== null && p > schlechtester));
    });
  };

  const tafeln: LeaderTafel[] = [];
  for (const t of TAFELN) {
    let basis: LeaderTafel['basis'];
    if (t.feld !== 'rating' && t.feld !== 'lowest' && t.feld !== 'kills' && !reicht(t.feld)) {
      // Reboots gibt es im Solo ohne Reload nicht (cup-spieler liefert dort keinen Wert) - das ist kein Datenloch.
      const format = t.feld === 'reboots' && !gewertet.some((z) => zahl(z.reboots) !== null);
      if (!format && sicherOhne(t.feld)) basis = { mit: gewertet.filter((z) => wertVon(z, t.feld) !== null).length, von: gewertet.length };
      else {
        fehlend.push({ schluessel: t.schluessel, titel: t.titel, grund: format && replayDa && gelesen > 0 ? 'format' : !replayDa ? 'fehlt' : stand === 'fertig' ? 'alt' : stand });
        continue;
      }
    }
    let zeilen: LeaderZeile[];
    if (t.feld === 'lowest') {
      // Nur wenn der Kreis jeden Spieler mit Elims kennt (kleine Felder: Heats, Finals) - sonst fehlen die Schwaechsten im Kreis.
      const feldGesamt = Math.max(0, ...listen.map(([, l]) => (l as { gesamt?: number }).gesamt ?? 0));
      if (!feldGesamt || kreis.size < feldGesamt) continue;
      zeilen = fuenf(gewertet.map((z) => ({ z, w: rating.get(z.epicId) ?? 0 })), t.nachkomma, true);
    } else if (t.feld === 'rating') zeilen = fuenf(gewertet.map((z) => ({ z, w: rating.get(z.epicId) ?? 0 })), t.nachkomma);
    // Je-Spiel-Werte (Ratio) nur fuer Gewertete - sonst fuehrt einer mit wenigen Spielen.
    else if (t.feld === 'quote') zeilen = fuenf(gewertet.map((z) => ({ z, w: wertVon(z, 'quote') ?? 0 })), t.nachkomma);
    else zeilen = fuenf(alle.map((z) => ({ z, w: t.feld === 'kills' ? kills(z) : zahl(z[t.feld]) ?? 0 })), t.nachkomma);
    if (zeilen.length) tafeln.push({ schluessel: t.schluessel, titel: t.titel, nachkomma: t.nachkomma, ...(t.zeit ? { zeit: true } : {}), zeilen, ...(basis ? { basis } : {}) });
  }

  const feld = opt.feld ? await opt.feld().catch(() => null) : null;
  /*
   * Obergrenze fuer alle ausserhalb des Kreises (16.11.2026): wer in keiner Kennzahl unter den besten 50 steht, hat ueberall hoechstens den 50. Wert -
   * wo die Liste kuerzer ist, steht jeder mit einem Wert darin. Fehlt Spielern ausserhalb ein Wert (feld.ohne), zaehlt dort der beste; der Platz immer als 1.
   */
  const listeVon = (feld0: string) => listen.find(([t]) => t.feld === feld0)?.[1] ?? [];
  const funfzigster = (feld0: string, f: (z: Roh) => number | null) => { const l = listeVon(feld0); return l.length >= 50 ? (f(l[49]) ?? 0) : 0; };
  // Ohne Feld (unbekannt, wem draussen etwas fehlt) gilt jeder Wert als moeglicherweise fehlend - also der beste.
  const ausserhalb = (ohne: FeldSumme['ohne'] | null) => ratingVon({
    epicId: '', kills: funfzigster('kills', kills), platz: 1,
    damage: !ohne || ohne.damage >= mindestSpiele ? beste.damage : funfzigster('damage', (z) => zahl(z.damage)),
    hits: !ohne || ohne.hits >= mindestSpiele ? beste.hits : funfzigster('hits', (z) => zahl(z.hits)),
    quote: !ohne || ohne.quote >= mindestSpiele ? beste.quote : funfzigster('quote', (z) => zahl(z.quote) ?? zahl(z.damageRatio)),
  }, beste, ohneTeile);
  const ohneMax = (f: (x: Roh) => number | null, u: number) => Math.max(u, ...(feld?.bekannt ?? []).filter((x) => f(x) === null).map(spieleVon));
  const ohneAlle: FeldSumme['ohne'] | null = feld ? {
    damage: ohneMax((x) => zahl(x.damage), feld.unbekannt.ohne.damage),
    hits: ohneMax((x) => zahl(x.hits), feld.unbekannt.ohne.hits),
    quote: ohneMax((x) => zahl(x.quote) ?? zahl(x.damageRatio), feld.unbekannt.ohne.quote),
    platz: 0,
  } : null;
  const grundJetzt = (): NonNullable<LeaderAntwort['fehlend']>[number]['grund'] => (!replayDa ? 'fehlt' : stand === 'fertig' ? 'alt' : stand);

  const erster = tafeln.find((t) => t.schluessel === 'rating')?.zeilen[0];
  const z0 = erster ? kreis.get(erster.epicId) : null;
  // Der Event MVP nur, wenn kein Spieler mit fehlenden Werten (im Kreis oder ausserhalb) ihn noch ueberholen koennte - sonst auch keine "Highest Rated"-Tafel.
  const mvpSicher = !!z0 && sicherVor(z0.epicId, rating.get(z0.epicId) ?? 0, gewertet) && ausserhalb(ohneAlle) <= (rating.get(z0.epicId) ?? 0);
  if (z0 && !mvpSicher) {
    const i = tafeln.findIndex((t) => t.schluessel === 'rating');
    if (i >= 0) tafeln.splice(i, 1);
    fehlend.unshift({ schluessel: 'rating', titel: 'Event MVP / Highest Rated', grund: grundJetzt() });
  }
  const z = mvpSicher ? z0 : null;
  const mvp: LeaderMvp | null = z ? {
    epicId: z.epicId, name: String(z.name ?? z.epicId.slice(0, 8)), land: String(z.land ?? ''), platz: zahl(z.platz), spiele: spieleVon(z),
    // Nur Werte, die es gibt: fehlt einer (auch beim MVP selbst), steht null - nie 0 an seiner Stelle.
    rating: +(rating.get(z.epicId) ?? 0).toFixed(1), elims: kills(z), damage: ohneDamage ? null : zahl(z.damage),
    quote: ohneReplay ? null : zahl(z.quote) ?? zahl(z.damageRatio),
    hits: ohneReplay ? null : zahl(z.hits), headshots: reicht('headshots') ? zahl(z.headshots) : null, builds: reicht('builds') ? zahl(z.builds) : null,
    damageTaken: reicht('damageTaken') ? zahl(z.damageTaken) : null,
    reboots: reicht('reboots') ? zahl(z.reboots) : null,
    matsFarmed: reicht('matsFarmed') ? zahl(z.matsFarmed) : null,
    ...(await fotoFuerKonto(z.epicId)),
  } : null;

  /*
   * Laender (16.11.2026, Cup-Seite): mit dem ganzen Feld (opt.feld) je Land alle Spieler - Anzahl, mittlere Platzierung, Summen; ohne es nur die Gewerteten
   * des Kreises (wie bisher, ganzesFeld = false). Land nur aus unseren Profilen, der Rest als "Unknown" ('').
   * Summen nur, wenn jeder Spieler des Landes den Wert hat (sonst eine halbe Summe); Treffer/Bauteile nicht, solange das Rating sie nicht zaehlt.
   * Der Beste im Rating nur, wenn ihn kein Landsmann mit fehlenden Werten ueberholen koennte (sicherVor) - bei "Unknown" mit dem ganzen Feld zusaetzlich
   * gegen die Obergrenze ausserhalb des Kreises.
   */
  const feldGesamt0 = Math.max(0, ...listen.map(([, l]) => (l as { gesamt?: number }).gesamt ?? 0));
  const summeOderNull = (xs: Roh[], f: string) => (xs.every((x) => zahl(x[f]) !== null) ? xs.reduce((a, x) => a + (zahl(x[f]) ?? 0), 0) : null);
  const besterVon = (xs: Roh[], mitAusserhalb: boolean) => {
    const bewertet = xs.filter((x) => spieleVon(x) >= mindestSpiele);
    const r = (x: Roh) => rating.get(x.epicId) ?? ratingVon(x, beste, ohneTeile);
    const best = [...bewertet].sort((a, b) => r(b) - r(a))[0];
    if (!best) return null;
    const w = r(best);
    if (!sicherVor(best.epicId, w, bewertet) || (mitAusserhalb && ausserhalb(feld?.unbekannt.ohne ?? null) > w)) return null;
    return { name: String(best.name ?? best.epicId.slice(0, 8)), rating: +w.toFixed(1) };
  };
  const landZeile = (land: string, xs: Roh[]): LeaderLand => {
    const bewertet = xs.filter((x) => spieleVon(x) >= mindestSpiele);
    const ratings = bewertet.map((x) => rating.get(x.epicId) ?? ratingVon(x, beste, ohneTeile));
    return {
      land, spieler: xs.length,
      rating: bewertet.length && bewertet.every((x) => !fehltTeil(x)) ? +(ratings.reduce((a, v) => a + v, 0) / ratings.length).toFixed(1) : null,
      platz: xs.every((x) => (zahl(x.platz) ?? 0) > 0) ? +(xs.reduce((a, x) => a + (zahl(x.platz) ?? 0), 0) / xs.length).toFixed(1) : null,
      elims: xs.reduce((a, x) => a + kills(x), 0), damage: ohneDamage ? null : summeOderNull(xs, 'damage'),
      hits: ohneReplay ? null : summeOderNull(xs, 'hits'), builds: ohneReplay ? null : summeOderNull(xs, 'builds'), reboots: summeOderNull(xs, 'reboots'),
      bester: besterVon(xs, false),
    };
  };
  const nachLand = new Map<string, Roh[]>();
  for (const x of feld ? feld.bekannt : gewertet) { const l = String(x.land ?? '').toUpperCase(); nachLand.set(l, [...(nachLand.get(l) ?? []), x]); }
  let laender: LeaderLand[] = [...nachLand].map(([land, xs]) => landZeile(land, xs));
  if (feld && feld.unbekannt.spieler > 0) {
    const u = feld.unbekannt;
    laender = laender.filter((l) => l.land !== '');
    laender.push({
      land: '', spieler: u.spieler, rating: null,
      platz: u.platzAnzahl === u.spieler ? +(u.platzSumme / u.spieler).toFixed(1) : null,
      elims: u.elims, damage: ohneDamage ? null : u.damage, hits: ohneReplay ? null : u.hits, builds: ohneReplay ? null : u.builds, reboots: u.reboots,
      // Die Unbekannten des Kreises - und keiner ausserhalb darf sie nachweislich schlagen koennen.
      bester: besterVon(gewertet.filter((x) => !String(x.land ?? '')), true),
    });
  }
  laender.sort((a, b) => (a.land === '' ? 1 : 0) - (b.land === '' ? 1 : 0) || b.spieler - a.spieler || (b.rating ?? 0) - (a.rating ?? 0));
  const ganzesFeld = !!feld || (!!feldGesamt0 && kreis.size >= feldGesamt0);

  return { vorhanden: tafeln.length > 0, mvp, tafeln, formel: RATING_FORMEL, gewichte: RATING_GEWICHTE, mindestSpiele, spieleMax, gewertet: gewertet.length, ...(ohnePlatz ? { ohnePlatz: true } : {}), ...(ohneReplay ? { ohneReplay: true } : {}), ...(ohneDamage ? { ohneDamage: true } : {}), laender, ganzesFeld,
    ...(fehlend.length ? { fehlend } : {}), replayAbdeckung: { gelesen, von: gewertet.length },
    // Das Performance Board braucht den Schaden - ohne ihn kein Board (statt aller Punkte auf 0).
    feld: ohneDamage ? [] : gewertet.map((x) => ({ epicId: x.epicId, name: String(x.name ?? x.epicId.slice(0, 8)), land: String(x.land ?? ''), elims: kills(x), damage: zahl(x.damage) ?? 0, platz: zahl(x.platz), rating: +(rating.get(x.epicId) ?? 0).toFixed(1) }))
      .filter((x) => x.elims > 0 || x.damage > 0) };
}
