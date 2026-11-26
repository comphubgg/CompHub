import { NextResponse } from 'next/server';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { tiefeAnsicht, tiefeListe } from '@/lib/tiefeStats';

/*
 * Deep Stats (Seite /deep-stats, lib/tiefeStats):
 *
 *   GET                         -> die Cups mit ihren Spieltagen, fuer die Auswahl
 *   GET ?window=W[&suche=Name]  -> ein Spieltag: Schaden je Waffe, Treffer, Third Partys, Waermebilder. liest: true heisst, es wird noch nachgelesen
 *                                  - die Seite fragt dann in ein paar Sekunden noch einmal.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const w = (p.get('window') ?? '').trim();
  try {
    if (!w) return zwischenspeichern(NextResponse.json({ cups: await tiefeListe() }, { headers: { 'Cache-Control': 'no-store' } }), 120);
    if (!/^[A-Za-z0-9_-]{3,120}$/.test(w)) return NextResponse.json({ error: 'window ungueltig' }, { status: 400 });
    const suche = (p.get('suche') ?? '').slice(0, 40);
    const a = await tiefeAnsicht(w, suche);
    const antwort = NextResponse.json(a, { headers: { 'Cache-Control': 'no-store' } });
    // Fertig gelesen: eine Minute am Rand halten (ohne Suche - die ist je Besucher verschieden).
    return a.liest || suche ? antwort : zwischenspeichern(antwort, 60);
  } catch {
    return NextResponse.json({ error: 'Die Ablage antwortet gerade nicht.' }, { status: 424 });
  }
}
