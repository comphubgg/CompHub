import { NextResponse } from 'next/server';
import { holeKatalog } from '@/lib/cupWertung';
import { gecacht } from '@/lib/epicCups';
import { SOLOS_REGIONEN } from '@/lib/solosRegionen';

/*
 * Das Preisgeld der FNCS Solos - Platz fuer Platz, je Region.
 *
 * Der Betreiber (26.10.2026): "Die Prize-Pool-Seite sollte auch fuer Solo-FNCS drin sein - und im November faengt FNCS Solos Reload an, dann ist es wieder eine FNCS."
 * Wie bei den Globals (app/api/globals-preisgeld) kommen die Zahlen aus Epics Turnierkatalog: zu jedem Spieltag liegt dort seine Auszahlungstabelle
 * (payoutTables, Schluessel = Fenster-Kennung). Gesucht werden die Finals der FNCS Solos und der Solos Reload; ein Finale mit zwei Tagen zahlt nach dem zweiten
 * aus, dessen Tabelle gilt. Ab einer Stufe nennt Epic Spannen: eine Stufe steht fuer den letzten Platz ihrer Spanne (preisgeld-stufen-sind-spannen).
 *
 * Fuehrt Epic die Tabelle nicht mehr (beendete Turniere), kommt eine leere Liste mit Hinweis - nie eine Tabelle voller Nullen.
 *
 *   GET ?region=EU
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

type Rohtabelle = Record<string, Array<{
  scoringType?: string;
  ranks?: Array<{ threshold?: number; payouts?: Array<{ rewardType?: string; value?: string; quantity?: number }> }>;
}>>;

interface Platz { platz: number; proSpieler: number; proTeam: number; spanne: [number, number] }
interface Gruppe { id: string; name: string; waehrung: string; plaetze: Platz[]; summe: number; schluessel: string }

/** Die Namensfamilie eines Finales: ohne Saison, ohne Region, ohne den Tag ("S42_FNCSSolo_Final_Day2_EU" -> "FNCSSolo_Final"). */
function familie(schluessel: string): string {
  return schluessel.replace(/^S\d+_/i, '').replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i, '').replace(/_?Day\d+/i, '');
}

function anzeigeName(fam: string): string {
  const reload = /reload/i.test(fam);
  return reload ? 'FNCS Solos Reload · Finals' : 'FNCS Solos · Finals';
}

async function bauen(region: string): Promise<Gruppe[]> {
  const kat = await holeKatalog(region) as unknown as { payoutTables?: Rohtabelle };
  const alle = Object.entries(kat.payoutTables ?? {})
    // Der Katalog einer Region fuehrt auch Tabellen der Nachbarregion (NA West sieht die von NA Central) - nur die der eigenen Region zaehlen.
    .filter(([schluessel]) => schluessel.toUpperCase().endsWith('_' + region) && /FNCSSolo/i.test(schluessel) && /Final/i.test(schluessel) && !/LastChance|Heat|FastTrack/i.test(schluessel));
  // Je Familie der letzte Tag - dort wird ausgezahlt.
  const jeFamilie = new Map<string, Array<[string, Rohtabelle[string]]>>();
  for (const e of alle) (jeFamilie.get(familie(e[0])) ?? jeFamilie.set(familie(e[0]), []).get(familie(e[0]))!).push(e);
  const raus: Gruppe[] = [];
  for (const [fam, liste] of jeFamilie) {
    liste.sort((a, b) => Number(/Day(\d+)/i.exec(a[0])?.[1] ?? 0) - Number(/Day(\d+)/i.exec(b[0])?.[1] ?? 0));
    for (const [schluessel, tabellen] of [...liste].reverse()) {
      const g = tabellen.find((x) => x.scoringType === 'rank');
      if (!g) continue;
      const geld = (g.ranks ?? []).flatMap((r) => (r.payouts ?? []).filter((p) => p.rewardType === 'ecomm'));
      const waehrung = geld.find((p) => p.value)?.value ?? 'USD';
      const stufen = (g.ranks ?? [])
        .filter((r) => typeof r.threshold === 'number')
        .map((r) => ({
          bis: r.threshold as number,
          betrag: (r.payouts ?? []).filter((p) => p.rewardType === 'ecomm' && typeof p.quantity === 'number').reduce((s, p) => s + (p.quantity ?? 0), 0),
        }))
        .filter((s) => s.betrag > 0)
        .sort((a, b) => a.bis - b.bis);
      if (!stufen.length) continue;
      const plaetze: Platz[] = [];
      let von = 1;
      for (const s of stufen) {
        for (let p = von; p <= s.bis; p += 1) plaetze.push({ platz: p, proSpieler: s.betrag, proTeam: s.betrag, spanne: [von, s.bis] });
        von = s.bis + 1;
      }
      raus.push({ id: fam, name: anzeigeName(fam), waehrung, plaetze, summe: plaetze.reduce((n, p) => n + p.proTeam, 0), schluessel });
      break;
    }
  }
  return raus.sort((a, b) => a.name.localeCompare(b.name));
}

export async function GET(request: Request) {
  const region = (new URL(request.url).searchParams.get('region') ?? 'EU').toUpperCase();
  if (!(SOLOS_REGIONEN as readonly string[]).includes(region)) {
    return NextResponse.json({ ok: false, error: 'Unknown region.' }, { status: 400 });
  }
  try {
    const gruppen = await gecacht(`solos|preisgeld|${region}`, 30 * 60_000, () => bauen(region));
    // Auch eine leere Antwort ist eine Antwort: Epic fuehrt das Finale gerade nicht - das sagt die Seite, nicht ein Fehler.
    return NextResponse.json({ ok: true, region, gruppen }, { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } });
  } catch (e) {
    // Kein 5xx: der Lastverteiler macht daraus sonst eine HTML-Fehlerseite (lastverteiler-macht-aus-5xx-eine-fehlerseite).
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
