import { NextResponse } from 'next/server';
import {
  gecacht, holeTop, cupsGruppiert, REGIONEN, EpicLoginNoetig,
} from '@/lib/epicCups';

// Wie viele Punkte es voraussichtlich braucht, um weiterzukommen.
//
// Epic sagt, WIE VIELE weiterkommen - die Zahl steht als Rangschwelle in der
// Auszahlungstabelle ("Top 300"). Was Epic nicht sagt, ist WIE VIEL PUNKTE
// man dafuer braucht. Das laesst sich aber ausrechnen, ohne zu raten: in den
// frueheren Ausgaben desselben Cups stand an genau diesem Rang eine
// Punktzahl. Der Schnitt der letzten Ausgaben ist die beste Auskunft, die
// sich belegen laesst.
//
//   ?event=…&window=…&region=EU&schwelle=300
//
// Zurueck kommen die einzelnen Ausgaben mit ihrer Punktzahl UND der Schnitt.
// Beides zusammen, damit die Zahl nachpruefbar bleibt und nicht wie ein
// Orakel dasteht: wer die drei Werte sieht, erkennt selbst, ob sie eng
// beieinanderliegen oder weit auseinander.
//
// Erfunden wird nichts. Findet sich keine frueherer Ausgabe mit Ergebnissen,
// kommt eine leere Antwort mit Begruendung.

export const revalidate = 0;

/** Wie viele fruehere Ausgaben hoechstens herangezogen werden. */
const AUSGABEN = 3;

