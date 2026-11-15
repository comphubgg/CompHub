import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { vipAblaufLauf, proPanel } from '@/lib/discord';

/** Zeitkonstant vergleichen. */
function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/*
 * Alle zehn Minuten (vorher taeglich): Zugaenge loeschen, deren im VIP-Panel gesetzte Frist abgelaufen
 * ist. Der Betreiber (24.9.2026): "wenn diese Zeit abgelaufen ist, wird der
 * Account geloescht, ganz einfach."
 *
 * Aufgerufen von Vercel (vercel.json, "crons"). Ist CRON_SECRET gesetzt,
 * schickt Vercel ihn mit; sonst genuegt die Kennung von Vercels Zeitplaner.
 * Mehr als abgelaufene Fristen loeschen kann dieser Weg ohnehin nicht.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  /*
   * Wie die anderen Zeitplan-Wege (app/api/cron/news): CRON_SECRET oder - wo es fehlt - der Bot-Schluessel. Vorher galt hier nur CRON_SECRET,
   * und ohne ihn nur Vercels Kennung; der Aufruf alle zehn Minuten aus .github/workflows/discord-live.yml schickt aber den Bot-Schluessel,
   * wenn CRON_SECRET nicht in ENV_LOCAL steht - dann kam 401 zurueck und nichts lief ab.
   */
  const bearer = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const schluessel = [process.env.CRON_SECRET, process.env.DISCORD_BOT_TOKEN].map((x) => (x ?? '').trim()).filter(Boolean);
  const erlaubt = (bearer && schluessel.some((k) => gleich(bearer, k)))
    || (!process.env.CRON_SECRET && (request.headers.get('user-agent') ?? '').includes('vercel-cron'));
  if (!erlaubt) return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 401 });
  try {
    const lauf = await vipAblaufLauf();
    // Dazu die Tafel der Pro-Konten in #pro-accounts (lib/discord proPanel) - legt den Kanal beim ersten Mal an, danach nur die Liste neu.
    const pros = await proPanel().catch(() => ({ ok: false }));
    return NextResponse.json({ ok: true, ...lauf, proPanel: pros.ok });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: (e as Error).message }, { status: 424 });
  }
}
