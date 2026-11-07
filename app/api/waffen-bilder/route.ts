import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';

/*
 * Namen und Bilder der Waffen und Gegenstaende je Kennung (scripts/waffen-bilder.mjs, aus dem Fortnite-Wiki, alle sechs Stunden erneuert) - fuer das HUD
 * der Replay-Ansicht. Eine Stunde im Browser gemerkt.
 */
export async function GET() {
  const daten = await liesJson<Record<string, { name: string; bild: string }>>('waffen-bilder.json', {}).catch(() => ({}));
  return NextResponse.json(daten, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
