import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { liesZonenFrei, setzeZonenFrei } from '@/lib/zonenFreigabe';

/*
 * Die Freigabe der Zonen-Uebersicht fuer VIPs (lib/zonenFreigabe).
 *
 *   GET            -> { frei: [eventId, ...] }
 *   POST { eventId, frei: true|false } -> nur der Admin
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json({ frei: await liesZonenFrei() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Antwortet die Ablage nicht, darf das nicht wie "nichts freigegeben" aussehen.
    return NextResponse.json({ error: 'Storage is not answering right now.' }, { status: 424 });
  }
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ error: 'Only the admin.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as { eventId?: string; frei?: boolean };
  const eventId = String(k.eventId ?? '').trim();
  if (!/^[\w.-]{3,160}$/.test(eventId)) return NextResponse.json({ error: 'eventId is required.' }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, frei: await setzeZonenFrei(eventId, k.frei !== false) });
  } catch {
    return NextResponse.json({ error: 'Storage is not answering right now - nothing was changed.' }, { status: 424 });
  }
}
