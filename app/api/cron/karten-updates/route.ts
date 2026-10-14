import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { sucheUndMelde } from '@/lib/kartenUpdates';

/*
 * Taeglich (Ablauf "Discord live" der GitHub-Aktion, einmal um 07 Uhr UTC): nachsehen, ob es neue Kartenversionen gibt (lib/kartenUpdates).
 * Der Betreiber (14.10.2026): "du musst automatisch neue Maps hinzufuegen, taeglich einmal - und fuer den Notfall gibt es fuer den Admin einen
 * Knopf" (der steht bei den Karten, /api/karten-updates). Geschuetzt wie die anderen Anstoesse von aussen: CRON_SECRET oder der Bot-Schluessel.
 */

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  if (!bearer || !schluessel.some((k) => gleich(bearer, k))) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const r = await sucheUndMelde();
    return NextResponse.json({ ok: true, neu: r.neu.map((u) => u.patch), geprueft: r.geprueft, neueste: r.neueste, gemeldet: r.gemeldet });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 503 });
  }
}
