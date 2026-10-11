import { NextResponse } from 'next/server';
import { liesPros, standardBild, wer } from '@/lib/pov';
import { ADMIN_LINK, holeNach, istLive, schluesselFuer, schluesselLesen } from '@/lib/povRelay';

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

async function darfZusehen(proIdent: string, idents: string[], rolle: string | null): Promise<boolean> {
  if (rolle === 'admin' || idents.includes(ADMIN_LINK)) return true;
  if (idents.includes(proIdent)) return true;
  const pro = (await liesPros())[proIdent];
  return !!pro && pro.erlaubt.some((e) => idents.includes(e));
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const proIdent = (p.get('pro') ?? '').slice(0, 120);
  if (!proIdent) return NextResponse.json({ ok: false, error: 'Kein POV gewählt.' }, { status: 400, headers: nie });

  // Wer fragt: ueber den Link-Schluessel oder die Anmeldung.
  let idents: string[] = [];
  let rolle: string | null = null;
  const schluessel = p.get('s');
  if (schluessel) {
    const k = schluesselLesen(schluessel);
    if (!k || k.profi !== proIdent) return NextResponse.json({ ok: false, error: 'Link ungültig.' }, { status: 403, headers: nie });
    idents = [k.zuschauer];
  } else {
    const ich = await wer();
    idents = ich.idents; rolle = ich.rolle;
  }
  if (!idents.length) return NextResponse.json({ ok: false, error: 'Nicht angemeldet.' }, { status: 401, headers: nie });
  if (!await darfZusehen(proIdent, idents, rolle)) {
    return NextResponse.json({ ok: false, error: 'Nicht freigegeben.' }, { status: 403, headers: nie });
  }

  if (p.get('aktion') === 'link') {
    // Ein Link braucht eine feste Zuschauerkennung: die eigene, nicht die des Admins ueber alles.
    const ich = rolle === 'admin' ? ADMIN_LINK : idents[0];
    return NextResponse.json({ ok: true, schluessel: schluesselFuer(proIdent, ich) }, { headers: nie });
  }

  if (p.get('aktion') === 'info') {
    const pro = (await liesPros())[proIdent];
    if (!pro) return NextResponse.json({ ok: false, error: 'Unbekannt.' }, { status: 404, headers: nie });
    return NextResponse.json({
      ok: true, info: { name: pro.name, bild: pro.bild ?? await standardBild(proIdent), hud: pro.hud },
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
