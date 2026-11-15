import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Konstanz-Seite (Betreiber, 15.11.2026): je Region die konstantesten Spieler (Konstanz-Note aus scripts/spieler-kreis.mjs) und je Cup einer Serie ein Punkt,
 * wie sie dort abgeschnitten haben - ueber eine Saison.
 *
 *   ?region=EU&saison=S43&serie=fncs|cash|alle&n=30
 *
 * Quelle: spieler-kreis/_index.json (Note, Region) und spieler-kreis/<xx>.json (Zeile je Spieltag: windowId, Platz, Datum). Nichts geschaetzt: ein Punkt steht nur,
 * wo die Bestenliste den Spieler fuehrt. Oben die Besten je Region (wer die hoechste Note hat, mindestens MIN_CUPS Cups).
 */

export const runtime = 'nodejs';

interface IndexZeile { epicId: string; name: string; konstanz: number; region: string; cups: number; top500: number; top100: number; beste: number; matches: number }
interface Zeile { windowId: string; region: string; season: string; titel: string; datum: number; platz: number; punkte?: number }

const MIN_CUPS = 8;
const SERIEN: Record<string, (z: Zeile) => boolean> = {
  // Ohne die Skin-Cups mit FNCS im Namen (Champion ... FNCS Cup).
  fncs: (z) => /FNCS/i.test(z.windowId) && !/FNCSCup/i.test(z.windowId),
  cash: (z) => /CashCup/i.test(z.windowId),
  victory: (z) => /VictoryCup|PerformanceEvaluation|EliteCup/i.test(z.windowId),
  alle: () => true,
};

async function holeRoh(request: Request) {
  const p = new URL(request.url).searchParams;
  const region = (p.get('region') ?? 'EU').toUpperCase();
  const saison = (p.get('saison') ?? '').toUpperCase();
  const serie = SERIEN[p.get('serie') ?? 'fncs'] ? (p.get('serie') ?? 'fncs') : 'fncs';
  const n = Math.min(Math.max(Number(p.get('n')) || 30, 10), 50);

  const index = await liesJson<IndexZeile[]>('spieler-kreis/_index.json', []).catch(() => []);
  if (!index.length) return NextResponse.json({ error: 'Konstanz-Daten nicht erreichbar' }, { status: 503 });

  // Die Besten je Region - der Streifen oben.
  const regionen = [...new Set(index.map((x) => x.region))].filter(Boolean);
  const besteJeRegion = regionen.map((r) => index.filter((x) => x.region === r && x.cups >= MIN_CUPS).sort((a, b) => b.konstanz - a.konstanz)[0]).filter(Boolean)
    .map((x) => ({ epicId: x.epicId, name: x.name || x.epicId.slice(0, 8), region: x.region, konstanz: x.konstanz, cups: x.cups }));

  const auswahl = index.filter((x) => x.region === region && x.cups >= MIN_CUPS).sort((a, b) => b.konstanz - a.konstanz || b.top100 - a.top100).slice(0, n * 2);
  // Die Zeilen je Spieler aus den Eimern (je ersten zwei Zeichen der Kennung).
  const eimerNamen = [...new Set(auswahl.map((x) => x.epicId.slice(0, 2)))];
  const eimer = new Map(await Promise.all(eimerNamen.map(async (e) => [e, await liesJson<Record<string, Zeile[]>>(`spieler-kreis/${e}.json`, {}).catch(() => ({} as Record<string, Zeile[]>))] as const)));
  const passt = SERIEN[serie];
  const saisons = new Set<string>();
  const spieler = auswahl.map((x) => {
    const zeilen = (eimer.get(x.epicId.slice(0, 2))?.[x.epicId] ?? []).filter((z) => z.region === region && passt(z));
    for (const z of zeilen) if (z.season) saisons.add(z.season);
    return { ...x, zeilen: zeilen.filter((z) => !saison || z.season === saison) };
  });
  const gewaehlt = saison || [...saisons].sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0] || '';
  // Doppelt so viele geholt, gezeigt werden die n Konstantesten, die in dieser Serie und Saison mindestens einmal gespielt haben.
  const mitSaison = spieler.map((s) => ({ ...s, zeilen: s.zeilen.filter((z) => !gewaehlt || z.season === gewaehlt) })).filter((s) => s.zeilen.length > 0).slice(0, n);
  // Die Spalten: alle Spieltage dieser Serie, Saison und Region, in denen einer der Spieler steht - nach Datum.
  const spalten = new Map<string, { windowId: string; titel: string; datum: number }>();
  for (const s of mitSaison) for (const z of s.zeilen) if (!spalten.has(z.windowId)) spalten.set(z.windowId, { windowId: z.windowId, titel: z.titel, datum: z.datum });
  const liste = [...spalten.values()].sort((a, b) => a.datum - b.datum);

  return NextResponse.json({
    region, serie, saison: gewaehlt, saisons: [...saisons].sort((a, b) => Number(b.slice(1)) - Number(a.slice(1))),
    besteJeRegion, spalten: liste,
    spieler: mitSaison.map((s) => ({
      epicId: s.epicId, name: s.name || s.epicId.slice(0, 8), konstanz: s.konstanz, cups: s.cups, top100: s.top100, beste: s.beste,
      plaetze: Object.fromEntries(s.zeilen.map((z) => [z.windowId, z.platz])),
    })),
  });
}

export async function GET(request: Request) {
  return zwischenspeichern(await holeRoh(request), 600);
}
