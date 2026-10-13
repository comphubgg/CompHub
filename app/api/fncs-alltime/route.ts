import { NextResponse } from 'next/server';
import { liesVerzeichnis, summen, saisonName } from '@/lib/szeneStats';
import { spielerKontext } from '@/lib/globalsSolos';
import { CDN_FRIST } from '@/lib/antwortSpeicher';

/*
 * Die FNCS-Seite: Eliminierungen in den Grand Finals der FNCS-Majors, Spieler gegen Major.
 *
 * Der Betreiber (13.10.2026): eine FNCS-Seite wie beim Vorbild - alle Endspiele und eine Aufstellung, wie viele Eliminierungen
 * jeder in den Grand Finals hatte, je Major. Gerechnet wird aus dem eigenen Archiv (data/szene-stats): die europaeischen
 * Endspieltage der Majors, die das Archiv fuehrt - jeder Major mit seinen zwei Tagen. Was das Archiv nicht hat (aeltere
 * Majors, die LANs), steht hier nicht; die Seite sagt, ab wann sie zaehlt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ENDSPIEL = /FNCS_?Major(\d)_(?:GrandFinal|Final)_?Day(\d)/i;

let merker: { bis: number; antwort: unknown } | null = null;

export async function GET() {
  if (merker && merker.bis > Date.now()) return NextResponse.json(merker.antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  try {
    const verz = (await liesVerzeichnis()).filter((e) => e.region === 'EU');
    // Je Major (Saison + Nummer) die beiden Endspieltage.
    const gruppen = new Map<string, { saison: string; nr: number; tage: string[] }>();
    for (const e of verz) {
      const m = ENDSPIEL.exec(e.windowId);
      if (!m) continue;
      const k = `${e.season}-M${m[1]}`;
      const g = gruppen.get(k) ?? { saison: e.season, nr: Number(m[1]), tage: [] };
      if (!g.tage.includes(e.windowId)) g.tage.push(e.windowId);
      gruppen.set(k, g);
    }
    const events = [...gruppen.entries()]
      .map(([key, g]) => ({ key, titel: `FNCS Major ${g.nr}`, saison: g.saison, saisonKurz: saisonName(g.saison).replace(/Chapter\s*(\d+)\s*Season\s*(\S+)/i, 'CH$1 S$2'), saisonName: saisonName(g.saison), tage: g.tage }))
      .sort((a, b) => Number(a.saison.slice(1)) - Number(b.saison.slice(1)) || a.titel.localeCompare(b.titel));
    if (!events.length) throw new Error('Keine FNCS-Endspiele im Archiv');

    const kontext = await spielerKontext();
    const je = new Map<string, { id: string; name: string; je: Record<string, number>; gesamt: number }>();
    for (const ev of events) {
      const s = await summen({ events: ev.tage, region: 'EU' });
      for (const sp of s.spieler) {
        if (!(sp.elims > 0) && !(sp.matches > 0)) continue;
        const x = je.get(sp.epicId) ?? { id: sp.epicId, name: sp.name, je: {}, gesamt: 0 };
        x.je[ev.key] = (x.je[ev.key] ?? 0) + sp.elims;
        x.gesamt += sp.elims;
        x.name = sp.name;
        je.set(sp.epicId, x);
      }
    }
    const spieler = [...je.values()].sort((a, b) => b.gesamt - a.gesamt).slice(0, 80).map((x) => {
      const k = kontext(x.id, x.name);
      return { id: x.id, name: k.anzeige, land: k.land, bild: k.bild, gesamt: x.gesamt, je: x.je };
    });
    const antwort = { ok: true, events, spieler, ab: events[0]?.saisonName ?? '' };
    merker = { bis: Date.now() + 30 * 60_000, antwort };
    return NextResponse.json(antwort, { headers: { 'Cache-Control': CDN_FRIST } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
