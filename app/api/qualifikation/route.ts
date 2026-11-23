import { NextResponse } from 'next/server';
import {
  gecacht, holeTop, holeSeite, cupsGruppiert, archivCups, REGIONEN, EpicLoginNoetig,
} from '@/lib/epicCups';

/**
 * Die Eintraege um einen Rang - bei tiefen Raengen nur die Seite, auf der er steht (Epic: 100 je Seite), statt aller Seiten davor. Ab Rang 300 lohnt das:
 * Rang 8000 im FNCS-Qualifier hiess sonst 80 Seiten in einem Zug.
 */
async function umRang(eventId: string, windowId: string, rang: number) {
  if (rang <= 300) return holeTop(eventId, windowId, rang);
  const seite = await holeSeite(eventId, windowId, Math.floor((rang - 1) / 100), true);
  return seite;
}
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { liesJson, schreibJson } from '@/lib/ablage';

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

/** Die Stufe eines Spieltags: offene Runde, Heat, Last Chance oder Finale - verglichen wird nur Gleiches mit Gleichem. */
function stufe(f: { windowId: string; istFinale?: boolean; tokens?: string[] }): string {
  const w = f.windowId;
  /*
   * Last Chance in zwei Rollen (Betreiber, 16.11.2026: "CompHub Prediction ~252" fuer die offene LCQ der FNCS Solos Reload, Top 20). Die offene Runde
   * (S42/S43 "..._LastChanceQualifier_<R>", 11/12 Spiele, Zugang per RegionLock) und das kleine Finale ("..._LastChanceLobby_<R>", 5 Spiele, Zugang nur mit der
   * Marke "..._LastChanceFinal_<R>") liefen beide als "lcq" - die Prognose mittelte Platz 20 der S42-Lobby (138, rund 40 Spieler) mit Platz 20 der offenen
   * S42-LCQ (365). Die Rolle steht in Epics Daten, nicht im Namen: das Finale verlangt eine Final-Marke (istFinale), die offene Runde nicht.
   */
  if (/lastchance|lcq/i.test(w)) return f.istFinale || (f.tokens ?? []).some((t) => /final/i.test(t)) ? 'lcq-finale' : 'lcq';
  if (/heat/i.test(w)) return 'heat';
  if (f.istFinale || /final/i.test(w)) return 'finale';
  return 'offen';
}

/** Die Kennung ohne Season, Region und Durchgangsnummer - auch die Vorsaison zaehlt als dieselbe Reihe (S42 fuer S43). */
function reihe(windowId: string): string {
  return (windowId ?? '')
    .replace(/^S\d+_/i, '')
    .replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE|GLOBAL)$/i, '')
    .replace(/(Event|Week|Qual)\d+/gi, '$1#')
    .toLowerCase();
}

/**
 * Wie weit die Grenze (Punkte auf dem letzten Qualifikationsplatz) im Mittel schon ist, gemessen am Endwert - nach dem Anteil x = mittlere Spielzahl bis zur
 * Grenze / Spiele insgesamt. Gemessen an abgeschlossenen Spieltagen (Verlauf aus den vollen Replays, je Spieler gegen Epics Endstand geprueft, 15.11.2026):
 *   lobby: FNCS Heats, alle in einer Lobby (S42 Solo Heats 1+2, 6 Spiele, Top 35; S43 Solos Reload Heats, 8 Spiele, Top 15, Sieg = sofort weiter), 18 Fenster
 *   offen: viele Lobbys (S43 Solos Reload Round 3, 12 Spiele, Top 80, alle Regionen), 7 Fenster
 * streu: relativer Fehler (RMS) der Hochrechnung an dieser Stelle, aus denselben Fenstern (je Fenster ohne sich selbst gerechnet).
 */
const KURVEN: Record<'lobby' | 'offen', { kurve: Array<[number, number]>; streu: Array<[number, number]> }> = {
  lobby: {
    kurve: [[0.1, 0.042], [0.15, 0.048], [0.2, 0.146], [0.25, 0.168], [0.3, 0.229], [0.35, 0.321], [0.4, 0.336], [0.45, 0.371], [0.5, 0.462], [0.55, 0.484],
      [0.6, 0.506], [0.65, 0.6], [0.7, 0.633], [0.75, 0.658], [0.8, 0.717], [0.85, 0.804], [0.9, 0.827], [0.95, 0.87], [1.0, 0.95]],
    streu: [[0.2, 0.644], [0.3, 0.137], [0.4, 0.065], [0.5, 0.094], [0.6, 0.078], [0.7, 0.054], [0.8, 0.065], [0.9, 0.054], [1.0, 0.057]],
  },
  offen: {
    kurve: [[0.1, 0.091], [0.15, 0.194], [0.2, 0.249], [0.25, 0.313], [0.3, 0.365], [0.35, 0.423], [0.4, 0.476], [0.45, 0.537], [0.5, 0.598], [0.55, 0.655],
      [0.6, 0.723], [0.65, 0.78], [0.7, 0.843], [0.75, 0.906], [0.8, 0.968]],
    streu: [[0.1, 0.56], [0.2, 0.042], [0.3, 0.03], [0.4, 0.03], [0.5, 0.03], [0.6, 0.03], [0.7, 0.03], [0.8, 0.03]],
  },
};
/** Relativer Fehler der Vorab-Prognose (gemessen: Reload-Heats 6,8 %, S42-Heats 6,4 %, Round 3 3,3 % - genommen wird der vorsichtigere Wert). */
const STREU_VORAB = 0.06;

function linear(pts: Array<[number, number]>, x: number): number {
  if (x <= pts[0][0]) return pts[0][0] > 0 ? pts[0][1] * (x / pts[0][0]) : pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]; const [x1, y1] = pts[i];
    if (x <= x1) return x1 > x0 ? y0 + (y1 - y0) * (x - x0) / (x1 - x0) : y0;
  }
  return pts[pts.length - 1][1];
}

