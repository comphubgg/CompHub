import { NextResponse } from 'next/server';
import { holeKatalog } from '@/lib/cupWertung';
import { gecacht } from '@/lib/epicCups';
import { GLOBALS_EVENT } from '@/lib/globalsCup';

/*
 * Das Preisgeld der Global Championship - Platz fuer Platz.
 *
 * Der Betreiber: "eine Price-Pool-Page, wo man sieht, welcher Platz wie viel
 * gewinnen wuerde, also einfach alle Plaetze mit ihrem Price Pool."
 *
 * Die Zahlen kommen aus Epics Turnierkatalog, der zu jedem Turnier seine
 * Auszahlungstabelle mitliefert (payoutTables). Nachgemessen am 24.9.2026:
 * 200.000 fuer Platz 1 bis 4.000 fuer die Plaetze 46 bis 50 - je Spieler.
 * Ein Duo bekommt das Doppelte; zusammen sind das die 2 Millionen Dollar
 * der Globals.
 *
 * Ab Platz 20 nennt Epic Spannen: eine Stufe steht fuer den letzten Platz
 * ihrer Spanne ("25" heisst Plaetze 21 bis 25). Hier wird das in einzelne
 * Plaetze aufgeloest.
 *
 * Antwortet Epic nicht, kommt ein Fehler - nie eine Tabelle voller Nullen.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/** Die Globals sind ein Duo-Turnier. */
const TEAMGROESSE = 2;

type Rohtabelle = Record<string, Array<{
  scoringType?: string;
  ranks?: Array<{ threshold?: number; payouts?: Array<{ rewardType?: string; quantity?: number }> }>;
}>>;

async function tabelle() {
  // Das Turnier steht in jedem Regionskatalog; EU zuerst, die anderen als
  // Rueckfall, falls einer gerade nicht antwortet.
  let letzterFehler: unknown = null;
  for (const region of ['EU', 'NAC', 'ASIA', 'BR']) {
    try {
      const k = await holeKatalog(region) as unknown as { payoutTables?: Rohtabelle };
      const gruppen = Object.entries(k.payoutTables ?? {})
        .find(([w]) => w === GLOBALS_EVENT || w.includes('MannekenPis'))?.[1];
      const g = gruppen?.find((x) => x.scoringType === 'rank');
      if (!g) continue;
      const stufen = (g.ranks ?? [])
        .filter((r) => typeof r.threshold === 'number')
        .map((r) => ({
          bis: r.threshold as number,
          betrag: (r.payouts ?? [])
            .filter((p) => p.rewardType === 'ecomm' && typeof p.quantity === 'number')
            .reduce((s, p) => s + (p.quantity ?? 0), 0),
        }))
        .filter((s) => s.betrag > 0)
        .sort((a, b) => a.bis - b.bis);
      if (stufen.length) return stufen;
    } catch (e) { letzterFehler = e; }
  }
  throw letzterFehler ?? new Error('Epic nennt fuer die Globals keine Auszahlungstabelle.');
}

export async function GET() {
  try {
    const stufen = await gecacht('globals|preisgeld', 60 * 60_000, tabelle);
    const plaetze: Array<{ platz: number; proSpieler: number; proTeam: number; spanne: [number, number] }> = [];
    let von = 1;
    for (const s of stufen) {
      for (let p = von; p <= s.bis; p += 1) {
        plaetze.push({ platz: p, proSpieler: s.betrag, proTeam: s.betrag * TEAMGROESSE, spanne: [von, s.bis] });
      }
      von = s.bis + 1;
    }
    const proSpielerSumme = plaetze.reduce((n, p) => n + p.proSpieler, 0);
    return NextResponse.json({
      waehrung: 'USD',
      teamGroesse: TEAMGROESSE,
      plaetze,
      summeProSpieler: proSpielerSumme,
      summe: proSpielerSumme * TEAMGROESSE,
      quelle: 'Epic Games (payoutTables)',
    }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
