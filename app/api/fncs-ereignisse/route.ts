import { NextResponse } from 'next/server';
import { fncsEreignisse } from '@/lib/fncsEreignisse';
import { CDN_FRIST } from '@/lib/antwortSpeicher';

/*
 * Die Endspiele der FNCS fuer die FNCS-Seite (siehe lib/fncsEreignisse): ein Eintrag je Event mit Vorschaubild, Datum, LAN-Vermerk
 * und den ersten drei Plaetzen samt Flaggen. Kein Konto noetig.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  try {
    const ereignisse = await fncsEreignisse();
    return NextResponse.json({ ok: true, ereignisse }, { headers: { 'Cache-Control': CDN_FRIST } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
