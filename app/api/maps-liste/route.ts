import { NextResponse } from 'next/server';
import { mapsVerzeichnis, alleSaisons, istDemo } from '@/lib/mapsVerzeichnis';
import { ueberdauernd } from '@/lib/ueberdauernd';

/*
 * Das Verzeichnis der Maps (siehe lib/mapsVerzeichnis) - fuer die Seite /tournament-maps. Kein Konto noetig.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Das letzte gute Verzeichnis sofort - auch ohne den PC daheim (lib/ueberdauernd, 29.10.2026).
    // Auch der gespeicherte Stand ohne Demos (er kann von vor dem Filter stammen).
    const roh = await ueberdauernd('maps-liste', 10 * 60_000, 7 * 864e5, () => mapsVerzeichnis());
    const eintraege = roh ? roh.filter((e) => !istDemo(e)) : roh;
    return NextResponse.json({ ok: true, eintraege, saisons: alleSaisons() }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (e) {
    // Noble antwortet nicht: das Verzeichnis ist dann nicht da - nicht als "keine Maps" ausgeben.
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
