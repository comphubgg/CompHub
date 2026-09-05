import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { vipAus } from '@/lib/vipCookie';
import { alleAnwesend, NOCH_DA_MS } from '@/lib/anwesenheit';

/*
 * Wer gerade da ist - nur fuer den Betreiber.
 *
 * Wer wann angemeldet war, geht niemanden ausser ihm etwas an. Deshalb
 * dieselbe Pruefung wie bei den Nutzungszahlen, und aus demselben Grund:
 * ein Knopf, der im Browser nur ausgeblendet ist, schuetzt nichts.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

async function darfSehen(): Promise<boolean> {
  const laden = await cookies();
  if (vipAus(laden.get(VIP_COOKIE)?.value)?.trim().toLowerCase() === 'admin-juanito') {
    return true;
  }
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (!id) return false;
  return (await nachId(id))?.rolle === 'admin';
}

export async function GET() {
  if (!await darfSehen()) {
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
