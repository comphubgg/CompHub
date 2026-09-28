import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { zwischenspeichern } from '@/lib/zwischenspeicher';

/*
 * Die voll ausgelesenen Replays (scripts/replay-voll-holen.mjs) fuer die
 * Seite /admin/replay.
 *
 *   GET            -> alle ausgewerteten Matches, nach Spieltag gruppiert
 *   GET ?match=ID  -> ein Match: Zonen, Kill-Feed mit Ort, Spieler
 *
 * Ein ausgewertetes Match aendert sich nie mehr - Vercels bzw. Cloudflares
 * Zwischenspeicher darf es lange halten; die Liste waechst stuendlich.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface IndexEintrag {
  datei: string; windowId: string; eventId: string; titel?: string; region?: string; season?: string;
  beginn?: string; ende?: number; sieger?: string[]; spieler?: number; zonen?: number;
}

async function index(): Promise<Record<string, IndexEintrag>> {
  const i = await liesJson<{ matches?: Record<string, IndexEintrag> }>('replay-voll/index.json', {});
  return i.matches ?? {};
}

export async function GET(request: Request) {
  const match = new URL(request.url).searchParams.get('match');
  try {
    const alle = await index();
    if (match) {
      const e = alle[match];
      if (!e) return NextResponse.json({ error: 'Dieses Match ist nicht ausgewertet.' }, { status: 404 });
      const daten = await liesJson<Record<string, unknown> | null>(e.datei, null);
      if (!daten) return NextResponse.json({ error: 'Die Auswertung ist gerade nicht lesbar.' }, { status: 503 });
      return zwischenspeichern(NextResponse.json({ ...daten, info: e }, { headers: { 'Cache-Control': 'public, max-age=3600' } }), 86_400);
    }
    // Nach Spieltag gruppiert, darin nach Beginn; die Games nummeriert.
    const tage = new Map<string, { windowId: string; titel: string; region: string; season: string; matches: Array<IndexEintrag & { id: string; nr: number }> }>();
    for (const [id, e] of Object.entries(alle)) {
      const t = tage.get(e.windowId) ?? { windowId: e.windowId, titel: e.titel ?? e.windowId, region: e.region ?? '', season: e.season ?? '', matches: [] };
      t.matches.push({ ...e, id, nr: 0 });
      tage.set(e.windowId, t);
    }
    const liste = [...tage.values()].map((t) => {
      t.matches.sort((a, b) => String(a.beginn ?? '').localeCompare(String(b.beginn ?? '')));
      t.matches.forEach((m, i) => { m.nr = i + 1; });
      return t;
    }).sort((a, b) => String(b.matches[0]?.beginn ?? '').localeCompare(String(a.matches[0]?.beginn ?? '')));
    return zwischenspeichern(NextResponse.json({ tage: liste }, { headers: { 'Cache-Control': 'no-store' } }), 300);
  } catch {
    return NextResponse.json({ error: 'Die Ablage antwortet gerade nicht.' }, { status: 503 });
  }
}
