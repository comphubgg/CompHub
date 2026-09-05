import { promises as fs } from 'fs';
import path from 'path';
import { DATEN_ORT } from './datenOrt';

/*
 * Wer ist gerade da, und wer war wann zuletzt hier.
 *
 * Der Betreiber wollte "eine Art Livestats von VIP-Usern - wer gerade auf
 * dem Tool ist oder sich eingeloggt hat, und wann. Zeit und Datum. Bei den
 * Nutzungszahlen sehe ich ja nur das Datum, nicht wer und wann."
 *
 * Genau das steht hier. Die Nutzungszahlen zaehlen Browser und nennen keine
 * Namen - das war Absicht und bleibt so. Hier geht es um die Angemeldeten,
 * und die sind namentlich bekannt, weil sie sich mit Namen angemeldet haben.
 *
 * ------------------------------------------------------------ Was echt ist
 *
 * Aufgezeichnet wird ab jetzt; vorher wurde nichts festgehalten, und
 * rueckwirkend laesst sich das nicht herstellen. Zwei Dinge:
 *
 *   Anmeldungen  - jedes Mal, wenn sich jemand anmeldet, mit Zeitpunkt.
 *   Zuletzt hier - bei jedem Seitenaufruf aufgefrischt.
 *
 * "Gerade online" ist daraus abgeleitet und heisst genau: in den letzten
 * fuenf Minuten war eine Seite offen. Mehr kann niemand wissen - ein
 * geschlossener Reiter meldet sich nicht ab. Die Oberflaeche schreibt das
 * deshalb auch so hin.
 */

const DATEI = path.join(DATEN_ORT, 'anwesenheit.json');

/** Wie lange jemand nach dem letzten Aufruf als "da" gilt. */
export const NOCH_DA_MS = 5 * 60_000;

export interface Anwesend {
  /** Der angezeigte Name. */
  name: string;
  /** Konto oder alter Zugangsschluessel. */
  art: 'konto' | 'vip';
  /** Letzter Seitenaufruf. */
  zuletzt: number;
  /** Letzte Anmeldung. */
  letzteAnmeldung?: number;
  /** Allererste Anmeldung, die hier aufgezeichnet wurde. */
  ersteAnmeldung?: number;
  /** Wie oft sich dieser Zugang seither angemeldet hat. */
  anmeldungen?: number;
}

type Ablage = Record<string, Anwesend>;

let stand: Ablage | null = null;
let geplant: NodeJS.Timeout | null = null;

async function lies(): Promise<Ablage> {
  if (stand) return stand;
  try {
    const roh = JSON.parse(await fs.readFile(DATEI, 'utf8')) as Ablage;
    stand = roh && typeof roh === 'object' ? roh : {};
  } catch {
    stand = {};
  }
  return stand;
}

/*
 * Gebuendelt schreiben.
 *
 * Bei jedem Seitenaufruf eine Datei anzufassen waere derselbe Preis wie beim
 * Besuchszaehler - und "zuletzt hier" auf drei Sekunden genau braucht
 * niemand.
 */
function planeSchreiben(): void {
  if (geplant) return;
  geplant = setTimeout(() => {
    geplant = null;
    void (async () => {
      if (!stand) return;
      try {
        await fs.mkdir(path.dirname(DATEI), { recursive: true });
        await fs.writeFile(DATEI, JSON.stringify(stand, null, 1), 'utf8');
      } catch { /* eine verlorene Zeile ist kein Grund, eine Seite scheitern zu lassen */ }
    })();
  }, 3000);
  geplant.unref?.();
}

/** Jemand hat eine Seite geoeffnet. */
export async function merkeAufruf(
  kennung: string, name: string, art: 'konto' | 'vip',
): Promise<void> {
  if (!kennung) return;
  const a = await lies();
  const bisher = a[kennung];
  a[kennung] = { ...bisher, name: name || bisher?.name || kennung, art,
    zuletzt: Date.now() };
  planeSchreiben();
}

/** Jemand hat sich angemeldet. */
export async function merkeAnmeldung(
  kennung: string, name: string, art: 'konto' | 'vip',
): Promise<void> {
  if (!kennung) return;
  const a = await lies();
  const bisher = a[kennung];
  const jetzt = Date.now();
  a[kennung] = {
    ...bisher,
    name: name || bisher?.name || kennung,
    art,
    zuletzt: jetzt,
    letzteAnmeldung: jetzt,
    ersteAnmeldung: bisher?.ersteAnmeldung ?? jetzt,
    anmeldungen: (bisher?.anmeldungen ?? 0) + 1,
  };
  planeSchreiben();
}

/** Alle Bekannten, zuletzt Gesehene zuerst. */
export async function alleAnwesend(): Promise<Array<Anwesend & {
  kennung: string; online: boolean;
}>> {
  const a = await lies();
  const jetzt = Date.now();
  return Object.entries(a)
    .map(([kennung, e]) => ({
      ...e, kennung, online: jetzt - (e.zuletzt ?? 0) < NOCH_DA_MS,
    }))
    .sort((x, y) => (y.zuletzt ?? 0) - (x.zuletzt ?? 0));
}
