import { NextResponse } from 'next/server';
import { dropMapFuer } from '@/lib/postKarte';

/*
 * Die Drop Map eines Spieltags fuer den Tweet-Baukasten (Betreiber, 9.11.2026): Titel, Region und die Spieler auf der Karte (mit Konto-ID, fuer die
 * Key Players). Das Bild selbst kommt von /api/post-bild?dropmap=<windowId>.
 *
 *   GET ?w=<windowId>
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const w = new URL(request.url).searchParams.get('w') ?? '';
  if (!w) return NextResponse.json({ ok: false, error: 'w fehlt' }, { status: 400 });
  try {
    const dm = await dropMapFuer(w);
    if (!dm) return NextResponse.json({ ok: false, error: 'Für diesen Spieltag kennt Noble noch keine Landepunkte.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: true, titel: dm.titel, region: dm.region, spots: dm.zonen.length, spieler: dm.spieler, link: dm.link }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
