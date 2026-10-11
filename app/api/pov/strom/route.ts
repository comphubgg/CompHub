import { NextResponse } from 'next/server';
import { pruefeZuschauer } from '@/lib/povZugang';
import { stromDa, stromOeffnen, warteAufProfi } from '@/lib/povRelay';

/*
 * Der Strom eines Pro-POVs fuer einen Zuschauer (siehe lib/povRelay.ts).
 *
 *   GET ?pro=<Kennung>[&z=<Zuschauerkennung>][&s=<Link-Schluessel>]
 *     200  eine offene Antwort: erst das Init-Segment, dann die MP4-Fragmente, sobald sie da sind.
 *          Sie endet, wenn der Profi aufhoert - der Zuschauer sieht dann sofort "offline".
 *          Kopf X-Pov-Mime = Aufnahmeart fuer den Medienpuffer.
 *     204  der Profi sendet nicht (X-Pov-Live: 0) oder nach dem alten Weg (X-Pov-Mode: segmente).
 *
 * Die Anfrage wartet bis zu acht Sekunden, ob der Profi anfaengt - so geht es ohne Abfrage im Sekundentakt los.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 3600;

const nie = { 'Cache-Control': 'no-store, no-transform' };
const SICHTBAR = 'X-Pov-Mime, X-Pov-Mode, X-Pov-Live';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const proIdent = (p.get('pro') ?? '').slice(0, 120);
  if (!proIdent) return NextResponse.json({ ok: false, error: 'Kein POV gewählt.' }, { status: 400, headers: nie });

  const pruefung = await pruefeZuschauer(request, proIdent);
  if (!pruefung.ok) return NextResponse.json({ ok: false, error: pruefung.error }, { status: pruefung.status, headers: nie });

  const art = await warteAufProfi(proIdent, 8_000);
  if (art === 'strom') {
    const zuschauer = (p.get('z') ?? pruefung.z.idents[0]).slice(0, 60);
    const strom = stromOeffnen(proIdent, zuschauer);
    if (strom) {
      // Die Aufnahmeart steht im Kopf; die Anfrage kennt sie nur ueber die Sitzung.
      const mime = stromDa(proIdent)?.mime ?? 'video/mp4';
      return new Response(strom, {
        status: 200,
        headers: {
          ...nie, 'Content-Type': 'video/mp4', 'X-Pov-Mime': mime, 'X-Pov-Mode': 'strom', 'X-Pov-Live': '1',
          'X-Accel-Buffering': 'no', 'Access-Control-Expose-Headers': SICHTBAR,
        },
      });
    }
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...nie, 'X-Pov-Live': art ? '1' : '0', 'X-Pov-Mode': art === 'stuecke' ? 'segmente' : 'aus',
      'Access-Control-Expose-Headers': SICHTBAR,
    },
  });
}
