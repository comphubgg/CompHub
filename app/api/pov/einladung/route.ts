import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId, sitzungFuer, SITZUNG_TAGE } from '@/lib/konten';
import { altesHostCookieWeg, sitzungsDomain } from '@/lib/cookieDomain';
import { ueberHttps } from '@/lib/vipCookie';
import { einladungNach, gueltig, oeffnen } from '@/lib/povVip';

/*
 * Eine Pro-Einladung eines VIPs (lib/povVip).
 *
 *   GET  ?code=...     wer einlaedt, ob der Link etwas oeffnet - und ob gerade jemand anderes angemeldet ist (dann fragt die Seite erst)
 *   POST { code }      den Link oeffnen: beim ersten Mal das Pro-Konto anlegen, danach immer dasselbe - und damit anmelden
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };
const COOKIE = 'streamer_dashboard_konto';

export async function GET(request: Request) {
  const e = await einladungNach(new URL(request.url).searchParams.get('code') ?? '');
  if (!e) return NextResponse.json({ ok: false, error: 'Diese Einladung gibt es nicht.' }, { status: 404, headers: nie });
  const jetzt = kontoAus((await cookies()).get(COOKIE)?.value);
  const angemeldet = jetzt ? await nachId(jetzt) : null;
  return NextResponse.json({
    ok: true, vipName: e.vipName, gilt: gueltig(e), gesperrt: Boolean(e.gesperrt),
    // Schon in genau diesem Konto: gleich weiter. In einem anderen: die Seite fragt, bevor sie abmeldet.
    schonDrin: Boolean(angemeldet && e.konto && angemeldet.id === e.konto.id),
    anderesKonto: angemeldet && !(e.konto && angemeldet.id === e.konto.id) ? angemeldet.name : null,
  }, { headers: nie });
}

export async function POST(request: Request) {
  const k = await request.json().catch(() => ({})) as { code?: string };
  const r = await oeffnen(String(k.code ?? ''));
  if (!r.ok) return NextResponse.json({ ok: false, fehler: r.fehler }, { status: 409, headers: nie });
  const antwort = NextResponse.json({ ok: true, neu: r.neu }, { headers: nie });
  // Dieselbe Sitzung wie bei der gewoehnlichen Anmeldung (app/api/konto).
  altesHostCookieWeg(antwort, request, COOKIE);
  antwort.cookies.set(COOKIE, sitzungFuer(r.kontoId), {
    ...sitzungsDomain(request), httpOnly: true, sameSite: 'lax', secure: ueberHttps(request), path: '/', maxAge: SITZUNG_TAGE * 24 * 3600,
  });
  return antwort;
}
