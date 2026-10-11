import { NextResponse } from 'next/server';
import {
  alleVips, bereinige, leererPro, liesPros, oeffentlichPov, schreibePros, standardBild, wer,
} from '@/lib/pov';
import { istLive, liveSeit, zuschauerZahl } from '@/lib/povRelay';

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
    // Der Name folgt dem Konto; das Bild ist das gewaehlte - sonst das Spielerfoto des verknuepften Epic-Kontos.
    if (!alle[ident]) mein.name = ich.name;
    const eigenes = Boolean(alle[ident]?.bild);
    const standard = (await standardBild(ident)) ?? ich.bild;
    mein.bild = eigenes ? mein.bild : standard;
    return NextResponse.json({
      ok: true,
      mein: { ...mein, live: istLive(ident), liveSeit: liveSeit(ident) },
      bildEigen: eigenes,
      zuschauer: zuschauerZahl(ident),
      vips: (await alleVips()).filter((v) => !v.auch.includes(ident)),
    }, { headers: nie });
  }

  // sichtbar
  if (!ich.vip) return NextResponse.json({ ok: true, pros: [] }, { headers: nie });
  const sichtbar = Object.values(alle)
    .filter((p) => ich.rolle === 'admin' || p.erlaubt.some((e) => ich.idents.includes(e)));
  const pros = await Promise.all(sichtbar.map(async (p) => ({
    ...oeffentlichPov(p), bild: p.bild ?? (await standardBild(p.ident)),
  })));
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
  const vips = new Set((await alleVips()).flatMap((v) => v.auch));
  const neu = bereinige(alt, body.teil ?? {}, vips);
  // Der Name des Kontos gilt; das Bild ist das gewaehlte, sonst das Spielerfoto (siehe GET).
  neu.name = ich.name || neu.name;
  alle[ident] = neu;
  await schreibePros(alle);
  const wirksam = neu.bild ?? (await standardBild(ident)) ?? ich.bild;
  return NextResponse.json({
    ok: true, bildEigen: Boolean(neu.bild),
    mein: { ...neu, bild: wirksam, live: istLive(ident), liveSeit: liveSeit(ident) },
  }, { headers: nie });
}
