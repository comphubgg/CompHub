/*
 * Fertige Antworten aufheben, statt sie jedes Mal neu auszurechnen.
 *
 * Die Startseite und die Statistikseite rechnen ueber neunhundert Spieltage:
 * jeden Spieler, jede Runde, jede Region. Auf einem eigenen Server faellt das
 * kaum auf - die Dateien liegen im Arbeitsspeicher des Betriebssystems, und
 * derselbe Vorgang hat die Zwischenergebnisse noch. Bei Vercel ist beides
 * weg: jede Anfrage faengt von vorn an, und die Dateien kommen ueber das
 * Netz. Gemessen: eine Minute dreiundfuenfzig fuer die Startseite.
 *
 * Der Betreiber hat das kurz und richtig zusammengefasst: "Es geht viel zu
 * lange, viel, viel, viel zu lange."
 *
 * Schneller lesen ist dafuer die falsche Antwort. Richtig ist, nicht bei
 * jedem Aufruf zu rechnen. Die Zahlen aendern sich, wenn neue Spieltage
 * dazukommen - also stuendlich, nicht sekuendlich. Einmal gerechnet und
 * abgelegt genuegt, und der naechste Besucher liest eine einzige Zeile.
 *
 * Zwei Stufen, damit niemand wartet:
 *
 *   1. Ist eine abgelegte Antwort da und jung genug, wird sie ausgeliefert -
 *      ohne zu rechnen.
 *   2. Ist sie zu alt, wird sie trotzdem sofort ausgeliefert und im
 *      Hintergrund neu gerechnet. Wer eine Stunde alte Zahlen sieht, hat es
 *      besser als jemand, der zwei Minuten auf taufrische wartet.
 *
 * Nur wenn gar nichts da ist, wird gewartet. Das trifft den ersten Aufruf
 * nach einer Neuaufspielung, und dafuer waermt die stuendliche GitHub-Aktion
 * die wichtigsten Antworten vor.
 */

import { after } from 'next/server';
import { liesJson, schreibJson, speicher } from '@/lib/ablage';

/*
 * Etwas nach der Antwort erledigen - und zwar wirklich.
 *
 * Bei Vercel wird eine Funktion nach der Antwort eingefroren; ein einfach
 * losgelassenes Promise kommt dann nie ans Ende, und die abgelaufene
 * Antwort bliebe fuer immer alt. "after" aus Next haelt die Funktion so
 * lange am Leben, bis die Arbeit getan ist. Ausserhalb einer Anfrage - etwa
 * in einem Skript - gibt es das nicht; dann laeuft es wie bisher los.
 */
function nachDerAntwort(arbeit: () => Promise<void>): void {
  try { after(arbeit); }
  catch { void arbeit(); }
}

/** Wo die fertigen Antworten liegen. */
const ORDNER = 'antworten';

/*
 * Die Ablage antwortet gerade nicht.
 *
 * Auf dem Server ohne Dateien laesst sich dann nicht unterscheiden, ob eine
 * Antwort fehlt oder nur nicht lesbar ist - und neu rechnen ergaebe dort
 * ohnehin eine leere Antwort, die als frisch abgelegt wuerde. Die Routen
 * antworten damit 503 und der Rand behaelt seinen letzten Stand.
 */
export class AblageNichtErreichbar extends Error {
  constructor() { super('Die Ablage ist gerade nicht erreichbar.'); this.name = 'AblageNichtErreichbar'; }
}

/*
 * Der Vorrat dieses Vorgangs: je Antwort die zuletzt gelesene Zeile und
 * wann sie aus der Ablage kam.
 *
 * Bis zum 22.9.2026 las die Seite jede Antwort bei jedem Aufruf neu aus der
 * Ablage - den Cup-Katalog (fast ein Megabyte) jede Minute je Instanz. Das
 * allein waren ueber ein Gigabyte am Tag, und Supabase sperrte das Projekt
 * wegen aufgebrauchten Datenverkehrs. Jetzt bleibt eine Antwort im
 * Speicher, solange sie nach ihrer eigenen Frist frisch ist; danach wird
 * nur nachgefragt, ob die Ablage etwas Neueres hat - ein Zeitstempel, keine
 * Datei - und erst dann geladen.
 */
