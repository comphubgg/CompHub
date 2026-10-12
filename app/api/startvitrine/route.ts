import { NextResponse } from 'next/server';
import { abgelegteAntwort, ohneDateien, CDN_FRIST } from '@/lib/antwortSpeicher';
import { cupNameAusKennung, rundenName } from '@/lib/rundenName';
import { mapsVerzeichnis, type MapEintrag, type MapTyp } from '@/lib/mapsVerzeichnis';
import { gecacht, holeTop } from '@/lib/epicCups';
import { liesJson } from '@/lib/ablage';
import { saisonName } from '@/lib/szeneStats';
import { GET as prLesen } from '../power-rankings/route';

/*
 * Die Schaukaesten der Startseite - ein paar Kilobyte statt der ganzen Startansicht.
 *
 * Der Betreiber (12.10.2026): auf der Startseite drei Spalten, "Statistics, Maps, More", mit Karten, die von allein
 * rotieren: Spieler, Turniere, Global. Die Zahlen dafuer stehen schon in der vorgerechneten Startansicht der
 * Statistik (eine gute Million Zeichen); hier werden nur die Stuecke herausgenommen, die die Startseite braucht.
 * Nichts wird neu gerechnet, nichts erfunden: fehlt die Startansicht, ist die Antwort leer und die Startseite
 * zeigt die Karten einfach nicht.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface Zeile {
  epicId: string; anzeige?: string; name: string; land?: string | null; heimat?: string;
  bild?: string | null; elims?: number; damage?: number; quote?: number; matches?: number;
}
interface Kachel {
  turnier: { region: string; name: string; windowId?: string; datum: number | null; spieler: number; matches: number; bild: string | null };
  spitze?: Zeile | null;
}
interface Start {
  saison?: string;
  profile?: Array<{ region: string; spieler: Zeile[] }>;
  kacheln?: Kachel[];
  grundlage?: { spieltage?: unknown[] };
}

let merker: { bis: number; antwort: unknown } | null = null;

async function startHolen(request: Request): Promise<Start | null> {
  try {
    const fertig = await abgelegteAntwort<Start>('szene|ansicht=start');
    if (fertig) return fertig;
  } catch { /* Ablage nicht erreichbar - unten ggf. selbst holen */ }
  // Mit eigenen Dateien (Entwicklung) gibt es die abgelegte Antwort nicht - dann die Route selbst fragen.
  if (!ohneDateien()) {
    try {
      const r = await fetch(new URL('/api/szene-stats?ansicht=start', request.url), { signal: AbortSignal.timeout(60_000) });
      if (r.ok) return await r.json() as Start;
    } catch { /* leer */ }
  }
  return null;
}

const schlank = (z: Zeile) => ({
  id: z.epicId, name: z.anzeige || z.name, land: z.land ?? null, region: z.heimat ?? '', bild: z.bild ?? null,
  elims: z.elims ?? 0, schaden: z.damage ?? 0, quote: z.quote ?? 0, matches: z.matches ?? 0,
});

const ENGLISCH: Record<string, string> = { Runde: 'Round', Tag: 'Day', Finale: 'Finals' };

/** "S42_PerformanceEvaluation_Event1Round2_EU" -> "Performance Evaluation · Event 1 · Round 2" (Epics eigene Worte). */
function kachelName(k: Kachel): string {
  const w = k.turnier.windowId ?? '';
  const cup = w ? cupNameAusKennung(w) : '';
  const runde = w ? rundenName(w, false, (x) => ENGLISCH[x] ?? x) : '';
  return [cup || k.turnier.name, runde].filter(Boolean).join(' · ');
}

interface CupZeile { rang: number; punkte: number; siege: number; elims: number; spieler: Array<{ name: string; land: string | null }> }
interface VCup { titel: string; cup: string; typ: MapTyp; bild: string | null; datum: number | null; region: string; saisonKurz: string; zeilen: CupZeile[] }

/**
 * Vier verschiedene Cups mit den ersten Plaetzen ihrer Bestenliste - fuer die "Turniere"-Karte der Startseite.
 *
 * Der Betreiber (12.10.2026): nicht immer derselbe Cup, "mehrere verschiedene Cups, mehrere verschiedene Thumbnails",
 * und die Liste mit dem ganzen Team: Flaggen, Punkte, Siege (VR), Eliminierungen, Platz. Je Art (Performance, Division,
 * FNCS, Reload) der neueste beendete Spieltag, dessen Ereignis Epic kennt.
 */
