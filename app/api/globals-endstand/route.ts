import { NextResponse } from 'next/server';
import { GET as bestenliste } from '../cup-leaderboard/route';
import { GLOBALS_EVENT, GLOBALS_TAGE } from '@/lib/globalsCup';
import { globalsTeams } from '@/lib/globalsTeams';

/*
 * Der Endstand der Global Championship: die ersten Plaetze nach beiden Tagen zusammen - mit den Namen, wie das Werkzeug
 * sie kennt (ohne Turnierkuerzel und Orgtag), samt Land. Die Rechnung selbst macht die Bestenliste (window=gesamt).
 *
 * Antwortet Epic nicht, kommt ein Fehler - keine leere Liste, die wie ein Ergebnis aussaehe.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface Eintrag { rank: number; points: number; elims: number; wins: number; games: number; players: Array<{ id: string; name?: string }> }

let merker: { bis: number; antwort: unknown } | null = null;

export async function GET() {
  if (merker && merker.bis > Date.now()) return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  try {
    const r = await bestenliste(new Request(`http://localhost/api/cup-leaderboard?event=${GLOBALS_EVENT}&window=gesamt&limit=100`));
    const j = await r.json() as { entries?: Eintrag[] };
    if (!r.ok || !Array.isArray(j.entries) || !j.entries.length) throw new Error('Epic liefert den Endstand gerade nicht.');
    // Epic legt fuers LAN eigene Konten an ("[FNCSGC26] HavoK SwizzY") - das Feld ordnet sie dem echten Spieler zu (lib/globalsTeams).
    const feld = await globalsTeams(GLOBALS_TAGE[0].windowId);
    const nachId = new Map(feld.teams.flatMap((t) => t.spieler.map((s) => [s.turnierId, s] as const)));
    // Der ganze Endstand, nicht nur die ersten zehn (Betreiber, 14.10.2026: "du musst ueberall ein volles Leaderboard haben").
    const teams = j.entries.map((e) => ({
      rang: e.rank, punkte: e.points, elims: e.elims, siege: e.wins, spiele: e.games,
      spieler: e.players.map((p) => {
        const f = nachId.get(p.id);
        const roh = (p.name ?? '').replace(/\[[^\]]*\]\s*/g, '').trim();
        return { id: p.id, anzeige: f?.anzeige || roh, land: f?.land ?? null, bild: f?.bild ?? null };
      }),
    }));
    const antwort = { ok: true, teams };
    merker = { bis: Date.now() + 10 * 60_000, antwort };
    return NextResponse.json(antwort, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424, headers: { 'Cache-Control': 'no-store' } });
  }
}
