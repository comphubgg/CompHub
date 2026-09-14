import { liesJson, schreibJson, speicher } from '@/lib/ablage';

/*
 * Wer ist gerade da, wer war wann zuletzt hier - und wie lange.
 *
 * Der Betreiber wollte "eine Art Livestats von VIP-Usern - wer gerade auf
 * dem Tool ist oder sich eingeloggt hat, und wann. Zeit und Datum." Und
 * spaeter: "macht wirklich eine Art Verlauf. Wenn Leute zehn Minuten live
 * waren, dann steht da offline; und eine Liste mit jedem User, wo 'last
 * seen' steht."
 *
 * ------------------------------------------------------------ Was echt ist
 *
 * Aufgezeichnet wird ab jetzt; rueckwirkend laesst sich nichts herstellen.
 *
 *   Anmeldungen  - jedes Mal, wenn sich jemand anmeldet, mit Zeitpunkt.
 *   Zuletzt hier - bei jedem Lebenszeichen einer offenen Seite.
 *   Sitzungen    - von Lebenszeichen zu Lebenszeichen; reisst die Kette
 *                  laenger als die Schwelle ab, beginnt die naechste.
 *
 * "Gerade da" ist daraus abgeleitet: jeder offene Reiter meldet sich jede
 * Minute, und wer sich zwei Minuten lang nicht gemeldet hat, gilt als weg.
 * Ein Abmelden wirkt sofort.
 *
 * ------------------------------------------------------ Je Konto eine Zeile
 *
 * Vorher lag alles in einer Datei, die jede Server-Instanz im Speicher hielt
 * und alle drei Sekunden ganz zurueckschrieb. Bei Vercel laufen mehrere
 * Instanzen nebeneinander, jede mit ihrem eigenen Stand - und die letzte,
 * die schrieb, loeschte, was die anderen gesehen hatten. Genau so kam es,
 * dass jemand gerade da war und die Liste ihn nicht zeigte. Jetzt hat jedes
 * Konto seine eigene Zeile, und ein Lebenszeichen schreibt nur diese.
 */

const ORDNER = 'anwesenheit';
/** Die alte Sammeldatei - wird beim ersten Lesen einmal uebernommen. */
const ALTE_DATEI = 'anwesenheit.json';

/**
 * Wie lange jemand nach dem letzten Lebenszeichen als "da" gilt.
 *
 * Zwei Minuten, weil jeder offene Reiter sich jede Minute meldet. Ein
 * verpasster Schlag wirft niemanden heraus, ein geschlossener Browser ist
 * nach zwei Minuten weg.
 */
export const NOCH_DA_MS = 2 * 60_000;

/**
 * Wie oft ein Lebenszeichen hoechstens geschrieben wird.
 *
 * Die Seite meldet sich jede Minute; oefter als alle dreissig Sekunden
 * muss "zuletzt hier" nicht in die Ablage. Alles dazwischen bleibt im
 * Speicher dieser Instanz.
 */
const SCHREIB_ABSTAND_MS = 30_000;

/** Wie viele Sitzungen je Konto aufgehoben werden. */
const SITZUNGEN_HOECHSTENS = 60;

export interface Sitzung {
  /** Erstes und letztes Lebenszeichen der Sitzung. */
  von: number;
  bis: number;
}

export interface Anwesend {
  /** Der angezeigte Name. */
  name: string;
  /** Konto oder alter Zugangsschluessel. */
  art: 'konto' | 'vip';
  /** Letztes Lebenszeichen. */
  zuletzt: number;
  /** Letzte Anmeldung. */
  letzteAnmeldung?: number;
  /** Allererste Anmeldung, die hier aufgezeichnet wurde. */
  ersteAnmeldung?: number;
  /** Wie oft sich dieser Zugang seither angemeldet hat. */
  anmeldungen?: number;
  /** Wann zuletzt abgemeldet - danach gilt er nicht mehr als da. */
  abgemeldet?: number;
  /** Die letzten Sitzungen, juengste zuletzt. */
  sitzungen?: Sitzung[];
}

/** Der Dateiname einer Kennung - ohne Zeichen, die im Pfad nichts verloren haben. */
function dateiVon(kennung: string): string {
  // Kein Doppelpunkt: auf Windows ist er im Dateinamen verboten, und die
  // Kennungen tragen ihn ("vip:name").
  return `${ORDNER}/${kennung.replace(/[^a-zA-Z0-9_.@-]+/g, '_')}.json`;
}

/** Was diese Instanz zuletzt geschrieben hat - gegen zu haeufiges Schreiben. */
const zuletztGeschrieben = new Map<string, number>();

let uebernommen = false;

/**
 * Die alte Sammeldatei einmal in Zeilen je Konto ueberfuehren.
 *
 * Was darin steht - erste Anmeldung, Zaehler - soll nicht verlorengehen.
 * Danach bleibt die Datei liegen, wird aber nicht mehr gelesen.
 */
async function alteUebernehmen(): Promise<void> {
  if (uebernommen) return;
  uebernommen = true;
  try {
    const alt = await liesJson<Record<string, Anwesend> | null>(ALTE_DATEI, null);
    if (!alt || typeof alt !== 'object') return;
    const vorhanden = new Set(await speicher.liste(ORDNER).catch(() => [] as string[]));
    for (const [kennung, e] of Object.entries(alt)) {
      const datei = dateiVon(kennung);
      if (vorhanden.has(datei.slice(ORDNER.length + 1))) continue;
      try { await schreibJson(datei, e); } catch { /* dann eben nicht */ }
    }
  } catch { /* keine alte Datei - nichts zu uebernehmen */ }
}