const vorrat = new Map<string, { zeile: Ablage<unknown>; geholt: number }>();
/** Wie oft hoechstens bei der Ablage nach einem neueren Stand gefragt wird. */
const NACHFRAGE_MS = 60_000;
const nachgefragt = new Map<string, number>();

/*
 * Antworten, die nur im Speicher leben: das Profil eines Spielers.
 *
 * Es entsteht in Sekunden aus seiner Akte am Release; es in Supabase
 * abzulegen kostete bei jedem Profilbesuch einen Lesevorgang von hundert
 * Kilobyte und mehr - fuer nichts, was der Speicher nicht auch kann.
 */
function nurImSpeicher(name: string): boolean {
  return /^antworten\/szene_(spieler=|ansicht=profil)/.test(name);
}

/** Die abgelegte Zeile lesen - ohne Dateien wird ein Lesefehler zum Fehler. */
async function liesAblage<T>(name: string, frischMs: number): Promise<Ablage<T> | null> {
  const jetzt = Date.now();
  const da = vorrat.get(name);
  if (nurImSpeicher(name)) return (da?.zeile as Ablage<T> | undefined) ?? null;
  // Frisch nach eigener Frist: gar nicht erst zur Ablage.
  if (da && jetzt - da.zeile.zeit < frischMs) return da.zeile as Ablage<T>;
  /*
   * Zu alt - hat die Ablage inzwischen etwas Neueres? Nur der Zeitstempel,
   * und den hoechstens einmal je Minute. Ist dort nichts Juengeres, bleibt
   * der Stand aus dem Speicher (und wird oben im Hintergrund erneuert).
   */
  if (da && (nachgefragt.get(name) ?? 0) > jetzt - NACHFRAGE_MS) return da.zeile as Ablage<T>;
  if (da) {
    nachgefragt.set(name, jetzt);
    try {
      const angaben = await speicher.angaben(name);
      if (angaben && angaben.geaendert.getTime() <= da.geholt) return da.zeile as Ablage<T>;
    } catch { /* dann eben lesen */ }
  }
  try {
    const zeile = await liesJson<Ablage<T> | null>(name, null);
    if (zeile && typeof zeile.zeit === 'number') vorrat.set(name, { zeile, geholt: jetzt });
    return zeile;
  } catch (e) {
    if (da) return da.zeile as Ablage<T>;
    if (ohneDateien()) throw new AblageNichtErreichbar();
    throw e;
  }
}

/** Eine frisch gerechnete Antwort merken - und ablegen, wo das vorgesehen ist. */
async function merkeAntwort(name: string, zeile: Ablage<unknown>): Promise<void> {
  vorrat.set(name, { zeile, geholt: Date.now() });
  if (nurImSpeicher(name)) return;
  await schreibJson(name, zeile);
}

/*
 * Was Vercels Rand mit einer fertigen Antwort tun darf.
 *
 * Fuenf Minuten liefert der Rand sie aus, ohne den Server zu fragen; einen
 * Tag lang danach liefert er den alten Stand weiter und erneuert ihn im
 * Hintergrund. Vorher stand hier nur max-age, und das gilt allein fuer den
 * Browser des Besuchers: jeder Aufruf ging bis nach Supabase. Als die
 * Datenbank dort lahmte, blieb die Startseite bei Nullen und die Statistik
 * leer - obwohl sich die Zahlen nur stuendlich aendern. Mit dem Rand dazwischen
 * kommt eine fertige Antwort in Bruchteilen einer Sekunde, auch wenn die
 * Ablage gerade nicht antwortet.
 */
export const CDN_FRIST = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400';

/** Wie lange eine Antwort als frisch gilt. Die Daten kommen stuendlich. */
const FRISCH_MS = 90 * 60_000;

