import { NextResponse } from 'next/server';
import { GET as bestenliste } from '../cup-leaderboard/route';
import { spielerKontext } from '@/lib/globalsSolos';
import { GLOBALS_EVENT } from '@/lib/globalsCup';

/*
 * Der Endstand der Global Championship: die ersten Plaetze nach beiden Tagen zusammen - mit den Namen, wie das Werkzeug
 * sie kennt (ohne Turnierkuerzel und Orgtag), samt Land. Die Rechnung selbst macht die Bestenliste (window=gesamt).
 *
 * Antwortet Epic nicht, kommt ein Fehler - keine leere Liste, die wie ein Ergebnis aussaehe.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Eintrag { rank: number; points: number; elims: number; wins: number; players: Array<{ id: string; name?: string }> }

let merker: { bis: number; antwort: unknown } | null = null;

export async function GET() {
  if (merker && merker.bis > Date.now()) return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  try {
    const r = await bestenliste(new Request(`http://localhost/api/cup-leaderboard?event=${GLOBALS_EVENT}&window=gesamt&limit=20`));
    const j = await r.json() as { entries?: Eintrag[] };
    if (!r.ok || !Array.isArray(j.entries) || !j.entries.length) throw new Error('Epic liefert den Endstand gerade nicht.');
    const kontext = await spielerKontext();
    const teams = j.entries.slice(0, 10).map((e) => ({
      rang: e.rank, punkte: e.points, elims: e.elims, siege: e.wins,
      spieler: e.players.map((p) => {
        const k = kontext(p.id, (p.name ?? '').replace(/^\[[^\]]*\]\s*/, ''));
        return { id: p.id, anzeige: k.anzeige, land: k.land, bild: k.bild };
      }),
    }));
    const antwort = { ok: true, teams };
    merker = { bis: Date.now() + 10 * 60_000, antwort };
    return NextResponse.json(antwort, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
