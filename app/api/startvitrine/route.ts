import { NextResponse } from 'next/server';
import { abgelegteAntwort, ohneDateien, CDN_FRIST } from '@/lib/antwortSpeicher';
import { cupNameAusKennung, rundenName } from '@/lib/rundenName';
import { GET as triosLesen } from '../tierlist-trios/route';

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

export async function GET(request: Request) {
  if (merker && merker.bis > Date.now()) {
    return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  }
  const start = await startHolen(request);
  if (!start) return NextResponse.json({ ok: false, spieler: [], turniere: [], regionen: [], trios: [] }, { status: 200 });

  const alle = (start.profile ?? []).flatMap((p) => p.spieler);
  const spieler = [...alle].sort((a, b) => (b.elims ?? 0) - (a.elims ?? 0)).slice(0, 14).map(schlank);

  // Je Region der Beste nach Eliminierungen - die Balken der "Global"-Karte.
  const regionen = (start.profile ?? [])
    .map((p) => ({ region: p.region, bester: [...p.spieler].sort((a, b) => (b.elims ?? 0) - (a.elims ?? 0))[0] }))
    .filter((r) => r.bester && (r.bester.elims ?? 0) > 0)
    .map((r) => ({ region: r.region, name: r.bester.anzeige || r.bester.name, land: r.bester.land ?? null, elims: r.bester.elims ?? 0 }))
    .sort((a, b) => b.elims - a.elims);

  const turniere = (start.kacheln ?? []).slice(0, 15).map((k) => ({
    name: kachelName(k), region: k.turnier.region, datum: k.turnier.datum,
    spieler: k.turnier.spieler, matches: k.turnier.matches,
    sieger: k.spitze ? { name: k.spitze.anzeige || k.spitze.name, land: k.spitze.land ?? null, elims: k.spitze.elims ?? 0 } : null,
  }));

  // Die besten Trios des letzten Cups: kleinste Platzzahl zuerst.
  let trios: Array<{ spieler: Array<{ name: string; land: string | null }>; region: string | null; platz: number | null }> = [];
  try {
    const j = await (await triosLesen()).json() as { trios?: Array<{ spieler: Array<{ name: string; land?: string }>; region?: string; platz?: number }> };
    trios = (j.trios ?? [])
      .filter((t) => t.spieler?.length === 3 && typeof t.platz === 'number')
      .sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999))
      .slice(0, 6)
      .map((t) => ({ spieler: t.spieler.map((s) => ({ name: s.name, land: s.land ?? null })), region: t.region ?? null, platz: t.platz ?? null }));
  } catch { /* ohne Trios bleibt die Karte leer */ }

  const antwort = {
    ok: true, saison: start.saison ?? null, spieltage: start.grundlage?.spieltage?.length ?? null,
    spieler, turniere, regionen, trios,
  };
  merker = { bis: Date.now() + 10 * 60_000, antwort };
  return NextResponse.json(antwort, { headers: { 'Cache-Control': CDN_FRIST } });
}
