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

import { liesJson, schreibJson } from '@/lib/ablage';

/** Wo die fertigen Antworten liegen. */
const ORDNER = 'antworten';

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
): Promise<T> {
  const name = nameVon(schluessel);
  const abgelegt = await liesJson<Ablage<T> | null>(name, null);
  const jetzt = Date.now();

  if (abgelegt && typeof abgelegt.zeit === 'number') {
    if (jetzt - abgelegt.zeit < frischMs) return abgelegt.wert;

    // Zu alt: trotzdem ausliefern, im Hintergrund erneuern.
    if (!laufend.has(schluessel)) {
      laufend.add(schluessel);
      void (async () => {
        try {
          const wert = await rechne();
          await schreibJson(name, { zeit: Date.now(), wert });
        } catch { /* dann bleibt der alte Stand stehen */ }
        finally { laufend.delete(schluessel); }
      })();
    }
    return abgelegt.wert;
  }

  // Gar nichts da - hier muss gewartet werden.
  const wert = await rechne();
  try {
    await schreibJson(name, { zeit: Date.now(), wert });
  } catch { /* ohne Ablage wird eben jedes Mal gerechnet */ }
  return wert;
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
