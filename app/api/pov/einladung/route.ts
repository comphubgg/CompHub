import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus } from '@/lib/konten';
import { annehmen, einladungNach, gueltig } from '@/lib/povVip';

/*
 * Eine Pro-Einladung eines VIPs (lib/povVip).
 *
 *   GET  ?code=...     wer einlaedt und ob die Einladung noch gilt
 *   POST { code }      annehmen - mit dem angemeldeten Konto: es wird Pro, der VIP darf zusehen
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const e = await einladungNach(new URL(request.url).searchParams.get('code') ?? '');
  if (!e) return NextResponse.json({ ok: false, error: 'Diese Einladung gibt es nicht.' }, { status: 404, headers: nie });
  return NextResponse.json({
    ok: true, vipName: e.vipName, name: e.name, gilt: gueltig(e), angenommen: Boolean(e.angenommen),
  }, { headers: nie });
}

export async function POST(request: Request) {
  const k = await request.json().catch(() => ({})) as { code?: string };
  const kontoId = kontoAus((await cookies()).get('streamer_dashboard_konto')?.value);
  if (!kontoId) return NextResponse.json({ ok: false, error: 'Erst anmelden.' }, { status: 401, headers: nie });
  const r = await annehmen(String(k.code ?? ''), kontoId);
  return NextResponse.json(r, { status: r.ok ? 200 : 409, headers: nie });
}
