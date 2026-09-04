import { NextResponse } from 'next/server';
import {
  gecacht, holeRanked, aktiveTracks, loeseNamenAuf, getToken,
  findeSpieler, EpicLoginNoetig,
} from '@/lib/epicCups';

// Epics eigenes Rangsystem - Solo, Duos, Trios, Zero Build und die
// Competitive-Stufen. Anders als die Turnierdaten laesst es sich auch
// fuer fremde Spieler abrufen.
//
//   ?ids=abc,def            -> Raenge dieser Accounts
//   ?event=…&window=…&q=…   -> erst Spieler im Cup suchen, dann Raenge
//   ?tracks=1               -> welche Rangsaisons laufen gerade

const TTL = 5 * 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    if (searchParams.get('tracks')) {
      return NextResponse.json({
        tracks: await gecacht('ranked-tracks', 30 * 60_000, aktiveTracks),
      });
    }

    let ids = (searchParams.get('ids') ?? '').split(',')
      .map((s) => s.trim()).filter(Boolean);

    // Bequemer Weg: Spielername im Cup nachschlagen und von dort die
    // eindeutige Account-ID nehmen.
    const event = searchParams.get('event');
    const window_ = searchParams.get('window');
    const q = searchParams.get('q');
    if (!ids.length && event && window_ && q) {
      const namen = q.split(',').map((s) => s.trim()).filter(Boolean);
      const gefunden = await gecacht(
        `find|${event}|${window_}|${namen.join(',').toLowerCase()}|`,
        45_000, () => findeSpieler(event, window_, namen, []));
      ids = gefunden.entries.flatMap((e) => e.players.map((p) => p.id));
    }

    if (!ids.length) {
      return NextResponse.json(
        { error: 'ids= oder event/window/q sind noetig' }, { status: 400 });
    }

    const { token } = await getToken();
    const namen = await loeseNamenAuf(ids, token);

    const spieler = await Promise.all(ids.slice(0, 25).map(async (id) => ({
      id,
      name: namen[id] ?? id.slice(0, 8),
      // Nur Modi zeigen, in denen wirklich gespielt wurde.
      ranks: (await gecacht(`ranked|${id}`, TTL, () => holeRanked(id)))
        .filter((r) => r.gespielt),
    })));

    return NextResponse.json({ spieler });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
