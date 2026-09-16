import { NextResponse } from 'next/server';
import { liesJson, schreibJson } from '@/lib/ablage';
import { istAdminAnfrage } from '@/lib/adminPruefung';

/*
 * Wer welchen Bereich der Statistikseite sehen darf.
 *
 * Der Betreiber wollte je Bereich (Turniere, Regionen, Spieler, Vergleich)
 * ein Schloss unten rechts: gruen fuer alle, gelb nur fuer VIPs, rot nur
 * fuer ihn. Gespeichert wird eine kleine Zuordnung Bereich -> Stufe; was
 * nicht darin steht, behaelt seinen Standard auf der Seite.
 *
 * Lesen darf jeder - die Seite muss ja wissen, was sie zeigen soll. Die
 * Stufen selbst verraten nichts; die Inhalte kommen von anderen Wegen, die
 * ihre eigene Pruefung haben.
 */

export const dynamic = 'force-dynamic';

const DATEI = 'statistik-sichtbarkeit.json';
const STUFEN = new Set(['alle', 'vip', 'admin']);
const BEREICHE = new Set(['turniere', 'regional', 'spieler', 'jahr', 'vergleich', 'bilder']);

export async function GET() {
  const bereiche = await liesJson<Record<string, string>>(DATEI, {});
  return NextResponse.json({ bereiche });
}

export async function POST(request: Request) {
  if (!await istAdminAnfrage(request)) {
    return NextResponse.json({ error: 'Nur der Admin.' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({})) as { bereich?: string; sichtbar?: string };
  const bereich = String(koerper.bereich ?? '');
  const sichtbar = String(koerper.sichtbar ?? '');
  if (!BEREICHE.has(bereich) || !STUFEN.has(sichtbar)) {
    return NextResponse.json({ error: 'Bereich oder Stufe unbekannt.' }, { status: 400 });
  }
  const bereiche = await liesJson<Record<string, string>>(DATEI, {});
  bereiche[bereich] = sichtbar;
  await schreibJson(DATEI, bereiche);
  return NextResponse.json({ ok: true, bereiche });
}
