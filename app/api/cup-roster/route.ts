import { NextResponse } from 'next/server';
import { gecacht, holeTop, ergaenzeBilder, bilder, EpicLoginNoetig } from '@/lib/epicCups';

// Alle Teams eines Cups mit der Information, wer ein Bild hinterlegt hat.
// Grundlage fuer Spielerauswahl, Rotation und Karte.
//   ?event=…&window=…&limit=100

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const event = searchParams.get('event');
  const window_ = searchParams.get('window');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10) || 100, 500);

  if (!event || !window_) {
    return NextResponse.json({ error: 'event und window sind noetig' }, { status: 400 });
  }

  try {
    const board = await gecacht(`top|${event}|${window_}|${limit}`, 45_000,
      () => holeTop(event, window_, limit));
    const mitBildern = await ergaenzeBilder(board);

    const teams = mitBildern.entries.map((e) => ({
      rank: e.rank,
      points: e.points,
      teamId: e.teamId,
      spieler: e.players.map((p) => ({ id: p.id, name: p.name, img: p.img, logo: p.logo })),
    }));
    const mitBild = teams.reduce(
      (n, t) => n + t.spieler.filter((p) => p.img).length, 0);

    return NextResponse.json({ teams, geprueft: teams.length, mitBild });
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}

// Welche Bilder liegen bereit? Fuer die Verwaltungsseite.
export async function POST() {
  const b = await bilder();
  return NextResponse.json({
    bilder: b.players.map((x) => x.key),
    logos: b.logos.map((x) => x.key),
  });
}
