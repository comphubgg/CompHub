import { NextResponse } from 'next/server';
import { pruefeZuschauer } from '@/lib/povZugang';
import { epicIdVon } from '@/lib/pov';
import { standFuer } from '@/lib/povStats';

/*
 * Die Statistik eines Pro-POVs fuer die Anzeige auf dem Bild.
 *
 *   GET ?pro=<Kennung>[&s=<Link-Schluessel>]
 *     { ok: true, verfuegbar: false }                    der Profi hat kein verbundenes Epic-Konto
 *     { ok: true, verfuegbar: true, stand: null }        er spielt gerade in keinem laufenden Cup
 *     { ok: true, verfuegbar: true, stand: { ... } }     Platz, Punkte, Eliminierungen des laufenden Cups
 *
 * Wer das POV sehen darf, darf auch das sehen - dieselbe Pruefung wie beim Strom.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const nie = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const proIdent = (p.get('pro') ?? '').slice(0, 120);
  if (!proIdent) return NextResponse.json({ ok: false, error: 'Kein POV gewählt.' }, { status: 400, headers: nie });

  const pruefung = await pruefeZuschauer(request, proIdent);
  if (!pruefung.ok) return NextResponse.json({ ok: false, error: pruefung.error }, { status: pruefung.status, headers: nie });

  const epicId = await epicIdVon(proIdent);
  if (!epicId) return NextResponse.json({ ok: true, verfuegbar: false }, { headers: nie });
  try {
    return NextResponse.json({ ok: true, verfuegbar: true, stand: await standFuer(epicId) }, { headers: nie });
  } catch {
    // Epic antwortet nicht: das Overlay behaelt den letzten Stand, statt "kein Cup" zu behaupten.
    return NextResponse.json({ ok: false, error: 'Epic antwortet nicht.' }, { status: 424, headers: nie });
  }
}
