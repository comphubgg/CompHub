import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import {
  richteServerEin, schluesselAufraeumen, discordDa, knoepfeMoeglich,
} from '@/lib/discord';

/*
 * Den Discord-Server einrichten - auf Knopfdruck aus dem Adminwerkzeug.
 *
 * Der Betreiber wollte die Kategorien, die Kanaele, die Berechtigungen und
 * die Aushaenge nicht von Hand zusammenklicken. Was hier passiert, steht in
 * richteServerEin() in lib/discord.ts; diese Route ist nur die Tuer davor,
 * und sie fuehrt ausschliesslich fuer einen Admin hindurch.
 *
 * Der Weg ist beliebig oft gangbar: ein zweiter Aufruf legt nichts doppelt
 * an, sondern setzt die Berechtigungen neu und ersetzt die Texte. So lassen
 * sich die Leitfaeden nachziehen, wenn das Werkzeug etwas dazugelernt hat.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
/*
 * Das dauert.
 *
 * Zwischen den Loeschungen alter Nachrichten liegen Pausen - Discord
 * begrenzt das Entfernen alter Nachrichten streng -, und es werden mehrere
 * Kanaele angefasst. Mit den voreingestellten Sekunden braeche der Aufbau
 * mitten in der Arbeit ab, und niemand wuesste, wie weit er gekommen ist.
 */
export const maxDuration = 300;

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin' && !k.gesperrt) return true;
  }
  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;
  const name = vipAus(wert);
  if (!name) return false;
  return rechteVon(await zugangNach(name)).rolle === 'admin';
}

/** Was eingerichtet ist - damit die Oberflaeche nicht raten muss. */
export async function GET() {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    token: discordDa(),
    knoepfe: knoepfeMoeglich(),
  });
}

export async function POST(request: Request) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }
  const koerper = await request.json().catch(() => ({}));
  /*
   * Das Alte wegraeumen - voreingestellt ja.
   *
   * "Du erstellst eine Welcome Post, loescht die aktuelle Welcome Post."
   * Wer den Aufbau ein zweites Mal laufen laesst und die vorhandenen
   * Nachrichten behalten will, schaltet es ab; dann steht der neue Text
   * darunter.
   */
  const altesLoeschen = koerper.altesLoeschen !== false;

  /*
   * Zwei Arbeiten hinter derselben Tuer.
   *
   * "aufbau" richtet den Server ein - Kategorien, Kanaele, Rechte, Aushaenge.
   * "schluessel" fasst nur die Schluesselkanaele an und schreibt den
   * gueltigen Schluessel neu hinein. Getrennt, weil das zweite oefter
   * gebraucht wird und nichts am Aufbau aendern soll.
   */
  const bericht = koerper.was === 'schluessel'
    ? await schluesselAufraeumen()
    : await richteServerEin({ altesLoeschen });
  return NextResponse.json(bericht, { status: bericht.ok ? 200 : 207 });
}
