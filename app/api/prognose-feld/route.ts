import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { bestimmeFeld } from '@/lib/prognoseFeld';
import { EpicLoginNoetig, gecacht } from '@/lib/epicCups';

// Das Teilnehmerfeld eines Finales - siehe lib/prognoseFeld.
//
//   GET ?event=…&window=…&region=EU
//
// Nur fuer den Betreiber: die Prognoseseite ist sein Werkzeug, und die
// Abfrage fragt Epic je Konto nach Marken - das gehoert nicht in jede
// fremde Hand.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'nur fuer den Betreiber' }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('event') ?? '';
  const windowId = searchParams.get('window') ?? '';
  const region = searchParams.get('region') ?? '';
  if (!eventId || !windowId || !region) {
    return NextResponse.json({ error: 'event, window und region sind noetig' }, { status: 400 });
  }
  try {
    // Zwei Minuten Vorrat: ein zweiter Klick auf dieselbe Kachel fragt
    // Epic nicht noch einmal nach fuenfzig Bestenlisten und Marken.
    const feld = await gecacht(`prognose-feld|${eventId}|${windowId}|${region}`, 120_000,
      () => bestimmeFeld({ eventId, windowId, region }));
    return NextResponse.json(feld);
  } catch (e) {
    const login = e instanceof EpicLoginNoetig;
    return NextResponse.json(
      { error: (e as Error).message, needsLogin: login },
      { status: login ? 401 : 500 },
    );
  }
}
