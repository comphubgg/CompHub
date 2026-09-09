import { NextResponse } from 'next/server';
import { gecacht, holeTop, EpicLoginNoetig, type CupEintrag } from '@/lib/epicCups';
import {
  holeKatalog, punkteFuerRunde, regionAus, wertungVon, type WertungsRegel,
} from '@/lib/cupWertung';

// Die einzelnen Runden eines Spieltags.
//
//   ?event=…&window=…&limit=500
//
// Epic fuehrt das Leaderboard je Team und haengt an jedes Team seine
// Rundenliste an: zu jeder gespielten Runde eine Sitzungskennung, die
// Endzeit und die gezaehlten Werte. Diese Kennung ist dieselbe, die
// anderswo "Match ID" heisst - Epic gibt sie aus, sie ist nicht erfunden.
//
// Umgedreht ergibt das, was der Betreiber sehen wollte: nicht "wie stand
// das Team am Ende des Tages", sondern "wer wurde in diesem einen Spiel
// welcher". Dafuer werden alle Rundenlisten aller Teams nach der
// Sitzungskennung gruppiert.
//
// Drei Groessen stehen nicht in Epics Antwort und werden hier hergeleitet -
// jede aus Epics eigenen Zahlen, keine geschaetzt:
//
//   Beginn der Runde   Endzeit minus Lebenszeit. Alle Teams einer Lobby
//                      starten gemeinsam; nachgemessen an einer echten
//                      Runde liegen die so errechneten Anfaenge sechs
//                      Sekunden auseinander. Genommen wird der mittlere.
//   Lobbygroesse       der hoechste vergebene Platz.
//   Noch im Spiel      der niedrigste vergebene Platz minus eins. Epic
//                      traegt ein Team erst ein, wenn es ausgeschieden ist;
//                      wer oberhalb des niedrigsten Platzes fehlt, lebt noch.
//
// Die Punkte einer Runde kommen aus Epics eigener Punktetabelle - siehe
// lib/cupWertung.ts.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TTL = 60_000;

/** Solange nach der letzten Ausscheidung gilt eine Lobby als laufend. */
const LIVE_FENSTER = 20 * 60_000;

interface Zeile {
  platz: number | null;
  /** Der Platz am Ende des ganzen Spieltags - zum Wiedererkennen. */
  tagesPlatz: number;
  teamId: string | null;
  spieler: Array<{ id: string; name: string }>;
  elims: number;
  wins: number;
  timeAlive: number;
  damage: number;
  /** Wann dieses Team ausgeschieden ist. */
  ende: string | null;
  /** Aus Epics Punktetabelle gerechnet - null, wenn es keine gibt. */
  punkte: number | null;
}

