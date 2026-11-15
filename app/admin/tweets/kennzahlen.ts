/*
 * Einheitliche Kennzahlen fuer die Beitragstexte (Betreiber, 15.11.2026: Player Card mit doppelten Zeilen - zweimal "Damage Ratio", zweimal
 * "Distance Traveled", "Healing Done" neben "Heals Used", "Time In Storm: 475" ohne Einheit).
 *
 * Die Bestenlisten kommen aus zwei Quellen: app/api/cup-stats (Epics Leaderboard plus Replays, dieselben Kacheln wie auf der Event-Seite) und den
 * Einzelwerten (Replays / Szene-Quelle, SPIELER_KENNZAHLEN in page.tsx). Beide fuehren dieselbe Kennzahl unter verschiedenen Schluesseln ("treffer" und
 * "hits", "matsGefarmt" und "mats", "sturm" und "timeInStorm", "strecke" und "distanzGesamt"). Hier bekommt jede Kennzahl genau eine Kennung, einen Namen
 * und ein Zeichen; je Kennung bleibt eine Liste - die aus der genaueren Quelle (vorrang).
 *
 * Reine Funktionen ohne React, damit sie sich mit node pruefen lassen (scratchpad-Test, siehe Bericht).
 */

export interface KennzahlPlatz {
  rank: number; spieler: string[]; wert: number; roh: number;
  ids?: string[];
  /** Platz in dieser Kennzahl mit Gleichstand (1, 2, 2, 4) - liefert app/api/cup-stats. */
  statPlatz?: number;
}
export interface KennzahlListe {
  schluessel: string; titel: string; symbol: string;
  einheit: string | null;
  /** Sekunden - angezeigt als "1h 58m" / "7m 55s". */
  zeit?: boolean;
  nachkomma?: number;
  plaetze: KennzahlPlatz[];
  alle?: KennzahlPlatz[];
}

interface Kanon {
  /** Dieselbe Kennung = dieselbe Kennzahl, egal aus welcher Quelle. */
  id: string; titel: string; symbol: string;
  einheit?: string | null; zeit?: boolean; nachkomma?: number;
  /** Kleiner gewinnt, wenn zwei Quellen dieselbe Kennzahl fuehren. */
  vorrang?: number;
  /** Faellt weg, sobald eine dieser Kennungen vorliegt. */
  verdraengtVon?: string[];
}

/*
 * Zeichen: positive Werte positiv, negative negativ, keins doppelt. Kein 💚/🟢 (Osirion-Gruen). Eliminierungen ⚔️, K/D 📊, Kopftreffer 🎯, Treffer 🔫,
 * Tode 💀, erlittener Schaden 🩸, Gefarmtes ⛏️, verbautes Material 🧱, Bauteile 🏗️.
 */
