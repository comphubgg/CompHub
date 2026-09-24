import { NextResponse } from 'next/server';
import { verlauf, epicVerlauf } from '@/lib/szeneStats';
import { verdienst } from '@/lib/preisgeld';
import { gecacht } from '@/lib/epicCups';
import { fensterName } from '@/lib/fensterName';

/*
 * Die gemeinsamen Cups eines Duos in der laufenden Saison - schnell.
 *
 * Die Duo-Ansicht unter /globals/teams holte bisher die ganze Spielerakte
 * (/api/szene-stats?spieler=...): Ranglisten ueber das Archiv, Perzentile,
 * Namen aller Mitspieler - 170 bis 190 KB je Spieler, auf einem kalten
 * Server ueber dreissig Sekunden, bei haengender Ablage noch viel laenger.
 * Der Betreiber: "die Liste mit den Cups, die die Spieler zusammen gespielt
 * haben, laden gar nicht oder halt zehn Minuten - das kann nicht sein."
 *
 * Gebraucht werden nur die Spieltage, an denen der andere als Mitspieler
 * dabeistand. Die stehen in der Akte des einen Spielers (eine Datei, siehe
 * lib/szeneStats verlauf/epicVerlauf) - mit Konto-Ids, also ohne Raten ueber
 * Namen. Preisgeld wird nur fuer die gefundenen Zeilen nachgeschlagen.
 *
 *   GET ?a=<epicId>&b=<epicId>  -> { zeilen: [...] } neueste zuerst, hoechstens 12
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const KONTO = /^[0-9a-f]{32}$/;

interface Zeile {
  windowId: string; titel: string; season: string; datum: number;
  platz: number | null; punkte: number | null; elims: number | null;
  verdienst: number | null;
}

async function gemeinsam(a: string, b: string): Promise<Zeile[]> {
  const [archiv, epic] = await Promise.all([
    verlauf(a).catch(() => []),
    epicVerlauf(a).catch(() => []),
  ]);
  const roh: Array<Zeile & { region: string; mit: string[]; name: string }> = [];
  const gesehen = new Set<string>();
  for (const z of archiv) {
    gesehen.add(z.windowId);
    roh.push({
      windowId: z.windowId, titel: z.event, season: z.season, datum: z.datum ?? 0,
      platz: z.platz ?? null, punkte: z.punkte ?? null,
      elims: typeof z.werte?.eliminations === 'number' ? z.werte.eliminations : null,
      verdienst: null, region: z.region, mit: z.mitspieler ?? [], name: z.event,
    });
  }
  for (const z of epic) {
    if (gesehen.has(z.windowId)) continue;
    const runde = fensterName(z.windowId);
    const titel = z.titel || z.event;
    roh.push({
      windowId: z.windowId, titel: runde && !titel.includes(runde) ? `${titel} · ${runde}` : titel,
      season: z.season, datum: z.datum ?? 0,
      platz: z.platz ?? null, punkte: z.punkte ?? null,
      elims: typeof (z as { replayElims?: number }).replayElims === 'number'
        ? (z as { replayElims?: number }).replayElims ?? null : null,
      verdienst: typeof z.verdienstArchiv === 'number' ? z.verdienstArchiv : null,
      region: z.region, mit: z.mitspieler ?? [], name: z.titel,
    });
  }
  if (!roh.length) return [];

  // "Diese Saison" ist die juengste, in der der Spieler ueberhaupt antrat.
  const saison = [...roh].sort((x, y) => y.datum - x.datum)[0].season;
  const treffer = roh
    .filter((z) => z.season === saison && z.mit.includes(b))
    .sort((x, y) => y.datum - x.datum)
    .slice(0, 12);

  return Promise.all(treffer.map(async (z) => ({
    windowId: z.windowId, titel: z.titel, season: z.season, datum: z.datum,
    platz: z.platz, punkte: z.punkte, elims: z.elims,
    verdienst: z.verdienst ?? (await verdienst({
      windowId: z.windowId, region: z.region, name: z.name,
      platz: z.platz, punkte: z.punkte, epicId: a,
    }).catch(() => null))?.betrag ?? null,
  })));
}

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const a = (p.get('a') ?? '').toLowerCase();
  const b = (p.get('b') ?? '').toLowerCase();
  if (!KONTO.test(a) || !KONTO.test(b)) {
    return NextResponse.json({ error: 'a und b muessen Konto-Ids sein' }, { status: 400 });
  }
  try {
    // Die Reihenfolge der beiden spielt keine Rolle - einmal gerechnet, fuer beide.
    const [x, y] = [a, b].sort();
    const zeilen = await gecacht(`globals-duo|${x}|${y}`, 30 * 60_000, async () => {
      const von = await gemeinsam(x, y);
      return von.length ? von : gemeinsam(y, x);
    });
    return NextResponse.json({ zeilen }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=86400' },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
