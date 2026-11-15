import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sofortLauf, sofortVermerken } from '@/lib/ergebnisSofort';

/*
 * Der Ergebnis-Post sofort nach dem Ende (lib/ergebnisSofort.ts). Gefragt vom Dienst "ergebnis" (deploy/server-compose.yml, scripts/ergebnis-sofort.mjs)
 * alle 15 Sekunden, solange ein Spieltag laeuft; der Dienst postet nach Discord (#admin-posts mit Ping, #results) und meldet dann zurueck (POST).
 * Nie automatisch nach X.
 *
 *   GET                       -> { posts: fertige, noch nicht gepostete Spieltage, beobachtet, eng }
 *   GET ?probe=<windowId>     -> der Post zu diesem Spieltag, fertig oder nicht, gepostet oder nicht (Trockenlauf; vermerkt nichts)
 *   POST { schluessel, grund, text } -> als gepostet vermerken (ergebnis-sofort.json)
 *
 * Schluessel: CRON_SECRET oder der Bot-Schluessel (wie app/api/cron/vip-ablauf).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function erlaubt(request: Request): boolean {
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  return !!bearer && schluessel.some((k) => gleich(bearer, k));
}

export async function GET(request: Request) {
  if (!erlaubt(request)) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const probe = new URL(request.url).searchParams.get('probe');
    return NextResponse.json(await sofortLauf(probe));
  } catch (e) {
    return NextResponse.json({ fehler: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!erlaubt(request)) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  const k = await request.json().catch(() => null) as { schluessel?: string; grund?: string; text?: string } | null;
  if (!k?.schluessel) return NextResponse.json({ fehler: 'schluessel fehlt' }, { status: 400 });
  await sofortVermerken(k.schluessel, k.grund ?? '', k.text);
  return NextResponse.json({ ok: true });
}
