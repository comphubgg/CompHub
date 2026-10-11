import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';
import { mitgliederSuchen } from '@/lib/povDiscord';

/*
 * Mitglieder des CompHub-Discord-Servers suchen - damit ein Profi sein Discord-Konto zuweisen kann.
 *
 *   GET ?q=<Name>   hoechstens zehn Treffer { id, name, anzeige }
 *
 * Nur fuer Profis und den Admin; mindestens drei Zeichen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length < 3) return NextResponse.json({ ok: true, treffer: [] }, { headers: nie });
  try {
    return NextResponse.json({ ok: true, treffer: await mitgliederSuchen(q) }, { headers: nie });
  } catch {
    return NextResponse.json({ ok: false, error: 'Discord antwortet nicht.' }, { status: 502, headers: nie });
  }
}
