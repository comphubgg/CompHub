import { NextResponse } from 'next/server';
import { liesPros, meldeLive, wer } from '@/lib/pov';
import { STUECK_MAX, beende, legeAb, markiereGemeldet } from '@/lib/povRelay';

/*
 * Der Profi schickt ein Stueck seines Bildes (siehe lib/povRelay.ts).
 *
 *   POST  Rumpf = die Bytes des Stuecks, Kopf "X-Pov-Mime" = Aufnahmeart   -> { ok, seq, zuschauer }
 *   DELETE                                                                  Teilen beendet
 *
 * Nur ein Profi (oder der Admin) - und nur fuer sich selbst: die Kennung kommt aus der Anmeldung.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const nie = { 'Cache-Control': 'no-store' };
const MIME = /^video\/(mp4|webm)(;\s*codecs=[\w.,"' -]+)?$/i;

export async function POST(request: Request) {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const ident = ich.idents[0];
  if (!ident) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });

  const mime = (request.headers.get('x-pov-mime') ?? '').trim();
  if (!MIME.test(mime)) return NextResponse.json({ ok: false, error: 'Unbekannte Aufnahmeart.' }, { status: 400, headers: nie });

  const laenge = Number(request.headers.get('content-length') ?? 0);
  if (laenge > STUECK_MAX) return NextResponse.json({ ok: false, error: 'Stück zu groß.' }, { status: 413, headers: nie });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > STUECK_MAX) {
    return NextResponse.json({ ok: false, error: 'Leeres oder zu großes Stück.' }, { status: 400, headers: nie });
  }

  const r = legeAb(ident, mime, bytes);
  if (r.neuBeginn) {
    // Gerade angefangen: dem Discord des Profis Bescheid geben (einmal je Beginn).
    markiereGemeldet(ident);
    try {
      const pro = (await liesPros())[ident];
      if (pro?.webhook) {
        const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
        const daheim = /^(localhost|127\.0\.0\.1)/.test(host);
        void meldeLive({ ...pro, name: pro.name || ich.name }, `${daheim ? 'http' : 'https'}://${host}`);
      }
    } catch { /* die Meldung ist ein Zusatz */ }
  }
  return NextResponse.json({ ok: true, seq: r.seq, zuschauer: r.zuschauer }, { headers: nie });
}

export async function DELETE() {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const ident = ich.idents[0];
  if (ident) beende(ident);
  return NextResponse.json({ ok: true }, { headers: nie });
}
