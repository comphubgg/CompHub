import { NextResponse } from 'next/server';
import { liesJson } from '@/lib/ablage';

/*
 * Das Rating eines Spielers (scripts/spieler-kreis.mjs rechnet es aus allen Bestenlisten). Die Aufsteiger-Liste ist mit ihrem Reiter entfernt (17.11.2026).
 *
 *   GET ?id=<Epic-Konto-Id>    -> { rating: { note, form: [[Note, Platz], ...], cups } | null }, die Form von alt nach neu
 *
 * Fehlt etwas, kommt null mit Status 200: der Lastverteiler haelt jede 5xx fuer einen Ausfall des Servers.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Rating = { n: number; f: Array<[number, number]>; c: number };
const KOPF = { 'Cache-Control': 'public, max-age=300, s-maxage=600' };

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const id = (p.get('id') ?? '').replace(/-/g, '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return NextResponse.json({ rating: null });
  const eimer = await liesJson<Record<string, Rating>>(`spieler-kreis/n-${id.slice(0, 2)}.json`, {}).catch(() => ({} as Record<string, Rating>));
  const r = eimer[id];
  return NextResponse.json({ rating: r ? { note: r.n, form: r.f, cups: r.c } : null }, { headers: KOPF });
}
