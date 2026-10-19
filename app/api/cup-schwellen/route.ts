import { NextResponse } from 'next/server';
import { holeSeite } from '@/lib/epicCups';

/*
 * Wie viele Punkte ein Platz gerade braucht - die Schwellen der Skin-Cups (Betreiber, 19.10.2026: "Top 1000 mit den Punkten, die es live braucht,
 * wie bei Fortnite Tracker"). Gelesen wird die Bestenliste an genau dem Platz, der in der Auszahlungstabelle steht: Platz 200, Platz 1000 ...
 * Es wird nichts geschaetzt - wo Epic den Platz (noch) nicht fuehrt, fehlt die Zahl.
 *
 *   GET /api/cup-schwellen?event=...&window=...&raenge=200,1000,5000
 *     -> { ok, stand: { "200": 3213, "1000": 2788 }, aktualisiert, plaetze }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const event = p.get('event') ?? '';
  const fenster = p.get('window') ?? '';
  const raenge = [...new Set((p.get('raenge') ?? '').split(',').map((x) => Math.round(Number(x))).filter((n) => Number.isFinite(n) && n >= 1 && n <= 10_000))].slice(0, 12);
  if (!event || !fenster || !raenge.length) return NextResponse.json({ ok: false, error: 'event, window und raenge fehlen.' }, { status: 400 });
  try {
    const erste = await holeSeite(event, fenster, 0, true);
    const proSeite = erste.entries.length;
    const stand: Record<string, number> = {};
    if (proSeite) {
      await Promise.all(raenge.map(async (rang) => {
        const seite = Math.floor((rang - 1) / proSeite);
        if (seite >= erste.totalPages) return;
        const s = seite === 0 ? erste : await holeSeite(event, fenster, seite, true);
        const e = s.entries.find((x) => x.rank === rang) ?? s.entries[(rang - 1) % proSeite];
        const punkte = (e as { points?: number } | undefined)?.points;
        if (typeof punkte === 'number') stand[String(rang)] = punkte;
      }));
    }
    return NextResponse.json({ ok: true, stand, aktualisiert: erste.updated ?? null, plaetze: erste.totalPages * (proSeite || 0) },
      { headers: { 'Cache-Control': 'public, max-age=20, s-maxage=30' } });
  } catch {
    return NextResponse.json({ ok: false, error: 'Epic liefert gerade nichts.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