async function cupsHolen(): Promise<VCup[]> {
  const liste = await mapsVerzeichnis();
  const jetzt = Date.now();
  const fertig = liste.filter((e) => e.eventId && e.datum && (e.ende ?? (e.datum as number) + 4 * 3600_000) < jetzt);
  const wahl: MapEintrag[] = [];
  for (const typ of ['performance', 'division', 'fncs', 'reload'] as MapTyp[]) {
    const e = fertig.filter((x) => x.typ === typ).sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0))[0];
    if (e) wahl.push(e);
  }
  const profile = await liesJson<Record<string, { anzeige?: string; name?: string; land?: string }>>('spieler-profile.json', {}).catch(() => ({} as Record<string, { anzeige?: string; name?: string; land?: string }>));
  const raus: VCup[] = [];
  await Promise.all(wahl.map(async (e) => {
    try {
      const top = await gecacht(`vitrine|top|${e.windowId}`, 15 * 60_000, () => holeTop(e.eventId as string, e.windowId, 8, true));
      const zeilen: CupZeile[] = ((top as { entries?: Array<{ rank: number; points: number; wins: number; elims: number; players: Array<{ id: string; name?: string }> }> }).entries ?? [])
        .slice(0, 6).map((z) => ({
          rang: z.rank, punkte: z.points, siege: z.wins, elims: z.elims,
          spieler: z.players.map((p) => ({ name: profile[p.id]?.anzeige || profile[p.id]?.name || (p.name && p.name !== p.id ? p.name : p.id.slice(0, 6)), land: (profile[p.id]?.land ?? '').toUpperCase() || null })),
        }));
      if (zeilen.length) raus.push({ titel: e.titel, cup: e.cup, typ: e.typ, bild: e.bild, datum: e.datum, region: e.region, saisonKurz: e.saisonKurz, zeilen });
    } catch { /* ohne Bestenliste faellt dieser Cup weg */ }
  }));
  const reihenfolge = ['performance', 'division', 'fncs', 'reload'];
  return raus.sort((a, b) => reihenfolge.indexOf(a.typ) - reihenfolge.indexOf(b.typ));
}

export async function GET(request: Request) {
  if (merker && merker.bis > Date.now()) {
    return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  }
  const start = await startHolen(request);
  if (!start) return NextResponse.json({ ok: false, spieler: [], cups: [], regionen: [], maps: 0 }, { status: 200 });

  const alle = (start.profile ?? []).flatMap((p) => p.spieler);
  const spieler = [...alle].sort((a, b) => (b.elims ?? 0) - (a.elims ?? 0)).slice(0, 30).map(schlank);

  // Je Region der Beste nach Eliminierungen - die Balken der "Global"-Karte. Der Betreiber (12.10.2026): "die Liste an
  // Most Eliminations nur fuer diese Season" - also die Eliminierungen der laufenden Saison in dieser Region, nicht die
  // Gesamtwerte der Profile. Fehlt die Saisonliste, bleibt es bei den Profilen.
  let regionen = (start.profile ?? [])
    .map((p) => ({ region: p.region, bester: [...p.spieler].sort((a, b) => (b.elims ?? 0) - (a.elims ?? 0))[0] }))
    .filter((r) => r.bester && (r.bester.elims ?? 0) > 0)
    .map((r) => ({ region: r.region, name: r.bester.anzeige || r.bester.name, land: r.bester.land ?? null, elims: r.bester.elims ?? 0 }))
    .sort((a, b) => b.elims - a.elims);
  if (start.saison) {
    try {
      const sa = await abgelegteAntwort<{ listen?: Array<{ feld: string; plaetze?: Array<Zeile & { jeRegion?: Record<string, { elims?: number }> }> }> }>(
        `szene|ansicht=start&saison=${start.saison}`);
      const je = new Map<string, { region: string; name: string; land: string | null; elims: number }>();
      for (const z of sa?.listen?.find((l) => l.feld === 'elims')?.plaetze ?? []) {
        for (const [r, w] of Object.entries(z.jeRegion ?? {})) {
          const n = w?.elims ?? 0;
          if (n > (je.get(r)?.elims ?? 0)) je.set(r, { region: r, name: z.anzeige || z.name, land: z.land ?? null, elims: n });
        }
      }
      const saisonweit = [...je.values()].sort((a, b) => b.elims - a.elims);
      if (saisonweit.length >= 3) regionen = saisonweit;
    } catch { /* ohne Saisonliste bleiben die Profilwerte */ }
  }

  let cups: VCup[] = [];
  try { cups = await cupsHolen(); } catch { /* ohne Cups bleibt die Karte leer */ }
  // Die ersten fuenf der Power Rankings - mit dem Namen aus den Profilen statt Epics Anzeigenamen samt Teamkuerzel.
  let rangliste: Array<{ rang: number; name: string; land: string | null; wertung: number; delta: number }> = [];
  try {
    const profile = await liesJson<Record<string, { anzeige?: string; name?: string; land?: string }>>('spieler-profile.json', {});
    const j = await (await prLesen(new Request('http://localhost/api/power-rankings?page=1'))).json() as {
      players?: Array<{ rank: number; id: string; name: string; land?: string; wertung: number; deltaPlatz?: number }>;
    };
    rangliste = (j.players ?? []).slice(0, 5).map((x) => ({
      rang: x.rank, name: profile[x.id]?.anzeige || profile[x.id]?.name || x.name,
      land: (profile[x.id]?.land || x.land || '').toUpperCase() || null, wertung: x.wertung, delta: x.deltaPlatz ?? 0,
    }));
  } catch { /* ohne Rangliste bleibt die Karte leer */ }
  let maps = 0;
  try { maps = (await mapsVerzeichnis()).length; } catch { /* ohne Zahl */ }

  const antwort = {
    ok: true, saison: start.saison ?? null, saisonName: start.saison ? saisonName(start.saison) : null, spieltage: start.grundlage?.spieltage?.length ?? null,
    spieler, cups, maps, regionen, rangliste,
  };
  merker = { bis: Date.now() + 10 * 60_000, antwort };
  return NextResponse.json(antwort, { headers: { 'Cache-Control': CDN_FRIST } });
}
