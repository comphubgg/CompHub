import { NextResponse } from 'next/server';
import { mapsVerzeichnis } from '@/lib/mapsVerzeichnis';

/*
 * Das Verzeichnis der Maps (siehe lib/mapsVerzeichnis) - fuer die Seite /tournament-maps. Kein Konto noetig.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const eintraege = await mapsVerzeichnis();
    return NextResponse.json({ ok: true, eintraege }, {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
    });
  } catch (e) {
    // Noble antwortet nicht: das Verzeichnis ist dann nicht da - nicht als "keine Maps" ausgeben.
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