const KANON: Record<string, Kanon> = {
  points:       { id: 'points',     titel: 'Most Points',              symbol: '🏆' },
  wins:         { id: 'wins',       titel: 'Most Victory Royales',     symbol: '👑' },
  kd:           { id: 'kd',         titel: 'Best K/D',                 symbol: '📊', nachkomma: 2 },
  avgPlace:     { id: 'avgPlace',   titel: 'Best Average Placement',   symbol: '📍', nachkomma: 2 },
  quote:        { id: 'quote',      titel: 'Best Damage Ratio',        symbol: '⚖️', nachkomma: 2 },
  // Dieselbe Zahl wie "Best Damage Ratio", nur von hinten sortiert - fuer Worst of und den Recap, nie auf einer Karte ueber einen Spieler.
  quoteNiedrig: { id: 'quoteNiedrig', titel: 'Lowest Damage Ratio',    symbol: '🔻', nachkomma: 2 },
  elims:        { id: 'elims',      titel: 'Most Eliminations',        symbol: '⚔️' },
  knocks:       { id: 'knocks',     titel: 'Most Knocks',              symbol: '🥊' },
  gestorben:    { id: 'gestorben',  titel: 'Most Deaths',              symbol: '💀' },
  headshots:    { id: 'headshots',  titel: 'Most Headshots',           symbol: '🎯' },
  treffer:      { id: 'hits',       titel: 'Most Hits to Players',     symbol: '🔫', vorrang: 0 },
  hits:         { id: 'hits',       titel: 'Most Hits to Players',     symbol: '🔫', vorrang: 1 },
  damage:       { id: 'damage',     titel: 'Most Damage Dealt',        symbol: '💥' },
  damageTaken:  { id: 'damageTaken', titel: 'Most Damage Taken',       symbol: '🩸' },
  assists:      { id: 'assists',    titel: 'Most Assists',             symbol: '🤝' },
  reboots:      { id: 'reboots',    titel: 'Most Reboots & Revives',   symbol: '🚑' },
  fallDamage:   { id: 'fallDamage', titel: 'Most Fall Damage',         symbol: '🪂' },
  stormDamage:  { id: 'stormDamage', titel: 'Most Storm Damage',       symbol: '⛈️' },
  clutch:       { id: 'clutch',     titel: 'Most Solo Clutch Points',  symbol: '🧊' },
  matsGefarmt:  { id: 'mats',       titel: 'Most Mats Farmed',         symbol: '⛏️', vorrang: 0 },
  mats:         { id: 'mats',       titel: 'Most Mats Farmed',         symbol: '⛏️', vorrang: 1 },
  matsVerbaut:  { id: 'matsVerbaut', titel: 'Most Mats Used',          symbol: '🧱' },
  builds:       { id: 'builds',     titel: 'Most Builds Placed',       symbol: '🏗️' },
  kisten:       { id: 'kisten',     titel: 'Most Chests Opened',       symbol: '📦' },
  // Epic zaehlt Heil- und Schildvorgaenge (GainedHealthTimes / GainedShieldTimes), keine Lebenspunkte. "heals" der Einzelwerte ist bei Epic die Summe
  // beider - neben den zwei Einzelzeilen also doppelt gezaehlt und faelschlich "Healing Done" genannt.
  heilung:      { id: 'heilung',    titel: 'Most Heals Used',          symbol: '💊' },
  schild:       { id: 'schild',     titel: 'Most Shields Used',        symbol: '🛡️' },
  heals:        { id: 'heals',      titel: 'Most Heals & Shields Used', symbol: '❤️‍🩹', verdraengtVon: ['heilung', 'schild'] },
  // Eine Strecke: Epics Wert (zu Fuss plus Gleiter, wie Osirion) vor den Replay-Proben, die nur alle 10 s messen und darunter liegen.
  strecke:      { id: 'distanz',    titel: 'Most Distance Traveled',   symbol: '🏃', einheit: 'km', nachkomma: 1, vorrang: 0 },
  distanz:      { id: 'distanz',    titel: 'Most Distance Traveled',   symbol: '🏃', einheit: 'km', nachkomma: 1, vorrang: 1 },
  distanzGesamt: { id: 'distanz',   titel: 'Most Distance Traveled',   symbol: '🏃', einheit: 'km', nachkomma: 1, vorrang: 2 },
  sturm:        { id: 'sturm',      titel: 'Most Time in Storm',       symbol: '🌪️', einheit: null, zeit: true, vorrang: 0 },
  timeInStorm:  { id: 'sturm',      titel: 'Most Time in Storm',       symbol: '🌪️', einheit: null, zeit: true, vorrang: 1 },
  timeAlive:    { id: 'timeAlive',  titel: 'Most Time Alive',          symbol: '⏱️', einheit: null, zeit: true },
  avgTimeAlive: { id: 'avgTimeAlive', titel: 'Longest Avg Time Alive', symbol: '⏳', einheit: null, zeit: true },
  genauigkeit:  { id: 'genauigkeit', titel: 'Best Accuracy',           symbol: '🔎', einheit: '%', nachkomma: 1 },
};

