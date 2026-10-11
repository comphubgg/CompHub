import { NextResponse } from 'next/server';
import { epicIdVon, liesPros, standardBild } from '@/lib/pov';
import { ADMIN_LINK, holeNach, istLive, schluesselFuer } from '@/lib/povRelay';
import { pruefeZuschauer } from '@/lib/povZugang';

/*
 * Ein Zuschauer holt das naechste Stueck eines POVs (siehe lib/povRelay.ts).
 *
 *   GET ?pro=<Kennung>&nach=<Nummer>&z=<Zuschauerkennung>[&s=<Schluessel>]
 *     200  Rumpf = das Stueck, Koepfe X-Pov-Seq und X-Pov-Mime
 *     204  nichts Neues (nach etwa 20 Sekunden) - Kopf X-Pov-Live: 1 oder 0, dann erneut fragen
 *     403  nicht freigegeben
 *
 * Wer zusehen darf: der Profi selbst, der Admin und jeder, den der Profi freigegeben hat - angemeldet
 * (Cookie) oder mit einem Link-Schluessel (fuer OBS, siehe /api/pov/link).
 *
 *   GET ?aktion=link&pro=<Kennung>   gibt dem angemeldeten Zuschauer seinen Link-Schluessel
 *   GET ?aktion=info&pro=<Kennung>   Name, Bild und Banner-Einstellung des Profis
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const proIdent = (p.get('pro') ?? '').slice(0, 120);
  if (!proIdent) return NextResponse.json({ ok: false, error: 'Kein POV gewählt.' }, { status: 400, headers: nie });

  // Wer fragt: ueber den Link-Schluessel oder die Anmeldung - und darf er das?
  const pruefung = await pruefeZuschauer(request, proIdent);
  if (!pruefung.ok) return NextResponse.json({ ok: false, error: pruefung.error }, { status: pruefung.status, headers: nie });
  const { idents, rolle } = pruefung.z;

  if (p.get('aktion') === 'link') {
    // Ein Link braucht eine feste Zuschauerkennung: die eigene, nicht die des Admins ueber alles.
    const ich = rolle === 'admin' ? ADMIN_LINK : idents[0];
    return NextResponse.json({ ok: true, schluessel: schluesselFuer(proIdent, ich) }, { headers: nie });
  }

  if (p.get('aktion') === 'info') {
    const pro = (await liesPros())[proIdent];
    if (!pro) return NextResponse.json({ ok: false, error: 'Unbekannt.' }, { status: 404, headers: nie });
    return NextResponse.json({
      ok: true, info: {
        name: pro.name, bild: pro.bild ?? await standardBild(proIdent), hud: pro.hud,
        stats: Boolean(await epicIdVon(proIdent)),
      },
    }, { headers: nie });
  }

  const nach = Math.max(0, Number(p.get('nach') ?? 0) || 0);
  const zuschauer = (p.get('z') ?? idents[0]).slice(0, 60);
  const antwort = await holeNach(proIdent, nach, zuschauer, 20_000);
  if ('stueck' in antwort) {
    return new Response(new Uint8Array(antwort.stueck.bytes), {
      status: 200,
      headers: {
        'Content-Type': antwort.mime.split(';')[0],
        'X-Pov-Seq': String(antwort.stueck.seq),
        'X-Pov-Mime': antwort.mime,
        'X-Pov-Live': '1',
        'Cache-Control': 'no-store',
        'Access-Control-Expose-Headers': 'X-Pov-Seq, X-Pov-Mime, X-Pov-Live',
      },
    });
  }
  return new Response(null, {
    status: 204,
    headers: { 'X-Pov-Live': istLive(proIdent) ? '1' : '0', 'Cache-Control': 'no-store', 'Access-Control-Expose-Headers': 'X-Pov-Live' },
  });
}
