import { NextResponse } from 'next/server';
import { awardsSichtbar } from '@/lib/awardsZugang';

/*
 * Darf diese Anfrage /awards sehen? 200 oder 404 - fragt middleware.ts, bevor /awards gebaut wird (wie /api/finest/zugang).
 * Solange die Awards nicht oeffentlich sind (lib/awards OEFFENTLICH), nur der Admin.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KOEPFE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

export async function GET() {
  const ok = await awardsSichtbar();
  return NextResponse.json(ok ? { ok: true } : { error: 'Not found' }, { status: ok ? 200 : 404, headers: KOEPFE });
}
