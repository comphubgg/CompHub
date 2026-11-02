/*
 * FNCS All-Time: die feste Reihenfolge bei gleichem Wert. Vorher entschied die Einfuegereihenfolge (bei den Rekorden sogar die
 * Reihenfolge, in der die Endspiele zuerst fertig luden) - jetzt hat jede Liste eine Nebenregel, am Ende Staerke/Region/Kennung, nie der Name.
 * Es gibt KEINE geteilten Plaetze (der Betreiber hat chef-102 abgelehnt): wer gleich viel hat, steht trotzdem eine Zeile hinter dem
 * anderen, die Platznummer ist die Zeile. Reine Vergleiche ohne Server-Importe, damit Server (Auswahl der Top 80/100) und Seite
 * (Platz, Suche) dieselbe Reihenfolge nutzen.
 */

export const nameVgl = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en') || (a < b ? -1 : a > b ? 1 : 0);

type ElimsZeile = { name: string; gesamt: number; je: Record<string, number>; id?: string };

/** Feste Kennung (Epic-Konto-Id): nur die allerletzte Stufe, wenn sonst nichts mehr unterscheidet. Ohne Kennung: gleich. */
const kennungVgl = (a?: string, b?: string) => (a && b ? (a < b ? -1 : a > b ? 1 : 0) : 0);

/** Bestenliste Eliminierungen (Total): mehr Eliminierungen, dann der staerkste einzelne Major, dann in mehr Majors dabei, dann Konto-Id (nie der Name). */
export function vglElims(a: ElimsZeile, b: ElimsZeile): number {
  const best = (x: ElimsZeile) => Math.max(0, ...Object.values(x.je));
  return b.gesamt - a.gesamt || best(b) - best(a) || Object.keys(b.je).length - Object.keys(a.je).length || kennungVgl(a.id, b.id);
}

/** Dieselbe Liste nach einem einzelnen Major: dessen Wert, dann die Total-Regel. */
export const vglElimsMajor = (key: string) => (a: ElimsZeile, b: ElimsZeile) => (b.je[key] ?? -1) - (a.je[key] ?? -1) || vglElims(a, b);

/** Wie viele Zeilen die Eliminierungs-Tabelle zeigt - je Sortierung (Total oder ein Major). */
export const ELIMS_ZEILEN = 80;

/**
 * Die Zeilen der Eliminierungs-Tabelle: bei "gesamt" die 80 Besten nach Total, bei einem Major die 80 Besten dieses Majors
 * (nur wer dort gespielt hat). Server (Vereinigung beider Auswahlen) und Seite nutzen dieselbe Regel, damit nichts fehlt.
 */
export function elimsAuswahl<T extends ElimsZeile>(alle: T[], sortNach: string): T[] {
  if (sortNach === 'gesamt') return [...alle].sort(vglElims).slice(0, ELIMS_ZEILEN);
  return alle.filter((x) => x.je[sortNach] !== undefined).sort(vglElimsMajor(sortNach)).slice(0, ELIMS_ZEILEN);
}

type LbZeile = { name: string; punkte: number; siege: number; elims: number; finals: number; bestRang?: number; zuletzt?: number; kennung?: string };

/** All-Time Leaderboard: mehr Punkte, dann mehr Siege, dann mehr Eliminierungen, dann weniger Endspiele (gleiche Ausbeute aus weniger Spielen), dann der bessere beste Platz, dann zuletzt aktiver, dann Konto-Id (nie der Name). */
export const vglLeaderboard = (a: LbZeile, b: LbZeile) =>
  b.punkte - a.punkte || b.siege - a.siege || b.elims - a.elims || a.finals - b.finals ||
  (a.bestRang ?? 1e9) - (b.bestRang ?? 1e9) || (b.zuletzt ?? 0) - (a.zuletzt ?? 0) || kennungVgl(a.kennung, b.kennung);

export type RekordTeam = { event: string; punkte: number; siege: number; elims: number; spieler: Array<{ name: string }>; eu?: boolean; datum?: number; rang?: number; kennung?: string };

/** Rekorde je Grand Finals: der Hauptwert, dann die uebrigen Werte in fester Reihenfolge (Punkte, Siege, Elims), dann EU-Endspiele zuerst, neuere zuerst, besserer Platz, Event-Id (nie das Alphabet). */
export const vglRekord = (haupt: 'punkte' | 'siege' | 'elims') => {
  const rest = (['punkte', 'siege', 'elims'] as const).filter((k) => k !== haupt);
  return (a: RekordTeam, b: RekordTeam) =>
    b[haupt] - a[haupt] || b[rest[0]] - a[rest[0]] || b[rest[1]] - a[rest[1]] || Number(b.eu ?? false) - Number(a.eu ?? false) || (b.datum ?? 0) - (a.datum ?? 0) || (a.rang ?? 1e9) - (b.rang ?? 1e9) || kennungVgl(a.kennung, b.kennung);
};