async function liesEintrag(kennung: string): Promise<Anwesend | null> {
  await alteUebernehmen();
  return liesJson<Anwesend | null>(dateiVon(kennung), null);
}

async function schreibEintrag(kennung: string, e: Anwesend): Promise<void> {
  try {
    await schreibJson(dateiVon(kennung), e);
    zuletztGeschrieben.set(kennung, Date.now());
  } catch { /* eine verlorene Zeile ist kein Grund, eine Seite scheitern zu lassen */ }
}

/**
 * Die Sitzungen fortschreiben.
 *
 * Liegt das letzte Lebenszeichen innerhalb der Schwelle, gehoert dieses zur
 * laufenden Sitzung; sonst beginnt eine neue. So wird aus "zehn Minuten
 * offen, dann zu" genau eine Zeile von zehn Minuten.
 */
function mitSitzung(e: Anwesend, jetzt: number, neueSitzung: boolean): Sitzung[] {
  const liste = [...(e.sitzungen ?? [])];
  const letzte = liste[liste.length - 1];
  const abgerissen = !letzte || jetzt - letzte.bis >= NOCH_DA_MS
    || (e.abgemeldet !== undefined && e.abgemeldet >= letzte.bis);
  if (neueSitzung || abgerissen) liste.push({ von: jetzt, bis: jetzt });
  else letzte.bis = jetzt;
  return liste.slice(-SITZUNGEN_HOECHSTENS);
}

/** Jemand hat eine Seite geoeffnet oder sich gemeldet. */
export async function merkeAufruf(
  kennung: string, name: string, art: 'konto' | 'vip',
): Promise<void> {
  if (!kennung) return;
  const jetzt = Date.now();
  const bisher = await liesEintrag(kennung);
  // Innerhalb einer laufenden Sitzung nur alle dreissig Sekunden schreiben.
  const zuletzt = zuletztGeschrieben.get(kennung) ?? 0;
  const laeuft = bisher && jetzt - (bisher.zuletzt ?? 0) < NOCH_DA_MS
    && !(bisher.abgemeldet && bisher.abgemeldet >= (bisher.zuletzt ?? 0));
  if (laeuft && jetzt - zuletzt < SCHREIB_ABSTAND_MS) return;

  const e: Anwesend = {
    ...(bisher ?? { name: name || kennung, art, zuletzt: jetzt }),
    name: name || bisher?.name || kennung,
    art,
    zuletzt: jetzt,
  };
  e.sitzungen = mitSitzung(bisher ?? e, jetzt, false);
  await schreibEintrag(kennung, e);
}

/** Jemand hat sich angemeldet. */
export async function merkeAnmeldung(
  kennung: string, name: string, art: 'konto' | 'vip',
): Promise<void> {
  if (!kennung) return;
  const jetzt = Date.now();
  const bisher = await liesEintrag(kennung);
  const e: Anwesend = {
    ...(bisher ?? { name: name || kennung, art, zuletzt: jetzt }),
    name: name || bisher?.name || kennung,
    art,
    zuletzt: jetzt,
    letzteAnmeldung: jetzt,
    ersteAnmeldung: bisher?.ersteAnmeldung ?? jetzt,
    anmeldungen: (bisher?.anmeldungen ?? 0) + 1,
  };
  delete e.abgemeldet;
  e.sitzungen = mitSitzung(bisher ?? e, jetzt, true);
  await schreibEintrag(kennung, e);
}

/**
 * Jemand hat sich abgemeldet.
 *
 * Der Eintrag bleibt: "zuletzt hier" und die Zahl der Anmeldungen sollen
 * stehen. Nur der gruene Punkt geht sofort aus, und die laufende Sitzung
 * endet jetzt.
 */
export async function merkeAbmeldung(kennung: string): Promise<void> {
  if (!kennung) return;
  const bisher = await liesEintrag(kennung);
  if (!bisher) return;
  const jetzt = Date.now();
  const sitzungen = [...(bisher.sitzungen ?? [])];
  const letzte = sitzungen[sitzungen.length - 1];
  if (letzte && jetzt - letzte.bis < NOCH_DA_MS) letzte.bis = jetzt;
  await schreibEintrag(kennung, { ...bisher, abgemeldet: jetzt, sitzungen });
}

/** Alle Bekannten, zuletzt Gesehene zuerst - mit ihrem Verlauf. */
export async function alleAnwesend(): Promise<Array<Anwesend & {
  kennung: string; online: boolean;
}>> {
  await alteUebernehmen();
  let dateien: string[] = [];
  try { dateien = await speicher.liste(ORDNER); } catch { dateien = []; }
  const jetzt = Date.now();
  const leute = await Promise.all(dateien
    .filter((d) => d.endsWith('.json'))
    .map(async (d) => {
      const e = await liesJson<Anwesend | null>(`${ORDNER}/${d}`, null);
      if (!e) return null;
      return {
        ...e,
        kennung: d.replace(/\.json$/, ''),
        /*
         * Da ist, wer sich zuletzt innerhalb der Schwelle gemeldet hat - und
         * sich seither nicht abgemeldet hat. Ohne die zweite Bedingung
         * leuchtete der Punkt nach einem Abmelden noch nach.
         */
        online: jetzt - (e.zuletzt ?? 0) < NOCH_DA_MS
          && !(e.abgemeldet && e.abgemeldet >= (e.zuletzt ?? 0)),
      };
    }));
  return leute
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((x, y) => (y.zuletzt ?? 0) - (x.zuletzt ?? 0));
}