/** Woraus die Prognose waehrend des Spieltags besteht - die Seite zeigt es neben der Zahl. */
export type MitteGrund = {
  /** Die Grenze von jetzt und die mittlere Spielzahl bis zur Grenze. */
  grenze: number; stand: number; spiele: number;
  /** Die Vorab-Prognose (null: keine). */
  vorab: number | null;
  /** Die Grenze hochgerechnet ueber den Anteil aehnlicher Spieltage, und dieser Anteil (0..1). */
  hochgerechnet: number | null; anteil: number | null;
  /** Wie stark die Hochrechnung zaehlt (0..1); der Rest ist die Vorab-Prognose. */
  gewicht: number;
  /** Alle bis zur Grenze haben alle Spiele gespielt - die Grenze ist (fast) das Ergebnis. */
  fertig: boolean;
};

/** Was je Spieltag in prognose-mitte.json steht. fassung 3: vorabFest (eingefroren), einmalGesetzt (das eine Update kleiner Cups), live (nur gemerkt). */
type MitteMerk = {
  wert: number | null; nachSpielen: number; zeit: number; fassung?: number; grund?: MitteGrund;
  vorabFest?: number | null; einmalGesetzt?: boolean; live?: { wert: number; nachSpielen: number; grund: MitteGrund };
};

/** Grosse Cups: die Prognose bleibt den ganzen Cup ueber eine Zahl (Betreiber, 19.11.2026). */
const GROSSE_CUPS = /FNCS|Heat|LastChance|LCQ|Divisional|PerformanceEval|GlobalChampionship|Major|Finals?/i;
function istGrosserCup(windowId: string, eventId: string): boolean {
  return GROSSE_CUPS.test(windowId) || GROSSE_CUPS.test(eventId);
}

