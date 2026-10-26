import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { willkommenKanalFuellen, willkommenLauf } from '@/lib/discord';

/*
 * Alle zehn Minuten (Ablauf "Discord live"): wer neu auf den Discord-Server gekommen ist, bekommt die Willkommensnachricht privat, und #admin-joins meldet den Beitritt
 * (lib/discord willkommenLauf). Mit ?kanal=1 wird stattdessen der Willkommenstext in #welcome gestellt, falls dort noch nichts steht. Geschuetzt wie die anderen Anstoesse
 * von aussen: CRON_SECRET oder der Bot-Schluessel. Antwortet immer mit 200 - ein fehlender Intent ist eine Auskunft, kein Ausfall der Seite.
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  // Zum Ausprobieren (COMPHUB_NUR_LESEN=1): nichts nach Discord schicken.
  if (process.env.COMPHUB_NUR_LESEN === '1') return NextResponse.json({ ok: true, probe: true });
  try {
    if (new URL(request.url).searchParams.get('kanal') === '1') return NextResponse.json(await willkommenKanalFuellen());
    return NextResponse.json(await willkommenLauf());
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message });
  }
}
