import { NextResponse } from 'next/server';
import { tiktokDaten } from '@/lib/tiktokDaten';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Worum es im tägliche TikTok-Video geht (lib/tiktokDaten) - der Ablauf "TikTok-Tagesvideo" holt sich hier Cup, Fünf Erste, Namen, Flaggen und Fotos.
 * Öffentlich lesbar: es sind dieselben Zahlen, die auf den Cup-Seiten stehen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET() {
  try {
    return zwischenspeichern(NextResponse.json(await tiktokDaten(), { headers: { 'Cache-Control': 'no-store' } }), 300);
  } catch (e) {
    return NextResponse.json({ keinCup: true, grund: (e as Error).message }, { status: 503 });
  }
}