/** Die Prognose aus Grenze, Stand und Vorab-Prognose - nie unter der Grenze von jetzt. */
function mitteRechnen(art: 'lobby' | 'offen', grenze: number, stand: number, spiele: number, vorab: number | null): { wert: number; grund: MitteGrund } | null {
  const basis = { grenze, stand: Math.round(stand * 100) / 100, spiele, vorab };
  if (stand >= spiele) return { wert: grenze, grund: { ...basis, hochgerechnet: grenze, anteil: 1, gewicht: 1, fertig: true } };
  const x = Math.max(0, stand / spiele);
  const anteil = linear(KURVEN[art].kurve, x);
  if (anteil < 0.05) return vorab !== null ? { wert: Math.max(vorab, grenze), grund: { ...basis, hochgerechnet: null, anteil: null, gewicht: 0, fertig: false } } : null;
  const hoch = grenze / anteil;
  if (vorab === null) return { wert: Math.round(Math.max(hoch, grenze)), grund: { ...basis, hochgerechnet: Math.round(hoch), anteil, gewicht: 1, fertig: false } };
  const sH = linear(KURVEN[art].streu, x) * vorab; const sV = STREU_VORAB * vorab;
  const gewicht = (1 / sH ** 2) / (1 / sH ** 2 + 1 / sV ** 2);
  const wert = Math.round(Math.max(gewicht * hoch + (1 - gewicht) * vorab, grenze));
  return { wert, grund: { ...basis, hochgerechnet: Math.round(hoch), anteil: Math.round(anteil * 1000) / 1000, gewicht: Math.round(gewicht * 100) / 100, fertig: false } };
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

  // Dazu das Archiv: Epic fuehrt die Spieltage der Vorsaison nicht mehr - ohne sie fehlte neuen Saisons jede fruehere Ausgabe.
  try {
    const frisch = cups;
    const archiv = await gecacht('qual-archiv|' + region, 30 * 60_000, () => archivCups(new Set(frisch.map((c) => c.id))));
    cups = [...frisch, ...archiv];
  } catch { /* ohne Archiv bleibt es bei Epics Liste */ }

  // Alle Spieltage derselben Region, flach.
  const alle = [...new Map(cups.flatMap((c) => (c.regionen[region] ?? [])).map((f) => [f.windowId, f])).values()];
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
  /*
   * Eine Runde ueber mehrere Tage (Round 1 Day 1 / Day 2): Epic fuehrt die Zahl nur am letzten Tag, und sie gilt fuer die Summe beider Tage
   * (FNCS Solos Reload, 3.11.2026: "Top 4,000 EU" nach Day 1 + Day 2). Am ersten Tag stand sonst die Zahl einer anderen Reihe - Top 8.000 aus den
   * normalen Solos (Betreiber: "da steht Top 8K, aber in der Beschreibung steht was anderes").
   */
  const tagRunde = /Day\d+/i.test(dieser.windowId);
  // Ohne Angabe in der Adresse (Overlay "automatisch") zuerst Epics eigene Zahl dieses Spieltags - sonst nahm Day 2 die 8.000 der normalen Solos.
  if ((!Number.isFinite(schwelle) || schwelle < 1) && dieser.qualifiziert) schwelle = dieser.qualifiziert;
  if ((!Number.isFinite(schwelle) || schwelle < 1) && tagRunde) {
    const geschwister = alle.find((f) => f.eventId === dieser.eventId && f.windowId !== dieser.windowId && f.qualifiziert
      && f.windowId.replace(/Day\d+/i, 'Day#') === dieser.windowId.replace(/Day\d+/i, 'Day#'));
    if (geschwister?.qualifiziert) schwelle = geschwister.qualifiziert;
  }

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
    const artVonFenster = (w: string) => cups.find((c) => (c.regionen[region] ?? []).some((f) => f.windowId === w))?.art;
    const runde1 = (w: string) => /round\s*1(?!\d)/i.test(w);
    const neueste = (l: typeof alle) => [...l].sort((a, b) => b.begin - a.begin);
    const kandidaten = [
      ...neueste(alle.filter((f) => f.windowId !== dieser.windowId && reihe(f.windowId) === reihe(dieser.windowId) && f.status === 'vorbei')),
      ...neueste(alle.filter((f) => f.windowId !== dieser.windowId && reihe(f.windowId) !== reihe(dieser.windowId) && f.status === 'vorbei'
        && groesse(f) === groesse(dieser) && stufe(f) === stufe(dieser) && artVonFenster(f.windowId) === artVonFenster(dieser.windowId)
        && runde1(f.windowId) === runde1(dieser.windowId))),
    ].slice(0, 4);
    for (const vorlauf of kandidaten) {
      if (vorlauf.qualifiziert) { schwelle = vorlauf.qualifiziert; ausVorlauf = true; break; }
      const danach = alle.filter((f) => f.eventId === vorlauf.eventId && f.begin > vorlauf.begin).sort((a, b) => a.begin - b.begin)[0];
      if (!danach) continue;
      try {
        const feld = await gecacht(`feld|${danach.eventId}|${danach.windowId}`, 30 * 60_000, () => holeTop(danach.eventId, danach.windowId, 1000));
        // Mehr als 1000 im Feld: die Groesse aus Epics Perzentil des letzten geholten Platzes.
        const letzter = feld.entries[feld.entries.length - 1] as { rank: number; percentile?: number } | undefined;
        const groesseFeld = feld.entries.length >= 1000 && letzter?.percentile ? Math.round(letzter.rank / letzter.percentile) : feld.entries.length;
        if (groesseFeld) { schwelle = groesseFeld; ausVorlauf = true; break; }
      } catch { /* naechster Kandidat */ }
    }
  }
  // Kein willkuerliches "Top 100": ohne Weiterkommen, Belohnung oder Preisgeld gibt es nichts vorherzusagen (Arena-/Test-Cups ohne Finale).

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
  /*
   * Bis eine halbe Stunde nach dem Ende gilt der Stand als "jetzt": das letzte Spiel darf kurz vor Schluss noch beginnen, und erst wenn es fertig ist,
   * steht die Grenze (Betreiber, 8.11.2026: "Qual Needed kannst du erst nach einer halben Stunde nach dem Cup sagen").
   */
  const NACHLAUF = 30 * 60_000;
  const jetzt = Date.now();
  const laeuft = dieser.begin <= jetzt
    && (typeof dieser.end === 'number' ? jetzt <= dieser.end + NACHLAUF : dieser.status === 'live');
  const vorbei = !laeuft && (dieser.status === 'vorbei'
    || (typeof dieser.end === 'number' && jetzt > dieser.end));
  let tatsaechlich: number | null = null;
  let gespielt = 0;
  /** Mittlere Spielzahl bis zur Grenze (ohne sofort Qualifizierte) - der Fortschritt fuer die Hochrechnung; null, wo die Seite ihn nicht hergibt. */
  let stand: number | null = null;
  if (vorbei || laeuft) {
    try {
      const board = await gecacht(
        `qualIst|${dieser.eventId}|${dieser.windowId}|${schwelle}|${laeuft ? 'live' : 'fertig'}`,
        // Auch nach dem Nachlauf schreibt Epic manchmal noch nach - die ersten zwei Stunden jede Minute neu, danach halbstuendlich.
        laeuft ? 15_000 : typeof dieser.end === 'number' && jetzt - dieser.end < 2 * 3_600_000 ? 60_000 : 30 * 60_000,
        () => umRang(dieser.eventId, dieser.windowId, schwelle));
      const treffer = board.entries.find((e) => e.rank === schwelle);
      // Null Punkte auf dem Platz heisst: noch nichts gespielt, oder Epic
      // fuehrt fuer diesen Cup keine Punkte. Beides ist keine Auskunft.
      if (treffer && typeof treffer.points === 'number' && treffer.points > 0) {
        tatsaechlich = treffer.points;
      }
      // Wie viele Spiele schon gespielt sind: das Meiste, was ein Eintrag dieser Seite fuehrt.
      gespielt = board.entries.reduce((a, e) => Math.max(a, (e as { matches?: unknown[] }).matches?.length ?? 0), 0);
      /*
       * Wie weit der Spieltag an der Grenze wirklich ist: die mittlere Spielzahl der Eintraege bis zur Grenze, ohne die sofort Qualifizierten (FNCS-Heats:
       * ein Sieg = 1.000 Punkte, der Sieger hoert auf). "gespielt" (das Meiste auf der Seite) springt schon, sobald im naechsten Spiel der Erste ausscheidet -
       * die Grenze steht dann noch auf dem Stand davor (Heat 2 EU, 15.11.2026: gespielt 5, Grenze 107 = Stand nach vier Spielen, hochgerechnet 171).
       */
      if (schwelle <= 300) {
        const bis = board.entries.filter((e) => e.rank <= schwelle);
        const sofort = dieser.sofortPunkte ?? 0;
        const offen = bis.filter((e) => !(sofort > 0 && e.points >= sofort));
        const nimm = offen.length ? offen : bis;
        if (nimm.length) stand = nimm.reduce((s, e) => s + ((e as { matches?: unknown[] }).matches?.length ?? 0), 0) / nimm.length;
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
  /*
   * Die Vorsaison nur, solange die laufende Saison noch nicht genug hergibt (Betreiber, 19.11.2026: Performance Evaluation Event 3 EU - die letzten beiden
   * echten Grenzen lagen bei 324 und 325, der Schnitt nahm S42 Event 9 mit 390 dazu). Gibt es zwei Ausgaben derselben Reihe aus der Saison des Spieltags,
   * zaehlen nur diese - die Vorsaison hatte ein anderes Feld und andere Punkte. "rein" heisst: die Vorlage besteht nur aus der laufenden Saison.
   */
  const saisonVon = (w: string) => /^S(\d+)_/i.exec(w)?.[1] ?? '';
  const vorgaenger = (f: typeof alle[number]) => {
    const liste = alle
      .filter((x) => x.windowId !== f.windowId && reihe(x.windowId) === reihe(f.windowId) && x.begin < f.begin && x.status === 'vorbei')
      .sort((a, b) => b.begin - a.begin)
      .slice(0, AUSGABEN);
    const eigene = liste.filter((x) => saisonVon(x.windowId) === saisonVon(f.windowId));
    return eigene.length >= 2 ? { liste: eigene, rein: true } : { liste, rein: false };
  };
  const eigeneReihe = vorgaenger(dieser);
  let frueher = eigeneReihe.liste;
  let saisonrein = eigeneReihe.rein;
  /*
   * Kein frueherer Lauf desselben Cups (einmalige Skin-Cups): die letzten Ausgaben aehnlicher Cups - gleiche Art (Skin-Cup, Cash Cup, ...), gleiche
   * Teamgroesse, gleiche Region, nicht aelter als 60 Tage. Die Titel stehen in der Antwort, damit nachpruefbar bleibt, woher die Zahl kommt.
   */
  const artVon = new Map<string, string>();
  const titelVon = new Map<string, string>();
  for (const c of cups) for (const f of (c.regionen[region] ?? [])) { artVon.set(f.windowId, c.art); titelVon.set(f.windowId, c.titel); }
  let aehnlich = false;
  /*
   * Runde ueber mehrere Tage: ist ein frueherer Tag derselben Runde schon gespielt, ist er die beste Vorlage fuer den naechsten - derselbe Cup,
   * dasselbe Feld, dieselbe Wertung (Betreiber, 3.11.2026: Day 2 der FNCS Solos Reload nach dem echten Wert von Day 1). Ohne Aufschlag wie bei
   * aehnlichen Cups (aehnlich = true), der Wert ist ja schon das Ergebnis eines Tages.
   */
  let vortag = false;
  if (!frueher.length && tagRunde) {
    const tage = alle.filter((f) => f.eventId === dieser.eventId && f.windowId !== dieser.windowId && f.begin < dieser.begin && f.status === 'vorbei'
      && f.windowId.replace(/Day\d+/i, 'Day#') === dieser.windowId.replace(/Day\d+/i, 'Day#'));
    if (tage.length) { frueher = tage.sort((x, y) => y.begin - x.begin).slice(0, AUSGABEN); aehnlich = true; vortag = true; }
  }
  /*
   * Heats desselben Events (Betreiber, 14.11.2026: "wie kann morgen deine Prediction bei 284 liegen, wenn heute 228 Qual war"): ist ein anderer Heat
   * desselben Events schon gespielt, ist er die beste Vorlage - dasselbe Feld, dieselbe Insel, dieselbe Wertung. Er geht vor frueheren Saisons.
   */
  let heatVorlage = false;
  if (/Heat\d+/i.test(dieser.windowId)) {
    const heats = alle.filter((f) => f.eventId === dieser.eventId && f.windowId !== dieser.windowId && f.status === 'vorbei'
      && f.windowId.replace(/Heat\d+/i, 'Heat#') === dieser.windowId.replace(/Heat\d+/i, 'Heat#'));
    if (heats.length) { frueher = heats.sort((x, y) => y.begin - x.begin).slice(0, AUSGABEN); aehnlich = true; vortag = true; heatVorlage = true; saisonrein = false; }
  }
  if (!frueher.length) {
    const art = artVon.get(dieser.windowId);
    const g = groesse(dieser);
    const st = stufe(dieser);
    const r1 = (w: string) => /round\s*1(?!\d)/i.test(w);
    const basis = alle.filter((f) => f.windowId !== window_ && f.status === 'vorbei' && f.begin < dieser.begin
      && f.begin > dieser.begin - 60 * 864e5 && groesse(f) === g && stufe(f) === st);
    const kandidaten = basis.filter((f) => r1(f.windowId) === r1(dieser.windowId));
    /*
     * Zuerst Cups im selben Modus (gleiche Playlist = gleiche Insel, gleiches Punktesystem) mit gleicher Spielzahl - auch ohne "Round 1" im Namen.
     * Betreiber, 3.11.2026: "einen Reload-Cup kann man nicht mit einem Battle-Royale-Cup vergleichen, da gibt es ein komplett anderes Punktesystem" -
     * der Solo Reload Test Cup (gleiche Wertung, 12 Spiele, 150 Minuten) traf die FNCS Solos Reload, die normalen Solos lagen weit daneben.
     */
    // Elite-Cups nur mit Elite-Cups: dort spielt ein anderes Feld (Elite Kado Thorne zog die Schaetzung fuer die FNCS Solos Reload von 326 auf 341).
    const elite = (w: string) => /elite/i.test(`${titelVon.get(w) ?? ''} ${w}`);
    const gleicherModus = dieser.playlist ? basis.filter((f) => f.playlist === dieser.playlist && elite(f.windowId) === elite(dieser.windowId)) : [];
    const gleicheSpiele = gleicherModus.filter((f) => !dieser.matchCap || f.matchCap === dieser.matchCap);
    // Dann dieselbe Art (Skin-Cup mit Skin-Cups), sonst jede Art derselben Stufe und Teamgroesse.
    const gleicheArt = kandidaten.filter((f) => artVon.get(f.windowId) === art);
    const gewaehlt = gleicheSpiele.length ? gleicheSpiele : gleicherModus.length ? gleicherModus : gleicheArt.length ? gleicheArt : kandidaten;
    // Dieselbe Region zuerst: Epics NAC-Liste fuehrt auch die NAW-Spieltage, und die offene LCQ NA Central nahm sonst die von NA West (16.11.2026).
    const endung = new RegExp(`_${region}$`, 'i');
    const eigeneRegion = gewaehlt.filter((f) => endung.test(f.windowId));
    frueher = (eigeneRegion.length ? eigeneRegion : gewaehlt)
      .sort((a, b) => b.begin - a.begin)
      .slice(0, AUSGABEN);
    aehnlich = frueher.length > 0;
  }

  /*
   * Ohne verwertbare Vorlage (NA West Round 2 der FNCS Solos Reload: keine fruehere Round 2, die Victory Cups hatten keinen Platz 500): dieselbe Runde in den
   * Regionen, die sie schon gespielt haben - ihr echter Wert (Betreiber, 7.11.2026: "bei Qualifying steht einfach keine Punkte daneben ... in allen Regionen").
   */
  let andereRegionen = false;
  const ausAnderenRegionen = async () => {
    const muster = window_.replace(/_[A-Z]+$/, '');
    const andere = new Map<string, { windowId: string; eventId: string; begin: number }>();
    for (const c of cups) for (const [r, liste] of Object.entries(c.regionen)) {
      if (r === region) continue;
      for (const f of liste) if (f.windowId.replace(/_[A-Z]+$/, '') === muster && f.status === 'vorbei') andere.set(f.windowId, f);
    }
    const raus: Array<{ windowId: string; datum: number; punkte: number | null; titel?: string | null }> = [];
    await Promise.all([...andere.values()].map(async (f) => {
      try {
        const board = await gecacht(`qual|${f.eventId}|${f.windowId}|${schwelle}`, 30 * 60_000, () => umRang(f.eventId, f.windowId, schwelle));
        const tr = board.entries.find((e) => e.rank === schwelle);
        if (tr && tr.points > 0) raus.push({ windowId: f.windowId, datum: f.begin, punkte: tr.points, titel: 'Same round, other region' });
      } catch { /* ohne diese Region */ }
    }));
    return raus;
  };
  const vorab = !frueher.length ? await ausAnderenRegionen() : [];
  if (vorab.length) andereRegionen = true;

  if (!frueher.length && !vorab.length) {
    // Ohne Vorgeschichte bleibt trotzdem, was dieser Spieltag gekostet hat.
    return NextResponse.json({
      vorhanden: tatsaechlich !== null, schwelle, tatsaechlich, laeuft,
      hinweis: tatsaechlich === null
        ? 'Von diesem Cup ist noch keine frühere Ausgabe gelaufen.' : null,
      ausgaben: [], schnitt: null,
    });
  }

  const ausgaben: Array<{ windowId: string; datum: number; punkte: number | null; titel?: string | null; rang?: number }> = [...vorab];
  /*
   * Wie gross das Feld dieses Spieltags ist: bei einer spaeteren Runde so viele, wie aus der Runde davor weiterkamen. Ist das Feld einer Vorlage anders gross,
   * gilt dort derselbe ANTEIL statt desselben Platzes (Betreiber, 8.11.2026: FNCS Solos Reload Round 3 - 500 Spieler, Top 80; die Prognose nahm Platz 80 der
   * Round 2 mit 7.900 Spielern, 448 Punkte, ein Profi rechnete mit 320-350). An den Solo-Qualifiern der Saison 42 geprueft: Round 3, Platz 80 von ~990, lag
   * mit dem Anteil 2 bis 8 Punkte neben dem echten Wert (293/286, 290/294, 295/287, 284/286), mit demselben Platz 57 bis 84 darueber.
   */
  const vorRunde = alle.filter((f) => f.eventId === dieser.eventId && f.windowId !== dieser.windowId && f.begin < dieser.begin)
    .sort((a, b) => b.begin - a.begin)[0];
  const feldDieser = /round\s*[2-9]/i.test(dieser.windowId) && vorRunde?.qualifiziert ? vorRunde.qualifiziert : null;
  for (const f of frueher) {
    try {
      /*
       * Das Archiv kennt mancher alte Fenster unter einer falschen Event-Kennung: S42_PerformanceEvaluation_Event9Round1_EU steht dort unter
       * "..._PerformanceEvaluation_EU", bei Epic liegt es unter "..._PerformanceEvaluationTrios_EU". Epic antwortet dann 404, und die Prognose fiel still weg
       * (Betreiber, 5.11.2026: "wieso sehe ich keine Prediction"). Dann gilt die Kennung des laufenden Cups mit der Saison des alten Fensters.
       */
      const saison = /^S\d+/.exec(f.windowId)?.[0] ?? '';
      const zweite = dieser.eventId.replace(/S\d+/, saison);
      const lesen = (event: string) => gecacht(`qual|${event}|${f.windowId}|${schwelle}`, 30 * 60_000, () => umRang(event, f.windowId, schwelle));
      const board = await lesen(f.eventId).catch(async (e) => { if (zweite === f.eventId) throw e; return lesen(zweite); });
      // Genau der Rang, der noch weiterkommt.
      const treffer = board.entries.find((e) => e.rank === schwelle)
        // Reicht die Liste nicht ganz hin, gilt der letzte vorhandene Rang -
        // das ist dann eine Untergrenze, keine Erfindung.
        ?? board.entries[board.entries.length - 1];
      let punkte = treffer && treffer.rank === schwelle ? treffer.points : null;
      let rang: number | undefined;
      // Die Groesse des Vorlage-Feldes: Epics Perzentil, wo es dabei ist, sonst aus der Zahl der Seiten der Bestenliste (die letzte Seite gezaehlt).
      let feldRef: number | null = null;
      const anteil = (treffer as { percentile?: number } | undefined)?.percentile;
      if (feldDieser && treffer && anteil && anteil > 0) feldRef = Math.round(treffer.rank / anteil);
      if (feldDieser && !feldRef) {
        try {
          const erste = await holeSeite(f.eventId, f.windowId, 0, true);
          const proSeite = erste.entries.length;
          if (erste.totalPages > 1 && proSeite) feldRef = (erste.totalPages - 1) * proSeite + (await holeSeite(f.eventId, f.windowId, erste.totalPages - 1, true)).entries.length;
          else feldRef = proSeite || null;
        } catch { /* ohne Feldgroesse bleibt der Platz */ }
      }
      if (feldDieser && feldRef) {
        if (Math.abs(feldRef / feldDieser - 1) > 0.2) {
          /*
           * Derselbe Anteil wie die Schwelle. Das "Safe Qual" mit drei Vierteln (8.11.2026) lag in Round 3 der Solos Reload 37 Punkte zu hoch (344 statt 307) -
           * Betreiber, 9.11.2026: "30 Punkte sind nicht nichts". Der genaue Anteil lag an den S42-Qualifiern 2 bis 8 Punkte daneben; den Rest lernt die Korrektur unten.
           */
          rang = Math.max(1, Math.round((schwelle / feldDieser) * feldRef));
          try {
            const b2 = await gecacht(`qual|${f.eventId}|${f.windowId}|${rang}`, 30 * 60_000, () => umRang(f.eventId, f.windowId, rang!));
            const t2 = b2.entries.find((e) => e.rank === rang);
            punkte = t2 ? t2.points : null;
          } catch { punkte = null; }
        }
      }
      ausgaben.push({
        windowId: f.windowId, datum: f.begin, punkte,
        ...(rang ? { rang } : {}),
        ...(aehnlich ? { titel: titelVon.get(f.windowId) ?? null } : {}),
      });
    } catch {
      ausgaben.push({ windowId: f.windowId, datum: f.begin, punkte: null, ...(aehnlich ? { titel: titelVon.get(f.windowId) ?? null } : {}) });
    }
  }

  let werte = ausgaben.map((a) => a.punkte)
    .filter((x): x is number => typeof x === 'number' && x > 0);
  if (!werte.length && !andereRegionen) {
    const nachtrag = await ausAnderenRegionen();
    if (nachtrag.length) { andereRegionen = true; aehnlich = true; ausgaben.push(...nachtrag); werte = nachtrag.map((a) => a.punkte as number); }
  }
  if (andereRegionen) aehnlich = true;
  /*
   * Auch bei einer Runde ueber mehrere Tage aus aehnlichen Cups geschaetzt - aber am richtigen Platz (Betreiber, 3.11.2026: die Schaetzung aus den
   * normalen Solos stimmt ungefaehr, nur eben fuer Top 4.000 statt 8.000: "was wuerdest du bei Solos nehmen, wenn es Top 4000 waere").
   */
  const schnitt = werte.length
    ? Math.round(werte.reduce((s, x) => s + x, 0) / werte.length) : null;

  /*
   * Aus den eigenen Fehlern lernen (Betreiber, 9.11.2026: "aus dem musst du lernen ... dass du daraus immer wieder genauer wirst"). Ist ein Spieltag fertig, wird
   * festgehalten, was die Prognose sagte und was es wirklich kostete. Fuer kuenftige Spieltage derselben Art (gleiche Reihe ohne Saison, gleiche Runde) kommt der
   * mittlere Fehler der letzten sechs als Korrektur dazu - so wird jede Ausgabe genauer, ohne dass jemand von Hand nachstellt.
   */
  const ZUSCHLAG = 5; // wie QUAL_ZUSCHLAG auf der Event-Seite
  // Offene LCQ und LCQ-Finale haben dieselbe Event-Kennung ("..._LastChanceQualifier_<R>") - ohne den Zusatz lernte das Finale aus der offenen Runde (16.11.2026).
  const art = `${dieser.eventId.replace(/^epicgames_S\d+_/i, '').replace(/_[A-Z]+$/, '')}|${/Round(\d+)/i.exec(dieser.windowId)?.[1] ?? (/Heat/i.test(dieser.windowId) ? 'heat' : '')}${stufe(dieser) === 'lcq-finale' ? '|finale' : ''}`;
  /* rein/schwelle: seit 19.11.2026 mitgeschrieben - ob die Vorlage nur aus der laufenden Saison bestand, und fuer welchen Platz. */
  type Lern = { windowId: string; art: string; prognose: number; tatsaechlich: number; zeit: number; rein?: boolean; schwelle?: number };
  let korrektur = 0; let gelernt = 0;
  /* Woraus die Korrektur gelernt ist - fuer die Erklaerung an der Prognose. */
  let korrekturAus: Array<{ windowId: string; prognose: number; tatsaechlich: number }> = [];
  let korrekturArt: 'punkte' | 'anteil' | null = null;
  try {
    const lern = await liesJson<Lern[]>('prognose-lernen.json', []);
    const fertig = !laeuft && typeof dieser.end === 'number' && jetzt > dieser.end + 30 * 60_000;
    if (fertig && tatsaechlich !== null && schnitt !== null && !lern.some((l) => l.windowId === dieser.windowId)) {
      lern.push({ windowId: dieser.windowId, art, prognose: schnitt + (aehnlich ? 0 : ZUSCHLAG), tatsaechlich, zeit: Date.now(), rein: saisonrein, schwelle });
      await schreibJson('prognose-lernen.json', lern.slice(-400)).catch(() => { /* beim naechsten Aufruf */ });
    }
    /*
     * Gelernt wird nur aus Spieltagen, deren Vorlage gleich gebaut war (Betreiber, 19.11.2026: Performance Evaluation Event 3 EU, Schnitt 346 - 65 = 286, obwohl
     * die letzten beiden Grenzen 324 und 325 waren). Die -65 waren der Fehler alter Prognosen, die auf der Vorsaison standen - steht die Vorlage jetzt auf der
     * laufenden Saison, ist dieser Fehler schon heraus und wurde ein zweites Mal abgezogen. Deshalb:
     *  - "rein" muss passen: Vorlage nur aus der laufenden Saison oder nicht. Fuer aeltere Eintraege ohne den Vermerk aus dem Katalog nachgerechnet, und bei
     *    "rein" die Prognose neu - so, wie diese Fassung sie damals gestellt haette (Schnitt der Vorgaenger aus der laufenden Saison + Zuschlag).
     *  - dieselbe Region zuerst (NA Central lag 77 daneben, Europa 47 - das ist kein Fehler, den Europa erbt). Nur ohne eigene Region die anderen, und dann
     *    als Verhaeltnis Ergebnis/Prognose statt in Punkten.
     */
    const regionVon = (w: string) => /_([A-Z]+)$/.exec(w)?.[1] ?? '';
    const fensterVon = new Map(alle.map((f) => [f.windowId, f]));
    const fensterHier = (w: string) => fensterVon.get(w) ?? fensterVon.get(w.replace(/_[A-Z]+$/, `_${region}`));
    const istVon = new Map<string, number>();
    for (const l of lern) if (regionVon(l.windowId) === region) istVon.set(l.windowId, l.tatsaechlich);
    for (const a of ausgaben) if (typeof a.punkte === 'number' && a.punkte > 0 && !a.rang && regionVon(a.windowId) === region) istVon.set(a.windowId, a.punkte);
    /** Die Prognose dieser Fassung fuer einen frueheren Spieltag mit reiner Vorlage, oder null, wo die Werte nicht zu haben sind. */
    const neuePrognose = async (f: typeof alle[number]): Promise<number | null> => {
      const werteDamals: number[] = [];
      for (const v of vorgaenger(f).liste) {
        let p = istVon.get(v.windowId) ?? null;
        if (p === null) {
          try {
            const b = await gecacht(`qual|${v.eventId}|${v.windowId}|${schwelle}`, 30 * 60_000, () => umRang(v.eventId, v.windowId, schwelle));
            const t = b.entries.find((e) => e.rank === schwelle);
            p = t && t.points > 0 ? t.points : null;
          } catch { p = null; }
        }
        if (p === null) return null;
        werteDamals.push(p);
      }
      return werteDamals.length ? Math.round(werteDamals.reduce((s, x) => s + x, 0) / werteDamals.length) + ZUSCHLAG : null;
    };
    const passend: Lern[] = [];
    for (const l of lern.filter((x) => x.art === art && x.windowId !== dieser.windowId)) {
      if (typeof l.schwelle === 'number' && l.schwelle !== schwelle) continue;
      if (typeof l.rein === 'boolean') { if (l.rein === saisonrein) passend.push(l); continue; }
      const f = fensterHier(l.windowId);
      const rein = f ? vorgaenger(f).rein : false;
      if (rein !== saisonrein) continue;
      if (!rein) { passend.push(l); continue; }
      // Nur in der eigenen Region nachrechenbar (die Werte der Vorgaenger stehen in ihrer Bestenliste).
      if (!f || f.windowId !== l.windowId) continue;
      const p = await neuePrognose(f);
      if (p !== null) passend.push({ ...l, prognose: p });
    }
    const eigeneRegion = passend.filter((l) => regionVon(l.windowId) === region);
    const gleiche = (eigeneRegion.length ? eigeneRegion : passend).slice(-6);
    // Mit einem schon gespielten Heat als Vorlage keine Korrektur obendrauf - der Wert ist bereits das echte Ergebnis.
    if (gleiche.length && !heatVorlage) {
      /*
       * Stammt die Vorlage aus einem aehnlichen, aber anderen Cup (FNCS Solos Reload LCQ nach der S42 LCQ ohne Reload, 16.11.2026), liegt das ganze Niveau
       * daneben, nicht ein fester Betrag: dann gilt das Verhaeltnis Ergebnis/Prognose der schon fertigen Regionen, auf den eigenen Schnitt angewandt (OCE
       * 341 -> 365 macht aus EU 365 rund 391). Ebenso, wenn nur andere Regionen gelernt haben. Sonst wie bisher der mittlere Fehler in Punkten.
       */
      if ((aehnlich || !eigeneRegion.length) && schnitt !== null && gleiche.every((l) => l.prognose > 0)) {
        const faktor = gleiche.reduce((s, l) => s + l.tatsaechlich / l.prognose, 0) / gleiche.length;
        korrektur = Math.round(schnitt * (faktor - 1)); korrekturArt = 'anteil';
      } else {
        korrektur = Math.round(gleiche.reduce((s, l) => s + (l.tatsaechlich - l.prognose), 0) / gleiche.length); korrekturArt = 'punkte';
      }
      gelernt = gleiche.length;
      korrekturAus = gleiche.map((l) => ({ windowId: l.windowId, prognose: l.prognose, tatsaechlich: l.tatsaechlich }));
    }
  } catch { /* ohne Lernstand wie bisher */ }

  /*
   * Die Prognose waehrend des Spieltags (Betreiber, 15.11.2026, FNCS Solos Reload Heat 2 EU: vorab 228, mitten im Cup sprang die Prognose auf 173 - die
   * Grenze stand bald bei 193 und endete um 220). Bis dahin wurde die Grenze einmal linear hochgerechnet (Grenze x Spiele / gespielt) und festgehalten. Das lag
   * aus zwei Gruenden zu tief: "gespielt" springt schon, sobald im naechsten Spiel der Erste ausscheidet (die Grenze stand noch auf dem Stand davor), und die
   * Grenze waechst nicht linear - in den Heats verlassen die Sieger das Rennen, und spaete Spiele bringen mehr Punkte an der Grenze.
   *
   * Jetzt, an 25 abgeschlossenen Spieltagen nachgerechnet (FNCS Heats S42/S43 und Round 3 S43, Verlauf aus den vollen Replays, je Spieler gegen Epics Endstand
   * geprueft; Skript und Tabelle im Commit): die Grenze von jetzt geteilt durch den Anteil, den aehnliche Spieltage an diesem Punkt im Mittel schon erreicht hatten
   * (KURVEN), und diese Hochrechnung mit der Vorab-Prognose gewichtet - je nachdem, wie genau beide an diesem Punkt waren (inverse Varianz). Nie unter der Grenze
   * von jetzt (Punkte gehen nicht verloren, die Grenze kann nur steigen). Mittlerer Fehler bei den Reload-Heats: 10 statt 45 Punkte mit der alten Sperre.
   */
  /*
   * Eine Zahl je Cup (Betreiber, 19.11.2026, Performance Evaluation Event 3 EU: "die Prediction aendert sich bei jedem Neuladen - 323, 324, 314"). Die Mischung
   * aus Vorab-Prognose und Hochrechnung wurde bei jedem Abruf neu gerechnet. Jetzt:
   *  - Die Vorab-Prognose wird beim ersten Abruf ab kurz vor dem Start je Spieltag festgehalten (prognose-mitte.json, fassung 3, vorabFest) - danach zaehlt im
   *    Cup nur noch sie, auch wenn sich Lernstand oder Ausgaben aendern.
   *  - Grosse Cups (istGrosserCup): die ganze Zeit diese Zahl. Die Hochrechnung laeuft nur intern weiter (live) - fuer das Nachrechnen, nicht fuer die Anzeige.
   *  - Kleine Cups: genau ein Update, sobald die Teams an der Grenze die Haelfte der Spiele gespielt haben (ab dort ist die Streuung der Kurven klein), dann fest.
   *  - Mehrere Instanzen oder Abrufe zugleich: der erste geschriebene Wert gilt - vor dem Schreiben wird neu gelesen, und was schon steht, bleibt.
   */
  let mitte: number | null = null;
  let mitteGrund: MitteGrund | null = null;
  /** fest: grosser Cup, eine Zahl; halbzeit: kleiner Cup, noch vor dem einen Update; einmal: kleiner Cup, Update gemacht. */
  let mitteArt: 'fest' | 'halbzeit' | 'einmal' | null = null;
  try {
    const cap = dieser.matchCap ?? 0;
    const alt = schnitt !== null ? schnitt + (aehnlich ? 0 : ZUSCHLAG) + korrektur : null;
    const gross = istGrosserCup(dieser.windowId, dieser.eventId);
    const w = dieser.windowId;
    const lies = () => liesJson<Record<string, MitteMerk>>('prognose-mitte.json', {});
    /** Schreibt dazu, ohne einen schon gesetzten festen Wert oder das eine Update zu ueberschreiben - der erste gewinnt. */
    const merke = async (neu: Partial<MitteMerk>): Promise<MitteMerk> => {
      const frisch = await lies();
      const vor = frisch[w]?.fassung === 3 ? frisch[w] : undefined;
      const naechst: MitteMerk = { wert: null, nachSpielen: 0, ...vor, ...neu, fassung: 3, zeit: Date.now() };
      if (vor?.vorabFest != null) naechst.vorabFest = vor.vorabFest;
      if (vor?.einmalGesetzt) { naechst.einmalGesetzt = true; naechst.wert = vor.wert; naechst.grund = vor.grund; }
      frisch[w] = naechst;
      await schreibJson('prognose-mitte.json', frisch).catch(() => { /* beim naechsten Aufruf */ });
      return naechst;
    };
    let da: MitteMerk | undefined = (await lies())[w];
    const KURZ_VOR = 15 * 60_000;
    const imCup = laeuft || (dieser.begin > jetzt && dieser.begin - jetzt <= KURZ_VOR);
    if (imCup && alt !== null && (da?.fassung !== 3 || da.vorabFest == null)) da = await merke({ vorabFest: alt, wert: alt });
    if (imCup && da?.fassung === 3 && da.vorabFest != null) {
      const fest = da.vorabFest;
      // Die Hochrechnung von jetzt - angezeigt nur beim einen Update der kleinen Cups, sonst nur gemerkt.
      const r = laeuft && !tagRunde && cap >= 4 && tatsaechlich !== null && stand !== null
        ? mitteRechnen(/Heat\d+/i.test(w) ? 'lobby' : 'offen', tatsaechlich, stand, cap, fest) : null;
      if (gross) {
        mitte = fest; mitteArt = 'fest';
        if (r && da.live?.nachSpielen !== gespielt) await merke({ live: { wert: r.wert, nachSpielen: gespielt, grund: r.grund } });
      } else if (da.einmalGesetzt) {
        mitte = da.wert ?? fest; mitteGrund = da.grund ?? null; mitteArt = 'einmal';
      } else if (r && stand !== null && stand / cap >= 0.5) {
        const m = await merke({ einmalGesetzt: true, wert: r.wert, grund: r.grund, nachSpielen: gespielt });
        mitte = m.wert ?? fest; mitteGrund = m.grund ?? null; mitteArt = 'einmal';
      } else {
        mitte = fest; mitteArt = 'halbzeit';
      }
    } else if (!laeuft && da?.fassung === 3) {
      // Nach dem Cup: was im Cup galt, bleibt als "Prognose war" stehen.
      mitte = da.einmalGesetzt ? da.wert ?? da.vorabFest ?? null : da.vorabFest ?? null;
      mitteGrund = da.einmalGesetzt ? da.grund ?? null : null;
      mitteArt = gross ? 'fest' : da.einmalGesetzt ? 'einmal' : 'halbzeit';
    } else if (!laeuft && da && da.fassung === 2) { mitte = da.wert; mitteGrund = da.grund ?? null; }
    // Werte der alten Sperre (ohne fassung) gelten nicht mehr - sie lagen nachweislich daneben.
  } catch { /* dann bleibt die Prognose von vorher */ }

  /*
   * Die angezeigte Prognose nie unter der Ist-Grenze von jetzt (Betreiber: die Verzerrung immer leicht nach oben; "Platz 300 steht aktuell auf 435, bei
   * Qualifying stehen 408 - das musst du live updaten"). Der eingefrorene Wert - vorab/halbzeit (fest), das eine Update (einmal), auch die alte fassung 2 -
   * zieht nicht mit, wenn die echte Grenze waehrend des Cups weiter steigt: dann kostet der letzte Qualiplatz schon mehr, als die eingefrorene Prognose sagt,
   * und die Zahl stuende unter dem, was Epics Liste daneben zeigt. Hier wird die Ausgabe nachgezogen - waehrend des Cups mindestens Ist + kleiner Aufschlag
   * (die Grenze steigt weiter), danach mindestens das Ergebnis. Nur der Boden, kein Ueberschiessen: liegt die Prognose ohnehin darueber, bleibt sie, wie sie ist.
   */
  if (mitte !== null && tatsaechlich !== null) {
    const aufschlag = laeuft ? Math.max(3, Math.round(tatsaechlich * 0.02)) : 0;
    const boden = tatsaechlich + aufschlag;
    if (mitte < boden) {
      mitte = boden;
      // Die Erklaerung unter der Zahl ehrlich halten: die Grenze von jetzt hat die eingefrorene Prognose ueberholt, darum steht die Prognose auf ihr.
      mitteGrund = mitteGrund
        ? { ...mitteGrund, grenze: tatsaechlich, hochgerechnet: null, anteil: null, gewicht: 0, fertig: false }
        : null;
    }
  }

  return NextResponse.json({
    /* Die Prognose waehrend des Spieltags (null: die Vorab-Prognose bleibt) und woraus sie besteht - die Seite zeigt es an. */
    mitte, mitteGrund,
    /* fest: grosser Cup, eine Zahl fuer den ganzen Cup; halbzeit: kleiner Cup vor seinem einen Update; einmal: das Update ist gemacht. */
    mitteArt,
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
    fuerBelohnung, aehnlich, ausVorlauf,
    /* Die Ausgaben stammen nur aus der laufenden Saison (es gab mindestens zwei) - die Vorsaison ist dann weggelassen. */
    saisonrein,
    /* Die Schwelle gilt fuer die Summe aller Tage dieser Runde. */
    kumuliert: tagRunde,
    /* Gelernte Korrektur aus frueheren Spieltagen derselben Art (Punkte) und aus wie vielen. */
    korrektur, gelernt, korrekturAus, korrekturArt,
    /* Die Schaetzung kommt vom frueheren Tag derselben Runde. */
    vortag,
    grundlage: werte.length,
    hinweis: schnitt === null
      ? 'Zu den früheren Ausgaben liegen keine Ergebnisse vor.' : null,
  });
}

/** Fuer alle gleich - Vercels Zwischenspeicher beantwortet Wiederholungen (lib/zwischenspeicher). */
export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 20);
}
