import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { replayIndex, nachSpieltag } from '@/lib/replayVoll';
import { holeSeite } from '@/lib/epicCups';
import { profilKarte } from '@/lib/ergebnisPosts';
import { schaetzung, sortiertJe, zonenGlueck } from '@/app/replays/analyse';
import type { RMatch } from '@/app/replays/ReplayAnsicht';

/*
 * Zonen-Glueck und "gegen die Erwartung" ueber alle Games eines oder mehrerer Spieltage (Betreiber, 15.11.2026: "Analyze all games",
 * mehrere Cups zusammen, Season-Highlights auf /replays). Rechnung wie auf der Game-Seite (app/replays/analyse.ts).
 *
 *   GET ?tage=FENSTER[,FENSTER...]  (hoechstens 4 Spieltage)
 *
 * Ein ausgewertetes Match aendert sich nie mehr - das Ergebnis je Match bleibt im Speicher.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

interface GameZeile { tag: string; nr: number; match: string; glueck: number; zonen: number; gegen: number | null; platz: number | null; punkte: number | null; swing: { wert: number; zone: number } | null; throw: { wert: number; zone: number } | null }
interface Je { epic: string; name: string; games: GameZeile[] }
const JE_MATCH = new Map<string, Array<{ epic: string; name: string; zeile: GameZeile }>>();

function punkteVon(w: { platz: Record<string, number>; elim: number } | null, platz: number | null, kills: number): number | null {
  if (!w || !platz || !Object.keys(w.platz).length) return null;
  let s = 0; for (const [n, x] of Object.entries(w.platz)) if (Number(n) >= platz) s += x;
  return Math.round(s + w.elim * kills);
}

export async function GET(request: Request) {
  const tage = (new URL(request.url).searchParams.get('tage') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4);
  if (!tage.length) return NextResponse.json({ error: 'Kein Spieltag angegeben.' }, { status: 400 });
  try {
    const alle = await replayIndex();
    const liste = nachSpieltag(alle);
    const je = new Map<string, Je>();
    const titel: Array<{ windowId: string; titel: string; region: string; games: number }> = [];
    for (const tag of tage) {
      const t = liste.find((x) => x.windowId === tag);
      if (!t) continue;
      titel.push({ windowId: t.windowId, titel: t.titel, region: t.region, games: t.matches.length });
      let wertung: { platz: Record<string, number>; elim: number } | null = null;
      try { const s = await holeSeite(t.eventId, t.windowId, 0, true); if (Object.keys(s.wertung.platz).length || s.wertung.elim) wertung = s.wertung; } catch { /* ohne Punkte */ }
      for (let i = 0; i < t.matches.length; i += 4) {
        await Promise.all(t.matches.slice(i, i + 4).map(async (m) => {
          const e = alle[m.id];
          if (!e) return;
          const schluessel = `${m.id}|${e.laenge ?? ''}|${wertung ? 'w' : ''}`;
          if (!JE_MATCH.has(schluessel)) {
            const d = await liesJson<(RMatch & { orte?: Record<string, number[][]> }) | null>(e.datei, null).catch(() => null);
            if (!d?.orte || !Object.keys(d.orte).length) return;
            const orte = sortiertJe(d.orte);
            const g = zonenGlueck(d, orte); const sch = schaetzung(d, orte);
            const zeilen: Array<{ epic: string; name: string; zeile: GameZeile }> = [];
            for (const s of d.spieler) {
              if (s.bot || !s.epic) continue;
              const gl = g.je.get(s.id); const es = sch.get(s.id);
              if (!gl && !es) continue;
              const platz = s.platz && s.platz < 999 ? s.platz : null;
              zeilen.push({ epic: s.epic.toLowerCase(), name: String(s.name ?? '?').replace(/^\s*\[[^\]]*\]\s*/, ''), zeile: {
                tag, nr: m.nr, match: m.id, glueck: gl?.summe ?? 0, zonen: gl?.zonen ?? 0, gegen: es?.gegen ?? null, platz,
                punkte: punkteVon(wertung, platz, s.teamKills ?? s.kills ?? 0), swing: es?.swing ?? null, throw: es?.throw ?? null,
              } });
            }
            JE_MATCH.set(schluessel, zeilen);
          }
          for (const z of JE_MATCH.get(schluessel) ?? []) {
            const x = je.get(z.epic) ?? { epic: z.epic, name: z.name, games: [] };
            x.games.push(z.zeile); je.set(z.epic, x);
          }
        }));
      }
    }
    // Flaggen nur aus unseren Profilen.
    const laender: Record<string, string> = {};
    try {
      const { profile } = await profilKarte();
      for (const id of je.keys()) { const l = profile.get(id)?.land; if (l && /^[A-Za-z]{2}$/.test(l)) laender[id] = l.toLowerCase(); }
    } catch { /* ohne Flaggen */ }
    const spieler = [...je.values()].map((x) => ({ ...x, games: x.games.sort((a, b) => a.tag.localeCompare(b.tag) || a.nr - b.nr), land: laender[x.epic] }));
    return zwischenspeichern(NextResponse.json({ tage: titel, spieler }, { headers: { 'Cache-Control': 'public, max-age=600' } }), 600);
  } catch {
    return NextResponse.json({ error: 'Die Ablage antwortet gerade nicht.' }, { status: 424 });
  }
}
