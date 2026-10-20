import { NextResponse } from 'next/server';
import { wegBauen, wegStandVon } from '@/lib/solosWeg';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';

/*
 * Der Weg ins Grand Final von FNCS Solos (lib/solosWeg).
 *
 *   GET /api/solos-weg?region=EU                  -> { ok, ...Plan }
 *   GET /api/solos-weg?region=EU&wo=<epicId>      -> { ok, stand, durchsucht }  (wo steht dieses Konto - kleine Listen)
 *   GET /api/solos-weg?region=EU&wo=<epicId>&tief=1  (auch Runde 1 und 2 und die Last Chance durchsuchen)
 *
 * Fehler kommen mit Status 200 und "fehler" zurueck: der Lastverteiler (cloudflare/lastverteilung.worker.js) haelt jede 5xx fuer einen Ausfall des Servers
 * und schaltet auf die Ausweichseite um - eine Antwort wie "Epic liefert gerade nichts" darf dazu nicht fuehren.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const wunsch = (p.get('region') ?? 'EU').toUpperCase();
  const region = (SOLOS_REGIONEN as readonly string[]).includes(wunsch) ? wunsch : 'EU';
  const wo = (p.get('wo') ?? '').replace(/-/g, '').toLowerCase();
  try {
    if (wo) {
      if (!/^[0-9a-f]{32}$/.test(wo)) return NextResponse.json({ ok: false, fehler: 'Das ist keine Epic-Konto-Id.' }, { headers: { 'Cache-Control': 'no-store' } });
      const r = await wegStandVon(region, wo, p.get('tief') === '1');
      return NextResponse.json({ ok: true, ...r }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    const plan = await wegBauen(region);
    if (!plan) return NextResponse.json({ ok: false, fehler: 'FNCS Solos läuft in dieser Region gerade nicht.' }, { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json({ ok: true, ...plan }, { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' } });
  } catch (e) {
    return NextResponse.json({ ok: false, fehler: `Epic liefert gerade nichts (${(e as Error).message}).` }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
