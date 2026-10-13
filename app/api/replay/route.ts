import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';
import { zwischenspeichern } from '@/lib/zwischenspeicher';
import { replayIndex, nachSpieltag, cupKurz, meineCups } from '@/lib/replayVoll';
import { holeSeite } from '@/lib/epicCups';

/*
 * Die voll ausgelesenen Replays (scripts/replay-voll-holen.mjs) fuer die Seiten /replays und /admin/replay.
 *
 *   GET                -> alle ausgewerteten Matches, nach Spieltag gruppiert (Admin-Seite)
 *   GET ?uebersicht=1  -> Cups mit ihren Spieltagen, schlank (Seite /replays)
 *   GET ?tag=FENSTER   -> ein Spieltag mit seinen Games und die anderen Tage desselben Cups (Seiten /replays/<Tag>)
 *   GET ?match=ID      -> ein Match: Zonen, Kill-Feed mit Ort, Spieler
 *
 * Ein ausgewertetes Match aendert sich nie mehr - Vercels bzw. Cloudflares Zwischenspeicher darf es lange halten; die Liste waechst
 * stuendlich.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const match = p.get('match');
  try {
    const alle = await replayIndex();
    if (match) {
      const e = alle[match];
      if (!e) return NextResponse.json({ error: 'Dieses Match ist nicht ausgewertet.' }, { status: 404 });
      const daten = await liesJson<Record<string, unknown> | null>(e.datei, null);
      if (!daten) return NextResponse.json({ error: 'Die Auswertung ist gerade nicht lesbar.' }, { status: 503 });
      // Die Wertung des Cups (Punkte je Platz und je Eliminierung) - damit die Karte zeigen kann, wie viele Punkte ein Team in diesem Game gemacht hat.
      let wertung: { platz: Record<string, number>; elim: number } | null = null;
      try {
        const s = await holeSeite(e.eventId, e.windowId, 0, true);
        if (Object.keys(s.wertung.platz).length || s.wertung.elim) wertung = s.wertung;
      } catch { /* ohne Wertung zeigt die Karte keine Punkte */ }
      return zwischenspeichern(NextResponse.json({ ...daten, info: e, wertung }, { headers: { 'Cache-Control': 'public, max-age=3600' } }), 86_400);
    }
    // Meine Cups: die Games, in denen dieses Epic-Konto steht (Seite /replays/meine).
    const meine = (p.get('meine') ?? '').replace(/-/g, '').toLowerCase();
    if (/^[0-9a-f]{32}$/.test(meine)) {
      return NextResponse.json(await meineCups(meine, alle), { headers: { 'Cache-Control': 'no-store' } });
    }
    const liste = nachSpieltag(alle);

    const tag = p.get('tag');
    if (tag) {
      const t = liste.find((x) => x.windowId === tag);
      if (!t) return NextResponse.json({ error: 'Zu diesem Spieltag gibt es keine ausgewerteten Replays.' }, { status: 404 });
      // Die anderen Tage desselben Cups, in der Reihenfolge ihres Beginns (Day 1, Day 2 ...) - fuer die Leiste oben.
      const geschwister = liste.filter((x) => x.eventId === t.eventId && x.region === t.region)
        .sort((a, b) => String(a.matches[0]?.beginn ?? '').localeCompare(String(b.matches[0]?.beginn ?? '')))
        .map((x) => ({ windowId: x.windowId, matches: x.matches.length }));
      return zwischenspeichern(NextResponse.json({ tag: t, geschwister }, { headers: { 'Cache-Control': 'no-store' } }), 120);
    }

    if (p.get('uebersicht')) {
      // Je Cup (Ereignis) die Spieltage mit Region, Datum und Zahl der Games - ohne die einzelnen Matches.
      const cups = new Map<string, { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: Array<{ windowId: string; region: string; beginn: string; games: number; sieger: string[] }> }>();
      for (const t of liste) {
        const c = cups.get(t.eventId) ?? { eventId: t.eventId, kurz: cupKurz(t.eventId), titel: t.titel, season: t.season, beginn: '', tage: [] };
        const beginn = String(t.matches[0]?.beginn ?? '');
        if (beginn > c.beginn) c.beginn = beginn;
        c.tage.push({ windowId: t.windowId, region: t.region, beginn, games: t.matches.length, sieger: t.matches[t.matches.length - 1]?.sieger ?? [] });
        cups.set(t.eventId, c);
      }
      const raus = [...cups.values()].sort((a, b) => b.beginn.localeCompare(a.beginn));
      for (const c of raus) c.tage.sort((a, b) => a.beginn.localeCompare(b.beginn));
      return zwischenspeichern(NextResponse.json({ cups: raus }, { headers: { 'Cache-Control': 'no-store' } }), 300);
    }

    return zwischenspeichern(NextResponse.json({ tage: liste }, { headers: { 'Cache-Control': 'no-store' } }), 300);
  } catch {
    return NextResponse.json({ error: 'Die Ablage antwortet gerade nicht.' }, { status: 503 });
  }
}
