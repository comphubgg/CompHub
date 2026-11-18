import { NextResponse } from 'next/server';
import { dropKarte } from '@/lib/dropKarte';
import { istAdminAnfrage } from '@/lib/adminPruefung';

// Die Drop-Karte eines Spieltags mit einer einzigen Lobby - aus den eigenen Replays (lib/dropKarte).
//
//   GET ?window=<windowId>&region=EU
//
// Nur fuer den Admin (Betreiber, 18.11.2026: die Drop-Karte ist nicht freigegeben) - alle anderen bekommen 403.
// Nur lesen. Kein einzelner Lobby-Spieltag -> { einzel: false, grund }.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'Nur fuer Admins' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const { searchParams } = new URL(request.url);
  const windowId = (searchParams.get('window') ?? '').trim();
  const region = (searchParams.get('region') ?? '').trim().toUpperCase() || null;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(windowId)) return NextResponse.json({ error: 'window fehlt' }, { status: 400 });
  try {
    const d = await dropKarte(windowId, region);
    return NextResponse.json(d, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    return NextResponse.json({ einzel: false, grund: (e as Error).message, windowId }, { status: 500 });
  }
}
