import { NextResponse } from 'next/server';
import { liesVerdienstArchiv } from '@/lib/verdienstArchiv';
import { liesJson } from '@/lib/ablage';
import { gecacht } from '@/lib/epicCups';
import { GET as prAbruf } from '@/app/api/power-rankings/route';

/*
 * Wer als "bekannt" gilt - fuer "Notable Players to have not qualified" (Betreiber, 8.11.2026: "kein Schwanz juckt es, ob ein Tylio da drin ist oder ein Chrisc,
 * Flobby, Joshbot, Finn"). Gemessen an seiner eigenen Liste: bekannt ist, wer ein gepflegtes Profil mit X-Konto hat oder seit 2019 mindestens 20.000 $ Preisgeld
 * gewonnen hat. Das traf 41 seiner 45 Namen und keinen der Unbekannten. Reihenfolge: Power Rankings, dann Preisgeld.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRENZE = 20_000;

type Profil = { id?: string; epicId?: string; name?: string; anzeige?: string; x?: string };

export async function GET() {
  try {
    const daten = await gecacht('bekannte-spieler', 30 * 60_000, async () => {
      const [archiv, prof] = await Promise.all([liesVerdienstArchiv(), liesJson<Record<string, Profil> | Profil[]>('spieler-profile.json', {})]);
      const liste = Array.isArray(prof) ? prof : Object.entries(prof).map(([k, v]) => ({ ...v, id: v.id || v.epicId || k }));
      const prRang = new Map<string, { rang: number; name: string }>();
      for (const s of [1, 2, 3]) {
        try {
          const j = await (await prAbruf(new Request(`https://www.thecomphub.com/api/power-rankings?page=${s}&pageSize=200`))).json() as { players?: Array<{ id?: string; name: string; anzeige?: string }> };
          for (const p of j.players ?? []) if (p.id && !prRang.has(p.id)) prRang.set(p.id, { rang: prRang.size + 1, name: p.anzeige || p.name });
        } catch { /* ohne diese Seite */ }
      }
      const verdienst = (id: string) => (archiv.konten[id] ?? []).reduce((a, e) => a + (e[5] || 0), 0);
      const raus = new Map<string, { id: string; name: string; x?: string; verdienst: number; pr: number | null }>();
      for (const p of liste) {
        const id = String(p.id || p.epicId || '').toLowerCase();
        if (!/^[0-9a-f]{32}$/.test(id)) continue;
        const v = verdienst(id);
        if (!p.x && v < GRENZE) continue;
        raus.set(id, { id, name: p.anzeige || p.name || prRang.get(id)?.name || id, x: p.x || undefined, verdienst: Math.round(v), pr: prRang.get(id)?.rang ?? null });
      }
      // Ohne Profil, aber mit viel Preisgeld und unter den Power Rankings: auch bekannt.
      for (const [id, r] of prRang) {
        if (raus.has(id)) continue;
        const v = verdienst(id);
        if (v >= GRENZE) raus.set(id, { id, name: r.name, verdienst: Math.round(v), pr: r.rang });
      }
      return [...raus.values()].sort((a, b) => (a.pr ?? 9999) - (b.pr ?? 9999) || b.verdienst - a.verdienst);
    });
    return NextResponse.json({ ok: true, grenze: GRENZE, spieler: daten }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message, spieler: [] }, { status: 200 });
  }
}
