import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { streamerDaten, posts, postDazu, postWeg, loginOk } from '@/lib/streamerSeite';

/*
 * Streamer-Seiten (lib/streamerSeite) - vorerst nur fuer den Admin.
 *   GET ?kanal=<login>                  -> Twitch-Daten, Stream-Plan, Clips, CompHub-Profil, Posts
 *   POST { kanal, art: post|frage, text } -> Post anlegen
 *   DELETE ?kanal=&id=                   -> Post loeschen
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403, headers: nie });
  const kanal = (new URL(request.url).searchParams.get('kanal') ?? '').trim().toLowerCase();
  if (!loginOk(kanal)) return NextResponse.json({ ok: false, error: 'Ungültiger Kanal' }, { status: 400, headers: nie });
  const [d, p] = await Promise.all([streamerDaten(kanal), posts(kanal)]);
  if (!d) return NextResponse.json({ ok: false, error: 'Kanal nicht gefunden' }, { status: 404, headers: nie });
  return NextResponse.json({ ok: true, ...d, posts: p }, { headers: nie });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false }, { status: 403, headers: nie });
  const b = await request.json().catch(() => null) as { kanal?: string; art?: string; text?: string } | null;
  const kanal = (b?.kanal ?? '').toLowerCase();
  if (!b || !loginOk(kanal) || !b.text?.trim()) return NextResponse.json({ ok: false, error: 'Text fehlt' }, { status: 400, headers: nie });
  const p = await postDazu(kanal, b.art === 'frage' ? 'frage' : 'post', b.text, 'admin');
  return NextResponse.json({ ok: true, post: p }, { headers: nie });
}

export async function DELETE(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false }, { status: 403, headers: nie });
  const p = new URL(request.url).searchParams;
  const kanal = (p.get('kanal') ?? '').toLowerCase(); const id = p.get('id') ?? '';
  if (!loginOk(kanal) || !id) return NextResponse.json({ ok: false }, { status: 400, headers: nie });
  await postWeg(kanal, id);
  return NextResponse.json({ ok: true }, { headers: nie });
}