/**
 * Kurze Frist fuer alles, was sich waehrend eines Cups aendert.
 *
 * Neunzig Minuten passen zur stuendlichen Erneuerung, aber nicht zu den
 * Replays: die werden waehrend eines laufenden Cups alle zehn Minuten neu
 * ausgewertet und hochgeladen. Mit der langen Frist haette die Seite den
 * frischen Stand bis zu anderthalb Stunden lang nicht angesehen - das
 * Auswerten waere gelaufen und trotzdem unsichtbar geblieben.
 *
 * Langsamer wird davon nichts: eine abgelaufene Antwort wird weiterhin
 * sofort ausgeliefert und nur im Hintergrund erneuert.
 */
export const FRISCH_LIVE_MS = 5 * 60_000;

interface Ablage<T> {
  /** Wann gerechnet wurde. */
  zeit: number;
  wert: T;
}

/** Welche Schluessel gerade neu gerechnet werden - nicht zweimal zugleich. */
const laufend = new Set<string>();

/**
 * Aus einem Schluessel einen Dateinamen machen.
 *
 * Schluessel sind Abfragen wie "start|saison=S42". Schraegstriche und
 * Fragezeichen haben in einem Namen nichts zu suchen, und zu lang darf er
 * auch nicht werden.
 */
function nameVon(schluessel: string): string {
  /*
   * Nur Zeichen, die auf jedem System als Dateiname taugen.
   *
   * Zuerst stand der senkrechte Strich aus dem Schluessel noch drin. Unter
   * Linux ist das erlaubt, unter Windows nicht - dort scheiterte jedes
   * Schreiben still, weil die Ablage einen Fehler beim Speichern bewusst
   * verschluckt. Der Ordner antworten wurde angelegt und blieb leer, und
   * gerechnet wurde weiterhin bei jeder Anfrage. Gesucht war das eine
   * Zeichen; gefunden nur, weil danach nichts dalag.
   */
  const sauber = schluessel
    .replace(/[^a-zA-Z0-9_.=-]+/g, '_')
    .slice(0, 120);
  return `${ORDNER}/${sauber}.json`;
}

/**
 * Vorgerechnete Antworten wegwerfen, die mit diesem Anfang beginnen.
 *
 * Gebraucht, wenn sich die Grundlage geaendert hat und nicht auf die
 * naechste Frist gewartet werden kann: wer im Werkzeug ein @-Konto eintraegt,
 * will es danach sehen und nicht in neunzig Minuten. Der Betreiber hat genau
 * das erlebt - "ich hab so viele eingefuegt, und im Player Center steht es
 * nicht."
 *
 * Faellt das Loeschen aus, ist das kein Grund zu scheitern: dann steht die
 * alte Antwort eben noch eine Weile. Deshalb wird hier nichts geworfen.
 */
export async function wirfWeg(anfang: string): Promise<number> {
  const rein = anfang.replace(/[^a-zA-Z0-9_.=-]+/g, '_');
  let weg = 0;
  // Auch aus dem Speicher dieses Vorgangs - sonst lebte die alte Antwort
  // dort weiter, obwohl sie in der Ablage schon weg ist.
  for (const name of [...vorrat.keys()]) {
    if (name.startsWith(`${ORDNER}/${rein}`)) { vorrat.delete(name); weg += 1; }
  }
  try {
    for (const datei of await speicher.liste(ORDNER)) {
      if (!datei.startsWith(rein)) continue;
      try {
        await speicher.loesche(`${ORDNER}/${datei}`);
        weg += 1;
      } catch { /* schon weg, oder gerade in Benutzung */ }
    }
  } catch { /* noch kein Ordner - dann gibt es auch nichts zu werfen */ }
  return weg;
}

/** Laeuft dieser Server ohne die Dateien auf der Platte - also bei Vercel? */
export function ohneDateien(): boolean {
  return (process.env.COMPHUB_ABLAGE || '').toLowerCase() === 'supabase';
}

/**
 * Die fertige Antwort - oder sie ausrechnen und aufheben.
 *
 * @param schluessel Beschreibt die Abfrage vollstaendig. Zwei Abfragen mit
 *                   demselben Schluessel muessen dasselbe Ergebnis haben,
 *                   sonst bekommt jemand die Antwort auf eine fremde Frage.
 */
