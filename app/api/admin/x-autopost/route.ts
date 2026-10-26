import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { xBereit, xEinstellung, xEinstellungSetzen } from '@/lib/xPosten';

/*
 * Der Schalter fuer das automatische Posten auf X (nur Admin).
 *
 *   GET             -> { an, regionen, bereit }   bereit = alle vier Schluessel stehen unter /admin/services
 *   POST { an?, regionen? }  -> neuer Stand
 *
 * Voreinstellung: aus. Erst wenn der Admin ihn einschaltet, geht ein Ergebnis-Post von selbst hinaus.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Admins only' }, { status: 403, headers: nie });
  return NextResponse.json({ ok: true, ...await xEinstellung(), bereit: await xBereit() }, { headers: nie });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Admins only' }, { status: 403, headers: nie });
  const body = await request.json().catch(() => ({})) as { an?: boolean; regionen?: string[] };
  const neu = await xEinstellungSetzen({ an: body.an, regionen: body.regionen });
  return NextResponse.json({ ok: true, ...neu, bereit: await xBereit() }, { headers: nie });
}
