import { NextResponse } from 'next/server';
import { gecacht, holeTop, EpicLoginNoetig, type CupEintrag } from '@/lib/epicCups';

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
// Was Epic je Runde NICHT liefert, steht hier auch nicht: die Punkte einer
// einzelnen Runde etwa gibt es nur als Tagessumme. Sie liessen sich aus den
// Wertungsregeln nachrechnen, waeren dann aber eine eigene Behauptung und
// keine Angabe der Quelle - deshalb bleiben sie weg.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TTL = 60_000;

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
}

interface Runde { ende: string | null; teams: Zeile[] }

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

    const runden = new Map<string, Runde>();
    for (const e of daten.entries as CupEintrag[]) {
      for (const m of e.matches) {
        if (!m.sessionId) continue;
        const r = runden.get(m.sessionId) ?? { ende: m.endTime ?? null, teams: [] };
        if (!r.ende && m.endTime) r.ende = m.endTime;
        r.teams.push({
          platz: typeof m.placement === 'number' ? m.placement : null,
          tagesPlatz: e.rank,
          teamId: e.teamId,
          spieler: e.players.map((s) => ({ id: s.id, name: s.name })),
          elims: m.elims ?? 0,
          wins: m.wins ?? 0,
          timeAlive: m.timeAlive ?? 0,
          damage: m.damage ?? 0,
        });
        runden.set(m.sessionId, r);
      }
    }

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
        teams: r.teams.sort((a, b) =>
          (a.platz ?? 9999) - (b.platz ?? 9999) || a.tagesPlatz - b.tagesPlatz),
      }))
      .sort((a, b) => (a.ende ?? '').localeCompare(b.ende ?? ''))
      .map((s, i) => {
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
         * Erkennbar ist es an den Platznummern: sie muessen von eins an
         * lueckenlos durchlaufen. Fehlt eine, ist die Aufstellung
         * unvollstaendig - und das wird hier gesagt, statt sie zu zeigen.
         */
        const plaetze = s.teams
          .map((x) => x.platz)
          .filter((n): n is number => typeof n === 'number');
        const hoechster = plaetze.length ? Math.max(...plaetze) : 0;
        const vollstaendig = plaetze.length > 0
          && plaetze.length === hoechster
          && new Set(plaetze).size === plaetze.length;

        return {
        ...s,
        nummer: i + 1,
        vollstaendig,
        /** Wie viele Plaetze bis zum hoechsten gesehenen fehlen. */
        fehlend: Math.max(0, hoechster - plaetze.length),
        /*
         * Die laengste Lebenszeit dieser Runde.
         *
         * Ausdruecklich nicht "Spieldauer": Epic nennt nur die Endzeit, nicht
         * den Anfang. Wer bis zuletzt lebt, war ungefaehr so lange drin, wie
         * die Runde dauerte - das ist eine Herleitung und heisst deshalb
         * auch so, statt sich als gemessene Dauer auszugeben.
         */
        laengsteLebenszeit: s.teams.reduce((a, t) => Math.max(a, t.timeAlive), 0),
        sieger: s.teams.find((t) => t.platz === 1)?.spieler.map((x) => x.name) ?? [],
        };
      });

    return NextResponse.json({
      spiele,
      teams: daten.entries.length,
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
