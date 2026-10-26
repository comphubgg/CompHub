import { NextResponse } from 'next/server';
import { tiktokDaten } from '@/lib/tiktokDaten';
import { topFuenf, spielerRueckblick } from '@/lib/tiktokAnfrage';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Worum es im tägliche TikTok-Video geht (lib/tiktokDaten) - der Ablauf "TikTok-Tagesvideo" holt sich hier Cup, Fünf Erste, Namen, Flaggen und Fotos.
 * Öffentlich lesbar: es sind dieselben Zahlen, die auf den Cup-Seiten stehen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    // Eigene Videos (Betreiber, 20.10.2026): ?vorlage=top5&region=EU&liste=verdienst&jahr=2026  oder  ?vorlage=spieler&name=Shxrk&jahr=2026 - siehe lib/tiktokAnfrage.
    const p = new URL(request.url).searchParams;
    const vorlage = p.get('vorlage') ?? '';
    const jahr = Number(p.get('jahr')) || new Date().getUTCFullYear();
    if (vorlage === 'top5') return NextResponse.json(await topFuenf({ region: (p.get('region') ?? '').toUpperCase(), liste: p.get('liste') ?? 'verdienst', jahr }), { headers: { 'Cache-Control': 'no-store' } });
    if (vorlage === 'spieler') return NextResponse.json(await spielerRueckblick({ name: p.get('name') ?? '', jahr }), { headers: { 'Cache-Control': 'no-store' } });
    const ohne = (p.get('ohne') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 300);
    return zwischenspeichern(NextResponse.json(await tiktokDaten({ ohne, nur: (p.get('fenster') ?? '').trim() || undefined }), { headers: { 'Cache-Control': 'no-store' } }), 300);
  } catch (e) {
    return NextResponse.json({ keinCup: true, grund: (e as Error).message }, { status: 503 });
  }
}
