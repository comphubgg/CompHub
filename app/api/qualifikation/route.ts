import { NextResponse } from 'next/server';
import {
  gecacht, holeTop, cupsGruppiert, REGIONEN, EpicLoginNoetig,
} from '@/lib/epicCups';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

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

/** Die Teamgroesse eines Spieltags aus Playlist und Kennung - fuer den Vergleich mit aehnlichen Cups. */
function groesse(f: { playlist?: string | null; windowId: string; eventId: string }): string {
  const q = `${f.playlist ?? ''} ${f.windowId} ${f.eventId}`;
  if (/solo/i.test(q)) return 'solo';
  if (/trio/i.test(q)) return 'trio';
  if (/squad/i.test(q)) return 'squad';
  if (/duo/i.test(q)) return 'duo';
  return '?';
}

/** Die Kennung ohne Season, Region und Durchgangsnummer - auch die Vorsaison zaehlt als dieselbe Reihe (S42 fuer S43). */
function reihe(windowId: string): string {
  return (windowId ?? '')
    .replace(/^S\d+_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/(Event|Week|Qual)\d+/gi, '$1#')
    .toLowerCase();
}

async function holeRoh(request: Request) {
  const p = new URL(request.url).searchParams;
  const window_ = p.get('window');
  const region = (p.get('region') ?? 'EU').toUpperCase();
  let schwelle = Number(p.get('schwelle'));
  /* Der letzte Platz mit einer Belohnung (Skin, Emote ...) aus der Auszahlungstabelle - gilt, wenn es keinen Qualifikationsrang gibt (Skin-Cups). */
  const belohnung = Number(p.get('belohnung'));
  let fuerBelohnung = false;

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

  if ((!Number.isFinite(schwelle) || schwelle < 1) && Number.isFinite(belohnung) && belohnung >= 1) {
    schwelle = Math.round(belohnung); fuerBelohnung = true;
  }

  /*
   * Noch immer keine Schwelle (die erste Runde einer neuen Saison, ein Test-Cup): die der letzten Ausgabe derselben Reihe - Epics Qualifikationsrang dort
   * oder das Feld der Runde danach. Der Betreiber (29.10.2026): "fuer jeden Cup muss eine Prediction da sein, und das schon von Anfang an".
   */
  let ausVorlauf = false;
  if (!Number.isFinite(schwelle) || schwelle < 1) {
    const vorlauf = alle
      .filter((f) => f.windowId !== dieser.windowId && reihe(f.windowId) === reihe(dieser.windowId) && f.status === 'vorbei')
      .sort((a, b) => b.begin - a.begin)[0];
    if (vorlauf?.qualifiziert) { schwelle = vorlauf.qualifiziert; ausVorlauf = true; }
    else if (vorlauf) {
      const danach = alle.filter((f) => f.eventId === vorlauf.eventId && f.begin > vorlauf.begin).sort((a, b) => a.begin - b.begin)[0];
      if (danach) {
        try {
          const feld = await gecacht(`feld|${danach.eventId}|${danach.windowId}`, 30 * 60_000, () => holeTop(danach.eventId, danach.windowId, 1000));
          if (feld.entries.length) { schwelle = feld.entries.length; ausVorlauf = true; }
        } catch { /* dann der Standard */ }
      }
    }
  }
  // Sonst Top 100 - so hat jeder Cup eine Prognose; die Antwort sagt dazu, dass es der Standard ist.
  let standard = false;
  if (!Number.isFinite(schwelle) || schwelle < 1) { schwelle = 100; standard = true; }

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
  /*
   * Und waehrend er laeuft, steht dort der Stand von jetzt.
   *
   * Der Betreiber hatte die Bestenliste neben der Zahl: "Platz 300 steht
   * aktuell auf 435, und bei Qualifying stehen 408. Das musst du live
   * updaten." Die 408 waren der Schnitt frueherer Ausgaben - fuer einen
   * laufenden Spieltag die schlechtere Auskunft, wenn die eigene Liste
   * schon sagt, was Platz 300 gerade kostet. Waehrend des Spieltags wird
   * die Liste deshalb alle fuenfzehn Sekunden neu geholt, im selben Takt
   * wie die laufende Runde.
   *
   * Ob er laeuft, wird hier an Beginn und Ende gemessen und nicht am
   * gespeicherten Zustand: der Katalog ist fuenf Minuten alt, und in den
   * ersten Minuten eines Cups stuende dort noch "kommt".
   */
  const jetzt = Date.now();
  const laeuft = dieser.begin <= jetzt
    && (typeof dieser.end === 'number' ? jetzt <= dieser.end : dieser.status === 'live');
  const vorbei = !laeuft && (dieser.status === 'vorbei'
    || (typeof dieser.end === 'number' && jetzt > dieser.end));
  let tatsaechlich: number | null = null;
  if (vorbei || laeuft) {
    try {
      const board = await gecacht(
        `qualIst|${dieser.eventId}|${dieser.windowId}|${schwelle}|${laeuft ? 'live' : 'fertig'}`,
        laeuft ? 15_000 : 30 * 60_000,
        () => holeTop(dieser.eventId, dieser.windowId, schwelle));
      const treffer = board.entries.find((e) => e.rank === schwelle);
      // Null Punkte auf dem Platz heisst: noch nichts gespielt, oder Epic
      // fuehrt fuer diesen Cup keine Punkte. Beides ist keine Auskunft.
      if (treffer && typeof treffer.points === 'number' && treffer.points > 0) {
        tatsaechlich = treffer.points;
      }
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
  let frueher = alle
    .filter((f) => f.windowId !== window_
      && reihe(f.windowId) === meine
      && f.begin < dieser.begin
      && f.status === 'vorbei')
    .sort((a, b) => b.begin - a.begin)
    .slice(0, AUSGABEN);
  /*
   * Kein frueherer Lauf desselben Cups (einmalige Skin-Cups): die letzten Ausgaben aehnlicher Cups - gleiche Art (Skin-Cup, Cash Cup, ...), gleiche
   * Teamgroesse, gleiche Region, nicht aelter als 60 Tage. Die Titel stehen in der Antwort, damit nachpruefbar bleibt, woher die Zahl kommt.
   */
  const artVon = new Map<string, string>();
  const titelVon = new Map<string, string>();
  for (const c of cups) for (const f of (c.regionen[region] ?? [])) { artVon.set(f.windowId, c.art); titelVon.set(f.windowId, c.titel); }
  let aehnlich = false;
  if (!frueher.length) {
    const art = artVon.get(dieser.windowId);
    const g = groesse(dieser);
    frueher = alle
      .filter((f) => f.windowId !== window_ && f.status === 'vorbei' && f.begin < dieser.begin
        && f.begin > dieser.begin - 60 * 864e5
        && artVon.get(f.windowId) === art && groesse(f) === g && !f.istFinale)
      .sort((a, b) => b.begin - a.begin)
      .slice(0, AUSGABEN);
    aehnlich = frueher.length > 0;
  }

  if (!frueher.length) {
    // Ohne Vorgeschichte bleibt trotzdem, was dieser Spieltag gekostet hat.
    return NextResponse.json({
      vorhanden: tatsaechlich !== null, schwelle, tatsaechlich, laeuft,
      hinweis: tatsaechlich === null
        ? 'Von diesem Cup ist noch keine frühere Ausgabe gelaufen.' : null,
      ausgaben: [], schnitt: null,
    });
  }

  const ausgaben: Array<{ windowId: string; datum: number; punkte: number | null; titel?: string | null }> = [];
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
        ...(aehnlich ? { titel: titelVon.get(f.windowId) ?? null } : {}),
      });
    } catch {
      ausgaben.push({ windowId: f.windowId, datum: f.begin, punkte: null, ...(aehnlich ? { titel: titelVon.get(f.windowId) ?? null } : {}) });
    }
  }

  const werte = ausgaben.map((a) => a.punkte)
    .filter((x): x is number => typeof x === 'number' && x > 0);
  const schnitt = werte.length
    ? Math.round(werte.reduce((s, x) => s + x, 0) / werte.length) : null;

  return NextResponse.json({
    vorhanden: schnitt !== null || tatsaechlich !== null,
    /* Was dieser Spieltag tatsaechlich kostet - waehrend er laeuft der
       Stand von jetzt, danach das Ergebnis. Steht das hier, ist der Schnitt
       nur noch Beiwerk. "laeuft" sagt, welches von beiden es ist. */
    tatsaechlich, laeuft,
    schwelle, region, ausgaben, schnitt,
    /* Wahr, wenn die Schwelle aus dem Finalfeld gezaehlt wurde statt aus
       Epics Auszahlungstabelle zu stammen - das gehoert dazugesagt. */
    hergeleitet,
    /* Die Schwelle ist der letzte Platz mit Belohnung (Skin-Cup), und die Ausgaben stammen aus aehnlichen Cups statt aus demselben. */
    fuerBelohnung, aehnlich, ausVorlauf, standard,
    grundlage: werte.length,
    hinweis: schnitt === null
      ? 'Zu den früheren Ausgaben liegen keine Ergebnisse vor.' : null,
  });
}

/** Fuer alle gleich - Vercels Zwischenspeicher beantwortet Wiederholungen (lib/zwischenspeicher). */
export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 20);
}
