import { NextResponse } from 'next/server';
import { wer } from '@/lib/pov';
import { facecamSetzen, liesAblage, neueEinladung, streamerTrennen, type FacecamEcke } from '@/lib/tiktokClips';

/*
 * Die Streamer der TikTok-Clips im Admin-Bereich (/admin/tiktok, lib/tiktokClips) - nur der Admin.
 *   GET                                   -> verbundene Streamer (ohne Tokens) und offene Links
 *   POST { aktion: 'link', fuer }         -> neuer Link fuer einen Streamer (seine Freigabe)
 *   POST { aktion: 'facecam', login, ecke }
 *   POST { aktion: 'trennen', login }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ECKEN: FacecamEcke[] = ['oben-links', 'oben-rechts', 'unten-links', 'unten-rechts', 'keine'];

export async function GET() {
  if ((await wer()).rolle !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });
  const a = await liesAblage();
  return NextResponse.json({
    ok: true,
    streamer: Object.values(a.streamer).map((s) => ({ login: s.login, name: s.name, facecam: s.facecam, verbunden: s.verbunden })),
    links: Object.values(a.einladungen).filter((e) => Date.now() - e.erstellt < 14 * 864e5)
      .map((e) => ({ fuer: e.fuer, erstellt: e.erstellt, link: `https://www.thecomphub.com/api/tiktok-clips/verbinden?code=${e.code}` })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  if ((await wer()).rolle !== 'admin') return NextResponse.json({ ok: false }, { status: 403 });
  const b = await req.json().catch(() => ({})) as { aktion?: string; fuer?: string; login?: string; ecke?: string };
  if (b.aktion === 'link') {
    const e = await neueEinladung(String(b.fuer ?? ''));
    return NextResponse.json({ ok: true, link: `https://www.thecomphub.com/api/tiktok-clips/verbinden?code=${e.code}` });
  }
  if (b.aktion === 'facecam' && b.login && ECKEN.includes(b.ecke as FacecamEcke)) {
    return NextResponse.json({ ok: await facecamSetzen(b.login, b.ecke as FacecamEcke) });
  }
  if (b.aktion === 'trennen' && b.login) { await streamerTrennen(b.login); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
}
