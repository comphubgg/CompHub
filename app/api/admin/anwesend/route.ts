import { NextResponse } from 'next/server';
import { alleAnwesend, NOCH_DA_MS } from '@/lib/anwesenheit';
import { istBetreiberOderAdminKonto } from '@/lib/adminPruefung';

/*
 * Wer gerade da ist - nur fuer den Betreiber.
 *
 * Wer wann angemeldet war, geht niemanden ausser ihm etwas an. Deshalb
 * dieselbe Pruefung wie bei den Nutzungszahlen, und aus demselben Grund:
 * ein Knopf, der im Browser nur ausgeblendet ist, schuetzt nichts.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function GET() {
  if (!await istBetreiberOderAdminKonto()) {
    return NextResponse.json({ fehler: 'Nicht erlaubt.' }, { status: 403 });
  }
  const liste = await alleAnwesend();
  return NextResponse.json({
    ok: true,
    /*
     * Die Schwelle kommt mit heraus, damit die Oberflaeche sie benennen
     * kann statt "online" zu behaupten. Ein geschlossener Reiter meldet
     * sich nicht ab - mehr als "in den letzten fuenf Minuten war eine Seite
     * offen" weiss hier niemand.
     */
    schwelleMs: NOCH_DA_MS,
    leute: liste,
  });
}
