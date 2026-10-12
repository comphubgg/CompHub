import { NextResponse } from 'next/server';
import { fensterFuer } from '@/lib/globalsSolos';

/*
 * Die Karte eines Fensters, wie Noble Practice sie fuehrt: die Spieler (mit Land und Foto) und die Landepunkte.
 * Fuer die Detailseite unter /tournament-maps/karte. Kein Konto noetig.
 *
 *   GET ?t=<Turnier-Id>&r=<Region>&w=<Fenster-Kennung>
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const t = p.get('t') ?? '';
  const r = p.get('r') ?? '';
  const w = p.get('w') ?? '';
  if (!t || !r || !w) return NextResponse.json({ ok: false, error: 'Turnier, Region und Fenster fehlen.' }, { status: 400 });
  try {
    const f = await fensterFuer(t, r, w);
    if (!f) return NextResponse.json({ ok: false, error: 'Dieses Fenster gibt es nicht.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: true, ...f }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=120' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