/** Die Kennung ohne Season, Region und Durchgangsnummer. */
function reihe(windowId: string): string {
  return (windowId ?? '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/(Event|Week|Qual)\d+/gi, '$1#')
    .toLowerCase();
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const window_ = p.get('window');
  const region = (p.get('region') ?? 'EU').toUpperCase();
  let schwelle = Number(p.get('schwelle'));

  if (!window_) {
    return NextResponse.json({ error: 'window ist noetig' }, { status: 400 });
  }

  let cups;
  try {
    cups = await gecacht(`catalog|${region}`, 5 * 60_000,
      () => cupsGruppiert([region as typeof REGIONEN[number]]));
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json({ error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 502 });
  }

  // Alle Spieltage derselben Region, flach.
  const alle = cups.flatMap((c) => (c.regionen[region] ?? []));
  const dieser = alle.find((f) => f.windowId === window_);
  if (!dieser) {
    return NextResponse.json({
      vorhanden: false, schwelle,
      hinweis: 'Dieser Spieltag steht nicht in Epics Liste.',
      ausgaben: [], schnitt: null,
    });
  }

  /*
   * Ohne Angabe: wie viele weiterkommen, sagt das Finalfeld.
   *
   * Epic fuehrt die Rangschwelle nur dort, wo sie in der Auszahlungstabelle
   * steht - bei vielen Cups steht sie nirgends, und dann gab es hier gar
   * keine Auskunft. Dabei liegt die Zahl offen da: wer in der naechsten
   * Runde desselben Events antritt, ist genau der Kreis, der es geschafft
   * hat. Fuenfzig Teams im Finale heissen "Top 50" in der Vorrunde.
   *
   * Das ist keine Schaetzung, sondern eine Zaehlung. Findet sich keine
   * spaetere Runde - etwa weil dieser Spieltag selbst das Finale ist -,
   * bleibt es bei keiner Auskunft.
   */
  let hergeleitet = false;
  if (!Number.isFinite(schwelle) || schwelle < 1) {
    const spaeter = alle
      .filter((f) => f.eventId === dieser.eventId && f.begin > dieser.begin)
      .sort((a, b) => a.begin - b.begin)[0];
    if (spaeter) {
      try {
        const feld = await gecacht(`feld|${spaeter.eventId}|${spaeter.windowId}`,
          30 * 60_000, () => holeTop(spaeter.eventId, spaeter.windowId, 1000));
        if (feld.entries.length) { schwelle = feld.entries.length; hergeleitet = true; }
      } catch { /* dann bleibt es ohne Auskunft */ }
    }
  }

  if (!Number.isFinite(schwelle) || schwelle < 1) {
    return NextResponse.json({
      vorhanden: false, schwelle: null,
      hinweis: 'Zu diesem Spieltag ist nicht bekannt, wie viele weiterkommen.',
      ausgaben: [], schnitt: null,
    });
  }

  /*
   * Ist dieser Spieltag schon gelaufen, braucht es keine Schaetzung.
   *
   * Dann steht die Antwort in seiner eigenen Bestenliste: die Punktzahl auf
   * dem letzten Rang, der noch weiterkommt, ist keine Prognose mehr, sondern
   * das Ergebnis. Der Betreiber hatte zu Recht angemerkt, dass ein
   * Durchschnitt frueherer Ausgaben fuer einen abgeschlossenen Cup die
   * schlechtere Auskunft ist - "ist ja nicht immer das Gleiche".
   */
  let tatsaechlich: number | null = null;
  if (dieser.status === 'vorbei') {
    try {
      const board = await gecacht(`qualIst|${dieser.eventId}|${dieser.windowId}|${schwelle}`,
        30 * 60_000, () => holeTop(dieser.eventId, dieser.windowId, schwelle));
      const treffer = board.entries.find((e) => e.rank === schwelle);
      if (treffer && typeof treffer.points === 'number') tatsaechlich = treffer.points;
    } catch { /* dann bleibt es beim Schnitt aus frueheren Ausgaben */ }
  }

  /*
   * Frueher, gleiche Reihe, schon gespielt.
   *
   * "Gleiche Reihe" heisst: derselbe Cup und derselbe Durchgangstyp. Runde 1
   * ist mit Runde 1 vergleichbar, nicht mit einem Finale - dort gelten
   * andere Punktzahlen, weil weniger Teams antreten.
   */
  const meine = reihe(window_);
  const frueher = alle
    .filter((f) => f.windowId !== window_
      && reihe(f.windowId) === meine
      && f.begin < dieser.begin
      && f.status === 'vorbei')
    .sort((a, b) => b.begin - a.begin)
    .slice(0, AUSGABEN);

  if (!frueher.length) {
    // Ohne Vorgeschichte bleibt trotzdem, was dieser Spieltag gekostet hat.
    return NextResponse.json({
      vorhanden: tatsaechlich !== null, schwelle, tatsaechlich,
      hinweis: tatsaechlich === null
        ? 'Von diesem Cup ist noch keine frühere Ausgabe gelaufen.' : null,
      ausgaben: [], schnitt: null,
    });
  }

  const ausgaben: Array<{ windowId: string; datum: number; punkte: number | null }> = [];
  for (const f of frueher) {
    try {
      const board = await gecacht(`qual|${f.eventId}|${f.windowId}|${schwelle}`,
        30 * 60_000, () => holeTop(f.eventId, f.windowId, schwelle));
      // Genau der Rang, der noch weiterkommt.
      const treffer = board.entries.find((e) => e.rank === schwelle)
        // Reicht die Liste nicht ganz hin, gilt der letzte vorhandene Rang -
        // das ist dann eine Untergrenze, keine Erfindung.
        ?? board.entries[board.entries.length - 1];
      ausgaben.push({
        windowId: f.windowId, datum: f.begin,
        punkte: treffer && treffer.rank === schwelle ? treffer.points : null,
      });
    } catch {
      ausgaben.push({ windowId: f.windowId, datum: f.begin, punkte: null });
    }
  }

  const werte = ausgaben.map((a) => a.punkte)
    .filter((x): x is number => typeof x === 'number' && x > 0);
  const schnitt = werte.length
    ? Math.round(werte.reduce((s, x) => s + x, 0) / werte.length) : null;

  return NextResponse.json({
    vorhanden: schnitt !== null || tatsaechlich !== null,
    /* Was dieser Spieltag tatsaechlich gekostet hat - nur wenn er vorbei
       ist. Steht das hier, ist der Schnitt nur noch Beiwerk. */
    tatsaechlich,
    schwelle, region, ausgaben, schnitt,
    /* Wahr, wenn die Schwelle aus dem Finalfeld gezaehlt wurde statt aus
       Epics Auszahlungstabelle zu stammen - das gehoert dazugesagt. */
    hergeleitet,
    grundlage: werte.length,
    hinweis: schnitt === null
      ? 'Zu den früheren Ausgaben liegen keine Ergebnisse vor.' : null,
  });
}