interface Runde { ende: string | null; beginne: number[]; teams: Zeile[] }

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = p.get('event');
  const window_ = p.get('window');
  // Bis zum ganzen Feld: eine Lobby einer Qualifikation zieht sich durch
  // die gesamte Bestenliste, und eine halbe Aufstellung waere schlimmer
  // als gar keine.
  const limit = Math.min(parseInt(p.get('limit') ?? '500', 10) || 500, 10_000);

  if (!event || !window_) {
    return NextResponse.json({ error: 'event und window sind noetig' }, { status: 400 });
  }

  try {
    const daten = await gecacht(`matches|${event}|${window_}|${limit}`, TTL,
      () => holeTop(event, window_, limit));

    /*
     * Die Punktetabelle des Spieltags.
     *
     * Sie ist eine Beigabe: laesst sie sich nicht holen, bleiben die
     * Rundenpunkte leer und alles andere steht trotzdem da.
     */
    let wertung: WertungsRegel[] = [];
    try {
      const katalog = await holeKatalog(regionAus(window_));
      wertung = wertungVon(katalog, window_, event);
    } catch { /* ohne Tabelle keine Rundenpunkte */ }

    const runden = new Map<string, Runde>();
    for (const e of daten.entries as CupEintrag[]) {
      for (const m of e.matches) {
        if (!m.sessionId) continue;
        const r = runden.get(m.sessionId)
          ?? { ende: m.endTime ?? null, beginne: [], teams: [] };
        // Die spaeteste Endzeit der Runde - das ist ihr Ende.
        if (m.endTime && (!r.ende || m.endTime > r.ende)) r.ende = m.endTime;
        if (m.endTime && typeof m.timeAlive === 'number' && m.timeAlive > 0) {
          r.beginne.push(Date.parse(m.endTime) - m.timeAlive * 1000);
        }
        const platz = typeof m.placement === 'number' ? m.placement : null;
        r.teams.push({
          platz,
          tagesPlatz: e.rank,
          teamId: e.teamId,
          spieler: e.players.map((s) => ({ id: s.id, name: s.name })),
          elims: m.elims ?? 0,
          wins: m.wins ?? 0,
          timeAlive: m.timeAlive ?? 0,
          damage: m.damage ?? 0,
          ende: m.endTime ?? null,
          punkte: punkteFuerRunde(wertung, platz, m.elims ?? 0),
        });
        runden.set(m.sessionId, r);
      }
    }

    const jetzt = Date.now();

    /*
     * Die Runden in ihrer Reihenfolge.
     *
     * Nummeriert wird nach der Endzeit, nicht nach der Reihenfolge, in der
     * Epic sie ausliefert - die haengt am Team, dessen Liste gerade gelesen
     * wurde. "Spiel 3" soll fuer alle dasselbe Spiel meinen.
     */
    const spiele = [...runden.entries()]
      .map(([id, r]) => ({
        id,
        ende: r.ende,
        beginne: r.beginne,
        teams: r.teams.sort((a, b) =>
          (a.platz ?? 9999) - (b.platz ?? 9999) || a.tagesPlatz - b.tagesPlatz),
      }))
      .sort((a, b) => (a.ende ?? '').localeCompare(b.ende ?? ''))
      .map((s, i) => {
        const plaetze = s.teams
          .map((x) => x.platz)
          .filter((n): n is number => typeof n === 'number');
        const hoechster = plaetze.length ? Math.max(...plaetze) : 0;
        const niedrigster = plaetze.length ? Math.min(...plaetze) : 0;

        /*
         * Der Beginn der Runde - der mittlere der errechneten Anfaenge.
         *
         * Der Mittelwert waere anfaellig: ein Team, dessen Lebenszeit Epic
         * abweichend zaehlt, zoege ihn mit. Der mittlere Wert nicht.
         */
        const sortiert = [...s.beginne].sort((a, b) => a - b);
        const beginn = sortiert.length
          ? sortiert[Math.floor(sortiert.length / 2)] : null;

        /*
         * Laeuft diese Lobby noch?
         *
         * Zwei Bedingungen zusammen: es gibt noch keinen ersten Platz, und
         * die letzte Ausscheidung liegt nicht lange zurueck. Ohne die zweite
         * gaelte jede Lobby, aus der wir nur einen Ausschnitt sehen, auf
         * ewig als laufend.
         */
        const letzteAenderung = s.ende ? Date.parse(s.ende) : 0;
        const live = niedrigster > 1
          && letzteAenderung > 0
          && jetzt - letzteAenderung < LIVE_FENSTER;

        /*
         * Ist diese Aufstellung vollstaendig?
         *
         * Epics Bestenliste gibt hoechstens zehntausend Plaetze heraus. In
         * einer Qualifikation mit mehr Teilnehmern fehlen deshalb genau die
         * Lobby-Mitglieder, die weiter hinten stehen - und dann steht eine
         * Liste da, in der auf Platz 2 der Platz 5 folgt.
         *
         * Der Betreiber dazu: "Wenn Du schon eine Lobby erstellst mit einer
         * Liste, dann jeden Spieler von eins bis hundert. Wenn Du mal nicht
         * alle hast, dann schreibst Du nur die Match-ID hin."
         *
         * Bei einer laufenden Lobby gilt das nicht: dort fehlen die Teams,
         * die noch leben, und das ist keine Luecke, sondern der Spielstand.
         * Erwartet werden deshalb nur die Plaetze unterhalb des niedrigsten
         * gesehenen.
         */
        const erwartet = hoechster - (live ? niedrigster : 1) + 1;
        /*
         * Doppelte Platznummern sind kein Loch.
         *
         * Epic vergibt bei einem Verbindungsabbruch schon einmal denselben
         * Platz zweimal. Frueher galt eine Lobby deshalb als unvollstaendig,
         * obwohl kein einziger Platz fehlte - von siebenundneunzig beendeten
         * Runden bestanden null die Pruefung, und die Aufstellung blieb
         * ueberall verborgen. Gezaehlt werden deshalb die verschiedenen
         * Plaetze, nicht die Zeilen.
         */
        const einmalig = new Set(plaetze);
        const vollstaendig = plaetze.length > 0 && einmalig.size >= erwartet;

        return {
          id: s.id,
          ende: s.ende,
          teams: s.teams,
          nummer: i + 1,
          live,
          /** Beginn der Runde als ISO-Zeit - hergeleitet, siehe oben. */
          beginn: beginn ? new Date(beginn).toISOString() : null,
          /**
           * Wie lange die Runde laeuft beziehungsweise lief, in Sekunden.
           * Bei einer laufenden Lobby bis jetzt, sonst bis zur letzten
           * Ausscheidung.
           */
          dauer: beginn
            ? Math.max(0, Math.round(
              ((live ? jetzt : letzteAenderung || jetzt) - beginn) / 1000))
            : null,
          /** Der hoechste vergebene Platz - so gross war die Lobby. */
          lobby: hoechster || null,
          /** Wie viele Teams noch im Spiel sind. */
          verbleibend: live ? Math.max(0, niedrigster - 1) : 0,
          /** Wie viele Teams wir zu dieser Runde ueberhaupt sehen. */
          gesehen: s.teams.length,
          vollstaendig,
          /** Wie viele Plaetze in der erwarteten Spanne fehlen. */
          fehlend: Math.max(0, erwartet - einmalig.size),
          laengsteLebenszeit: s.teams.reduce((a, t) => Math.max(a, t.timeAlive), 0),
          sieger: s.teams.find((t) => t.platz === 1)?.spieler.map((x) => x.name) ?? [],
        };
      })
      // Das Juengste zuerst: wer nachsieht, sucht die laufende oder die
      // gerade beendete Runde, nicht die von vor zwei Stunden.
      .sort((a, b) => (b.ende ?? '').localeCompare(a.ende ?? ''));

    /*
     * Reichte die Bestenliste ueberhaupt bis ans Ende des Feldes?
     *
     * Eine Lobby wird aus den Teams gebaut, die in der Bestenliste stehen.
     * Epic gibt daraus hoechstens zehntausend Plaetze heraus; wer im
     * Tagesranking dahinter liegt, kommt in keiner Aufstellung vor - auch
     * dann nicht, wenn er in seiner Lobby Dritter wurde.
     *
     * Bisher fiel das nur auf, wenn dadurch eine Luecke entstand ("auf
     * Platz 2 folgt Platz 7"). Endet eine Aufstellung dagegen glatt bei
     * acht, sieht sie vollstaendig aus und ist es nicht: die Plaetze
     * danach fehlen geschlossen. Der Betreiber hat genau das gemeldet -
     * "im Bild zwei wird nicht mal gesagt, dass da Stats fehlen".
     *
     * Kam die Bestenliste an ihre Grenze, gilt das fuer jede Aufstellung
     * dieses Spieltags, und die Anzeige sagt es dazu.
     */
    const feldGrenze = daten.entries.length >= limit;

    return NextResponse.json({
      spiele,
      teams: daten.entries.length,
      /** Stiess die Bestenliste an ihre Grenze? Dann fehlen Plaetze unten. */
      feldGrenze,
      /** Steht eine Punktetabelle zur Verfuegung? */
      mitPunkten: wertung.length > 0,
      hinweis: 'Values are per team, the way Epic reports them.',
    });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