const VERDRAENGT = new Map(Object.values(KANON).filter((k) => k.verdraengtVon).map((k) => [k.id, k.verdraengtVon!] as const));

/** Jede Kennzahl einmal, mit einheitlichem Namen, Zeichen und Format. Reihenfolge: wie die Kennzahl zuerst auftaucht. */
export function vereinheitlichen<T extends KennzahlListe>(listen: T[]): T[] {
  const nachId = new Map<string, { liste: T; vorrang: number; stelle: number }>();
  listen.forEach((b, stelle) => {
    const k = KANON[b.schluessel];
    const id = k?.id ?? b.schluessel;
    const neu = {
      ...b,
      titel: k?.titel ?? b.titel,
      symbol: k?.symbol ?? b.symbol,
      einheit: k && 'einheit' in k ? (k.einheit ?? null) : b.einheit,
      zeit: k?.zeit ?? b.zeit ?? false,
      nachkomma: k?.nachkomma ?? b.nachkomma,
    } as T;
    const vorrang = k?.vorrang ?? 0;
    const alt = nachId.get(id);
    if (!alt) nachId.set(id, { liste: neu, vorrang, stelle });
    else if (vorrang < alt.vorrang) nachId.set(id, { liste: neu, vorrang, stelle: alt.stelle });
  });
  const da = new Set(nachId.keys());
  return [...nachId.entries()]
    .filter(([id]) => !(VERDRAENGT.get(id) ?? []).some((v) => da.has(v)))
    .sort((a, b) => a[1].stelle - b[1].stelle)
    .map(([, v]) => v.liste);
}

/** Was auf einer Karte ueber EINEN Spieler / EIN Team stehen darf: ohne "Lowest Damage Ratio" (dieselbe Zahl wie die Damage Ratio). */
export function fuerEinzelne<T extends KennzahlListe>(listen: T[]): T[] {
  return listen.filter((b) => b.schluessel !== 'quoteNiedrig');
}

/** Sekunden lesbar: "1h 58m", "7m 55s", "42s". */
export function dauer(sekunden: number): string {
  const s = Math.max(0, Math.round(sekunden));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return r ? `${m}m ${r}s` : `${m}m`;
  return `${r}s`;
}

/** Ein Wert mit Einheit: Zeit formatiert, "%" ohne Abstand, "21.1 km", sonst "1,252". */
export function wertText(b: Pick<KennzahlListe, 'einheit' | 'zeit' | 'nachkomma'>, wert: number): string {
  if (b.zeit) return dauer(wert);
  // Alte Listen in Minuten (vor dem 15.11.2026) - nie als nackte Zahl.
  if (b.einheit === 'min') return dauer(wert * 60);
  const n = b.nachkomma;
  const zahl = wert.toLocaleString('en-US', n === undefined
    ? { maximumFractionDigits: 2 }
    : { minimumFractionDigits: n, maximumFractionDigits: n });
  if (b.einheit === '%') return `${zahl}%`;
  return b.einheit ? `${zahl} ${b.einheit}` : zahl;
}

/**
 * Der Kachelname als Spaltenkopf: "Most Damage Dealt" -> "Damage Dealt", "Longest Avg Time Alive" -> "Avg Time Alive".
 * "Lowest" bleibt stehen - sonst stuende "Lowest Damage Ratio" als zweite "Damage Ratio" da.
 */
export function spaltenName(titel: string) {
  return titel.replace(/^(Most|Best|Highest|Longest)\s+/i, '');
}

/** Eine Zeile ueber einen einzelnen Spieler oder ein Team: "⚔️ Eliminations: 19 (#3)". */
export function einzelZeile(b: KennzahlListe, wert: number, platz?: number): string {
  return `${b.symbol} ${spaltenName(b.titel)}: ${wertText(b, wert)}${platz ? ` (#${platz})` : ''}`;
}
