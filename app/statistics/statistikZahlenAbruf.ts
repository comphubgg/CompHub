/*
 * /api/statistik-zahlen fuer die Statistik-Startseite - einmal geholt, von allen genutzt.
 *
 * Spielerfaecher, Aufmacher und die Gesamtzahlen unten fragten dieselbe Adresse je einzeln ab (drei Abrufe je Aufruf der Startseite).
 * Jetzt teilen sie sich einen Abruf: laeuft er noch, haengen sich die anderen an; eine gute Antwort gilt 30 Sekunden.
 * Ein Ausfall wird nicht gemerkt - der naechste Versuch (die Seiten fragen nach zehn Sekunden erneut) holt wirklich neu.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ZahlenAntwort = any; // wie vorher r.json(): die Aufrufer pruefen "ok" selbst

let laufend: Promise<ZahlenAntwort> | null = null;
let gut: { bis: number; antwort: ZahlenAntwort } | null = null;

export function holeStatistikZahlen(): Promise<ZahlenAntwort> {
  if (gut && gut.bis > Date.now()) return Promise.resolve(gut.antwort);
  if (laufend) return laufend;
  const p: Promise<ZahlenAntwort> = fetch('/api/statistik-zahlen', { signal: AbortSignal.timeout(30_000) })
    .then((r) => r.json() as Promise<ZahlenAntwort>)
    .then((j) => { if (j?.ok) gut = { bis: Date.now() + 30_000, antwort: j }; return j; })
    .finally(() => { if (laufend === p) laufend = null; });
  laufend = p;
  return p;
}
