import { NextResponse } from 'next/server';
import { dropKarte } from '@/lib/dropKarte';

// Die Drop-Karte eines Spieltags mit einer einzigen Lobby - aus den eigenen Replays (lib/dropKarte).
//
//   GET ?window=<windowId>&region=EU
//
// Nur lesen. Kein einzelner Lobby-Spieltag -> { einzel: false, grund }.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const windowId = (searchParams.get('window') ?? '').trim();
  const region = (searchParams.get('region') ?? '').trim().toUpperCase() || null;
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(windowId)) return NextResponse.json({ error: 'window fehlt' }, { status: 400 });
  try {
    const d = await dropKarte(windowId, region);
    return NextResponse.json(d, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (e) {
    return NextResponse.json({ einzel: false, grund: (e as Error).message, windowId }, { status: 500 });
  }
}
