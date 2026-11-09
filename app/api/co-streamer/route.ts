import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';

/*
 * Die offiziellen Co-Streamer je Land fuer den Live-Post (Betreiber, 9.11.2026): "THE EU SOLO FNCS HAVE OFFICIALLY STARTED - WATCH LIVE" mit dem
 * offiziellen Stream und den Co-Streamern je Land; darunter werden sie markiert, als Promotion fuer sie. Je Region eine Liste, im Tweet-Baukasten
 * bearbeitbar. Ohne Eintrag gilt, was der Betreiber am 26.10.2026 gepostet hat.
 *
 *   GET            die Listen
 *   POST {listen}  (nur Admin) speichern
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface CoStreamer { land: string; twitch: string; x?: string }
export type CoListen = Record<string, CoStreamer[]>;

const DATEI = 'co-streamer.json';
const STANDARD: CoListen = {
  EU: [{ land: 'DE', twitch: 'gripey' }, { land: 'FR', twitch: 'leothecrack' }, { land: 'GB', twitch: 'faxuty' }],
  NA: [],
};

export async function GET() {
  const listen = await liesJson<CoListen>(DATEI, STANDARD).catch(() => STANDARD);
  return NextResponse.json({ ok: true, listen: { ...STANDARD, ...listen } }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!(await istAdminAnfrage(request))) return NextResponse.json({ ok: false, error: 'Nur Admin' }, { status: 403 });
  const { listen } = await request.json().catch(() => ({})) as { listen?: CoListen };
  if (!listen || typeof listen !== 'object') return NextResponse.json({ ok: false, error: 'listen fehlt' }, { status: 400 });
  const sauber: CoListen = {};
  for (const [region, liste] of Object.entries(listen)) {
    if (!/^[A-Z]{2,6}$/.test(region) || !Array.isArray(liste)) continue;
    sauber[region] = liste
      .map((x) => ({ land: String(x.land ?? '').toUpperCase().slice(0, 2), twitch: String(x.twitch ?? '').replace(/^.*twitch\.tv\//i, '').replace(/[^\w]/g, '').slice(0, 30), x: String(x.x ?? '').replace(/^@/, '').replace(/[^\w]/g, '').slice(0, 15) || undefined }))
      .filter((x) => /^[A-Z]{2}$/.test(x.land) && x.twitch);
  }
  await schreibJson(DATEI, sauber);
  return NextResponse.json({ ok: true, listen: sauber });
}
