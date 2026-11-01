/*
 * FNCS All-Time: die feste Reihenfolge bei gleichem Wert. Vorher entschied die Einfuegereihenfolge (bei den Rekorden sogar die
 * Reihenfolge, in der die Endspiele zuerst fertig luden) - jetzt hat jede Liste eine Nebenregel, am Ende immer der Name.
 * Es gibt KEINE geteilten Plaetze (der Betreiber hat chef-102 abgelehnt): wer gleich viel hat, steht trotzdem eine Zeile hinter dem
 * anderen, die Platznummer ist die Zeile. Reine Vergleiche ohne Server-Importe, damit Server (Auswahl der Top 80/100) und Seite
 * (Platz, Suche) dieselbe Reihenfolge nutzen.
 */

export const nameVgl = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en') || (a < b ? -1 : a > b ? 1 : 0);

type ElimsZeile = { name: string; gesamt: number; je: Record<string, number> };

/** Bestenliste Eliminierungen (Total): mehr Eliminierungen, dann der staerkste einzelne Major, dann Name. */
export function vglElims(a: ElimsZeile, b: ElimsZeile): number {
  const best = (x: ElimsZeile) => Math.max(0, ...Object.values(x.je));
  return b.gesamt - a.gesamt || best(b) - best(a) || nameVgl(a.name, b.name);
}

/** Dieselbe Liste nach einem einzelnen Major: dessen Wert, dann die Total-Regel. */
export const vglElimsMajor = (key: string) => (a: ElimsZeile, b: ElimsZeile) => (b.je[key] ?? -1) - (a.je[key] ?? -1) || vglElims(a, b);

type LbZeile = { name: string; punkte: number; siege: number; elims: number; finals: number };

/** All-Time Leaderboard: mehr Punkte, dann mehr Siege, dann mehr Eliminierungen, dann weniger Endspiele (gleiche Ausbeute aus weniger Spielen), dann Name. */
export const vglLeaderboard = (a: LbZeile, b: LbZeile) =>
  b.punkte - a.punkte || b.siege - a.siege || b.elims - a.elims || a.finals - b.finals || nameVgl(a.name, b.name);

export type RekordTeam = { event: string; punkte: number; siege: number; elims: number; spieler: Array<{ name: string }> };

/** Rekorde je Grand Finals: der Hauptwert, dann die uebrigen Werte in fester Reihenfolge (Punkte, Siege, Elims), dann Event und Namen. */
export const vglRekord = (haupt: 'punkte' | 'siege' | 'elims') => {
  const rest = (['punkte', 'siege', 'elims'] as const).filter((k) => k !== haupt);
  const namen = (t: RekordTeam) => t.spieler.map((s) => s.name).join('|');
  return (a: RekordTeam, b: RekordTeam) =>
    b[haupt] - a[haupt] || b[rest[0]] - a[rest[0]] || b[rest[1]] - a[rest[1]] || nameVgl(a.event, b.event) || nameVgl(namen(a), namen(b));
};
