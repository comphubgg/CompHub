import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { alleKartenUpdates, kartenUpdateBild, sucheUndMelde } from '@/lib/kartenUpdates';

/*
 * Die Kartenversionen aller Updates (lib/kartenUpdates).
 *
 *   GET   die Liste - jede Version mit Kapitel, Saison, Namen des Updates und der Bildadresse (das Bild kommt verkleinert ueber /api/maps-bild)
 *   POST  { aktion: "suchen" } (nur Admin) sofort nach neuen Versionen suchen - der Knopf "Neue Karte suchen"; dasselbe laeuft taeglich von selbst
 *         (/api/cron/karten-updates)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  const alle = await alleKartenUpdates();
  return NextResponse.json(
    { ok: true, updates: alle.map((u) => ({ ...u, url: kartenUpdateBild(u.img) })) },
    { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } },
  );
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as { aktion?: string };
  if (k.aktion !== 'suchen') return NextResponse.json({ ok: false, error: 'Unbekannte Aktion.' }, { status: 400 });
  try {
    const r = await sucheUndMelde();
    return NextResponse.json({ ok: true, neu: r.neu.map((u) => u.patch), geprueft: r.geprueft, neueste: r.neueste }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 503 });
  }
}
