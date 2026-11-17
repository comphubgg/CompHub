import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { auszaehlen, liesAwards, liesStimmen, phaseVon, schreibAwards } from '@/lib/awards';

/*
 * Die Awards fuer den Editor (/admin/awards) - nur der Admin; fuer alle anderen gibt es diese Adresse nicht (404).
 *
 *   GET  -> { awards, phase, zaehlung: { kategorie: { nominierter: n } }, waehler: Zahl der Epic-Konten mit mindestens einer Stimme }
 *   PUT  { awards } -> gesaeubert gespeichert (lib/awards saeubern)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NEIN = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };
const weg = () => NextResponse.json({ error: 'Not found' }, { status: 404, headers: NEIN });

export async function GET() {
  if (!await istAdminAnfrage()) return weg();
  try {
    const [awards, stimmen] = await Promise.all([liesAwards(), liesStimmen()]);
    const waehler = new Set(Object.values(stimmen).flatMap((k) => Object.keys(k))).size;
    return NextResponse.json({ ok: true, awards, phase: phaseVon(awards), zaehlung: auszaehlen(stimmen), waehler }, { headers: NEIN });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: NEIN });
  }
}

export async function PUT(request: Request) {
  if (!await istAdminAnfrage()) return weg();
  const roh = await request.text();
  if (roh.length > 400_000) return NextResponse.json({ ok: false, error: 'Too large.' }, { status: 413, headers: NEIN });
  let k: { awards?: unknown };
  try { k = JSON.parse(roh); } catch { return NextResponse.json({ ok: false, error: 'Not JSON.' }, { status: 400, headers: NEIN }); }
  try {
    const awards = await schreibAwards(k.awards);
    return NextResponse.json({ ok: true, awards, phase: phaseVon(awards) }, { headers: NEIN });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: NEIN });
  }
}
