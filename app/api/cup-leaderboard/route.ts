import { NextResponse } from 'next/server';
import {
  gecacht, holeTop, holeBereich, findeSpieler, ergaenzeBilder, EpicLoginNoetig,
} from '@/lib/epicCups';

// Live-Leaderboard eines Cups.
//   ?event=…&window=…            -> Top-Liste
//   &limit=100                    -> wie viele Plaetze
//   &von=5&seiten=10              -> nur dieser Ausschnitt (Seiten 5 bis 14)
//   &q=name1,name2                -> nur diese Spieler (Namenssuche)
//   &ids=abc,def                  -> nur diese Account-IDs (eindeutig)
//
// Route Handlers sind in dieser Next-Version nicht gecacht - richtig so,
// die Zwischenspeicherung passiert bewusst in epicCups.

const TTL = 45_000;

/*
 * Wie lange die Anfrage laufen darf.
 *
 * Ohne diese Zeile gilt Vercels Vorgabe von zehn Sekunden. Ein tiefer Abruf
 * ist damit nicht zu schaffen - fuenftausend Plaetze sind fuenfzig Seiten bei
 * Epic und dazu zehntausend aufzuloesende Namen. Die Folge war nicht etwa
 * eine langsame Tabelle, sondern gar keine: die Anfrage wurde mitten im
 * Abruf abgeschnitten, und in der Anzeige blieb es bei den ersten
 * fuenfhundert Plaetzen. Wer dann jemanden auf Platz zweitausend suchte,
 * fand ihn nie.
 *
 * Sechzig Sekunden sind das Hoechste, was der kostenlose Tarif hergibt.
 */
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event');
  const window_ = searchParams.get('window');

  if (!event || !window_) {
    return NextResponse.json(
      { error: 'event und window sind noetig' },
      { status: 400 },
    );
  }

  const namen = (searchParams.get('q') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const ids = (searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  // Bis zu zehntausend Plaetze. Darueber wird die Tabelle unbrauchbar,
  // und Epic gibt ohnehin nicht mehr Seiten heraus.
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 10_000);

  try {
    if (namen.length || ids.length) {
      const key = `find|${event}|${window_}|${namen.join(',').toLowerCase()}|${ids.join(',')}`;
      const daten = await gecacht(key, TTL, () => findeSpieler(event, window_, namen, ids));
      return NextResponse.json(await ergaenzeBilder(daten));
    }

    /*
     * Ein Ausschnitt statt der ganzen Liste.
     *
     * Damit holt die Seite die Bestenliste in Stuecken und haengt sie
     * aneinander, statt zehntausend Plaetze in einer einzigen Anfrage zu
     * verlangen, die ohnehin in der Zeitgrenze endet.
     */
    const von = parseInt(searchParams.get('von') ?? '', 10);
    if (Number.isFinite(von) && von >= 0) {
      const seiten = Math.min(
        Math.max(parseInt(searchParams.get('seiten') ?? '10', 10) || 10, 1), 25);
      const key = `bereich|${event}|${window_}|${von}|${seiten}`;
      const daten = await gecacht(key, TTL,
        () => holeBereich(event, window_, von, seiten));
      return NextResponse.json(await ergaenzeBilder(daten));
    }

    const key = `top|${event}|${window_}|${limit}`;
    const daten = await gecacht(key, TTL, () => holeTop(event, window_, limit));
    return NextResponse.json(await ergaenzeBilder(daten));
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
