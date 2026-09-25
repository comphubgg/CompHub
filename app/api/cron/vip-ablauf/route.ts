import { NextResponse } from 'next/server';
import { abgelaufeneVipsLoeschen } from '@/lib/discord';

/*
 * Taeglich: Zugaenge loeschen, deren im VIP-Panel gesetzte Frist abgelaufen
 * ist. Der Betreiber (24.9.2026): "wenn diese Zeit abgelaufen ist, wird der
 * Account geloescht, ganz einfach."
 *
 * Aufgerufen von Vercel (vercel.json, "crons"). Ist CRON_SECRET gesetzt,
 * schickt Vercel ihn mit; sonst genuegt die Kennung von Vercels Zeitplaner.
 * Mehr als abgelaufene Fristen loeschen kann dieser Weg ohnehin nicht.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const geheim = process.env.CRON_SECRET;
  const erlaubt = geheim
    ? request.headers.get('authorization') === `Bearer ${geheim}`
    : (request.headers.get('user-agent') ?? '').includes('vercel-cron');
  if (!erlaubt) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const weg = await abgelaufeneVipsLoeschen();
    return NextResponse.json({ ok: true, geloescht: weg });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
