import { NextResponse } from 'next/server';
import { liveUebersicht } from '@/lib/liveFenster';
import { stromStand } from '@/lib/liveStrom';

/*
 * Was die Live-Stroeme gerade tun (lib/liveFenster, lib/liveStrom): offene Stroeme, laufende Spieltage, Epic-Anfragen je Sekunde.
 * Keine Namen, keine Match-IDs - nur Zahlen, zum Nachpruefen der Last.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const m = process.memoryUsage();
  return NextResponse.json({
    stroeme: stromStand(), live: liveUebersicht(),
    speicherMb: { rss: Math.round(m.rss / 1048576), heap: Math.round(m.heapUsed / 1048576) },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