export async function fertigeAntwort<T>(
  schluessel: string,
  rechne: () => Promise<T>,
  frischMs: number = FRISCH_MS,
  /**
   * Ob eine zu alte Antwort hier im Hintergrund neu gerechnet werden darf.
   *
   * Nein fuer alles, was ueber das ganze Archiv geht: bei Vercel kommen
   * dafuer neunhundert Dateien ueber das Netz - das dauert Minuten, wird
   * nach sechzig Sekunden abgebrochen und kostet jedes Mal fuenfzig Megabyte
   * Datenverkehr fuer nichts. Solche Antworten rechnet der stuendliche Lauf
   * dort, wo die Dateien liegen; hier wird dann nur gelesen.
   */
  hintergrund = true,
): Promise<T> {
  const name = nameVon(schluessel);
  /*
   * Antwortet die Ablage nicht, wird eine billige Antwort trotzdem gerechnet
   * - nur nicht aufgehoben. Das Profil eines Spielers kommt aus seiner Akte
   * am Release und braucht Supabase gar nicht; am 17.9.2026 stand trotzdem
   * "Die Ablage ist gerade nicht erreichbar", weil schon das Nachsehen nach
   * einer fertigen Antwort scheiterte. Die Antworten ueber das ganze Archiv
   * (hintergrund = false) bleiben beim 503: die rechnet der Server ohne
   * Dateien nicht in vertretbarer Zeit.
   */
  let abgelegt: Ablage<T> | null;
  try {
    abgelegt = await liesAblage<T>(name, frischMs);
  } catch (e) {
    if (e instanceof AblageNichtErreichbar && hintergrund) return rechne();
    throw e;
  }
  const jetzt = Date.now();

  if (abgelegt && typeof abgelegt.zeit === 'number') {
    if (jetzt - abgelegt.zeit < frischMs) return abgelegt.wert;
    if (!hintergrund && ohneDateien()) return abgelegt.wert;

    // Zu alt: trotzdem ausliefern, im Hintergrund erneuern.
    if (!laufend.has(schluessel)) {
      laufend.add(schluessel);
      nachDerAntwort(async () => {
        try {
          const wert = await rechne();
          await merkeAntwort(name, { zeit: Date.now(), wert });
        } catch { /* dann bleibt der alte Stand stehen */ }
        finally { laufend.delete(schluessel); }
      });
    }
    return abgelegt.wert;
  }

  // Gar nichts da - hier muss gewartet werden.
  const wert = await rechne();
  /*
   * Was der Server ohne Dateien rechnet, ist bei Archiv-Antworten leer
   * oder halb - das darf nicht als fertige Antwort liegenbleiben, sonst
   * ueberdeckt es den naechsten Stand des Laufrechners bis zur Frist.
   */
  if (!hintergrund && ohneDateien()) return wert;
  try {
    await merkeAntwort(name, { zeit: Date.now(), wert });
  } catch { /* ohne Ablage wird eben jedes Mal gerechnet */ }
  return wert;
}

/**
 * Eine eben gerechnete Antwort ablegen - fuer den stuendlichen Lauf, der sie
 * frisch haben will und nicht auf eine Rechnung im Hintergrund warten kann.
 */
export async function legeAntwortAb<T>(schluessel: string, wert: T): Promise<void> {
  await merkeAntwort(nameVon(schluessel), { zeit: Date.now(), wert });
}

/** Die abgelegte Antwort, wie sie ist - oder null, wenn keine liegt. */
export async function abgelegteAntwort<T>(schluessel: string): Promise<T | null> {
  const abgelegt = await liesAblage<T>(nameVon(schluessel), FRISCH_MS);
  return abgelegt && typeof abgelegt.zeit === 'number' ? abgelegt.wert : null;
}

/**
 * Wie alt die abgelegte Antwort ist, in Minuten - oder null.
 *
 * Fuer die Oberflaeche: eine Zahl, die aus einer Stunde alten Daten stammt,
 * soll das sagen duerfen, statt sich als taufrisch auszugeben.
 */
export async function alterMinuten(schluessel: string): Promise<number | null> {
  const abgelegt = await liesJson<Ablage<unknown> | null>(nameVon(schluessel), null);
  if (!abgelegt || typeof abgelegt.zeit !== 'number') return null;
  return Math.round((Date.now() - abgelegt.zeit) / 60_000);
}
