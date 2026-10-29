import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { kartenAutomatik } from '@/lib/kartenAutomatik';
import type { CupGruppe } from '@/lib/epicCups';

/*
 * Alle zehn Minuten (Ablauf "Discord live" der GitHub-Aktion): Turnierkarten der grossen Finals von selbst anlegen und bis zehn Minuten nach Beginn
 * erneuern - lib/kartenAutomatik. Mit ?nachholen=1 einmalig die vergangenen Performance-Finals jeder Region nachtragen.
 * Geschuetzt wie die anderen Anstoesse von aussen: CRON_SECRET oder der Bot-Schluessel.
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  const url = new URL(request.url);
  // Katalog und Kartenbilder genau so, wie die Kartenseite sie bekommt (gleiche Titel, gleiche Inseln).
  const basis = `http://127.0.0.1:${process.env.PORT || 3100}`;
  try {
    const [katalog, bilder] = await Promise.all([
      fetch(`${basis}/api/cup-catalog?modus=alle`, { cache: 'no-store', signal: AbortSignal.timeout(90_000) }).then((r) => r.json()) as Promise<{ cups?: CupGruppe[] }>,
      fetch(`${basis}/api/karten-bild`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) }).then((r) => r.json()) as Promise<{ karten?: Array<{ id: string; titel: string }>; inseln?: Record<string, string> }>,
    ]);
    if (!katalog.cups?.length) return NextResponse.json({ ok: false, fehler: 'Katalog leer' }, { status: 503 });
    const lauf = await kartenAutomatik(katalog.cups, bilder.inseln ?? {}, bilder.karten ?? [], url.searchParams.get('nachholen') === '1');
    return NextResponse.json({ ok: true, ...lauf });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
