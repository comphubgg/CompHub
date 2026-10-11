import { NextResponse } from 'next/server';
import {
  alleVips, bereinige, leererPro, liesPros, meldeLive, oeffentlichPov, schreibePros, wer,
} from '@/lib/pov';

/*
 * Pro-POVs.
 *
 *   GET ?modus=sichtbar   die POVs, die der Besucher sehen darf (VIP und Admin)
 *   GET ?modus=mein       das eigene POV-Profil samt Liste der VIPs (Profi und Admin)
 *   POST { teil }         das eigene Profil aendern (Profi und Admin)
 *
 * Wer ein POV sehen darf, steht im Profil des Profis; der Server gibt einem Besucher nur die Eintraege
 * heraus, in deren Freigabe seine Kennung steht (der Admin sieht alle). Der Twitch-Kanal ist ohnehin
 * oeffentlich bei Twitch - die Freigabe regelt, wo er auf CompHub erscheint, nicht den Kanal selbst.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const modus = new URL(request.url).searchParams.get('modus') ?? 'sichtbar';
  const ich = await wer();
  const alle = await liesPros();

  if (modus === 'mein') {
    if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
      return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
    }
    const ident = ich.idents[0];
    if (!ident) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });
    const mein = alle[ident] ?? leererPro(ident, ich.name, ich.bild);
    // Name und Bild folgen dem Konto, solange der Profi nichts anderes gesetzt hat.
    if (!alle[ident]) { mein.name = ich.name; mein.bild = ich.bild; }
    return NextResponse.json({
      ok: true, mein, vips: (await alleVips()).filter((v) => v.ident !== ident),
    }, { headers: nie });
  }

  // sichtbar
  if (!ich.vip) return NextResponse.json({ ok: true, pros: [] }, { headers: nie });
  const pros = Object.values(alle)
    .filter((p) => p.twitch && (ich.rolle === 'admin' || p.erlaubt.some((e) => ich.idents.includes(e))))
    .map(oeffentlichPov);
  return NextResponse.json({ ok: true, pros }, { headers: nie });
}

export async function POST(request: Request) {
  const ich = await wer();
  if (ich.rolle !== 'pro' && ich.rolle !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Nur für Profis.' }, { status: 403, headers: nie });
  }
  const ident = ich.idents[0];
  if (!ident) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });

  let body: { teil?: Record<string, unknown> } = {};
  try { body = await request.json(); } catch { /* leerer Rumpf */ }
  const alle = await liesPros();
  const alt = alle[ident] ?? leererPro(ident, ich.name, ich.bild);
  const vips = new Set((await alleVips()).map((v) => v.ident));
  const neu = bereinige(alt, body.teil ?? {}, vips);
  // Name und Bild des Kontos gelten, solange kein eigenes Bild gesetzt ist.
  neu.name = ich.name || neu.name;
  alle[ident] = neu;
  await schreibePros(alle);
  // Gerade live gegangen: dem Discord des Profis Bescheid geben.
  if (neu.live && !alt.live) {
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'www.thecomphub.com';
    const daheim = /^(localhost|127\.0\.0\.1)/.test(host);
    await meldeLive(neu, `${daheim ? 'http' : 'https'}://${host}`);
  }
  return NextResponse.json({ ok: true, mein: neu }, { headers: nie });
}
