import { NextResponse } from 'next/server';
import { ichDarfFinest, FINEST_KOEPFE } from '@/lib/finestZugang';

/*
 * May the signed-in person open the private Finest Creative pages? 200 or 404
 * - asked by middleware.ts before /overlays/finest is rendered.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const ok = (await ichDarfFinest()).length > 0;
  return NextResponse.json(ok ? { ok: true } : { error: 'Not found' }, { status: ok ? 200 : 404, headers: FINEST_KOEPFE });
}
