import { NextResponse } from 'next/server';
import { istAdminAnfrage } from '@/lib/adminPruefung';
import { heuteDatum, postErsetzen, tagesplan } from '@/lib/tagesposts';

/*
 * Die Posts des Tages (lib/tagesposts) - nur fuer den Admin.
 *
 *   GET  ?datum=2026-10-14   der Plan des Tages; fuer heute wird er angelegt, wenn es ihn noch nicht gibt, fuer andere Tage nur gelesen
 *   POST { datum, aktion: "neu", nr }   den Post Nr. nr durch einen anderen ersetzen (noch nie an der Reihe gewesen, moeglichst dieselbe Art)
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403 });
  const datum = new URL(request.url).searchParams.get('datum') ?? heuteDatum();
  if (!DATUM.test(datum)) return NextResponse.json({ ok: false, error: 'Datum ungültig.' }, { status: 400 });
  try {
    const plan = await tagesplan(datum, datum === heuteDatum());
    return NextResponse.json({ ok: true, plan }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424 });
  }
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) return NextResponse.json({ ok: false, error: 'Nur für den Admin.' }, { status: 403 });
  const k = await request.json().catch(() => ({})) as { datum?: string; aktion?: string; nr?: number };
  if (!k.datum || !DATUM.test(k.datum) || k.aktion !== 'neu' || !Number.isInteger(k.nr)) return NextResponse.json({ ok: false, error: 'Anfrage unvollständig.' }, { status: 400 });
  try {
    const plan = await postErsetzen(k.datum, k.nr as number);
    return NextResponse.json({ ok: true, plan }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 424 });
  }
}
