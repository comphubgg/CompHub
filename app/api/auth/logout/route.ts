import { NextRequest, NextResponse } from "next/server";
import { kontoAus } from '@/lib/konten';
import { vipAus } from '@/lib/vipCookie';
import { merkeAbmeldung } from '@/lib/anwesenheit';

/*
 * Bei jeder Anfrage neu ausfuehren.
 *
 * Ohne das wertet Next die Route beim Bauen einmal aus und liefert danach
 * immer dieselbe Antwort. Beim Abmelden wurde so die Adresse des Bauvorgangs
 * eingebacken - jeder landete auf "https://0.0.0.0:3100/login", einer Adresse,
 * die es nicht gibt. Wo die Antwort von der Anfrage abhaengt, muss sie auch
 * bei jeder Anfrage entstehen.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function GET(request: NextRequest) {
  /*
   * Sofort aus der Anwesenheitsliste heraus.
   *
   * Ohne das leuchtete der gruene Punkt noch zwei Minuten weiter - so lange
   * gilt das letzte Lebenszeichen. Wer sich abmeldet, sagt aber ausdruecklich
   * Bescheid; darauf noch zu warten waere schlicht falsch.
   */
  const vip = vipAus(request.cookies.get('streamer_dashboard_auth')?.value);
  if (vip) await merkeAbmeldung(`vip:${vip.toLowerCase()}`);
  const konto = kontoAus(request.cookies.get('streamer_dashboard_konto')?.value);
  if (konto) await merkeAbmeldung(konto);

  /*
   * Wohin nach dem Abmelden.
   *
   * Die Adresse des Aufrufs geht vor: dann landet man dort wieder, wo man
   * hergekommen ist - ob das nun localhost, die eigene Domain oder das
   * Fensterprogramm auf Port 3001 ist. Erst wenn die fehlt, greift die
   * eingestellte Adresse.
   *
   * Vorher stand hier als letzter Rueckfall eine alte Vercel-Adresse aus
   * einer frueheren Veroeffentlichung. Die gehoerte niemandem mehr und
   * haette einen Abmeldenden auf eine fremde Seite geschickt.
   */
  /*
   * Ein relatives Ziel, kein vollstaendiges.
   *
   * NextResponse.redirect() verlangt eine vollstaendige Adresse und schreibt
   * sie anschliessend auf die Adresse um, unter der der Server lauscht. Hinter
   * dem Tunnel ist das "0.0.0.0:3100", und wer sich abmeldete, landete auf
   * "https://0.0.0.0:3100/login" - einer Adresse, die es nicht gibt. Der
   * Umweg ueber den Namen aus der Anfrage half nichts, weil das Umschreiben
   * erst danach geschieht.
   *
   * Ein relatives Ziel loest der Browser selbst gegen die Adresse auf, die er
   * gerade offen hat. Damit stimmt es ueberall, ohne dass jemand wissen muss,
   * wie das Werkzeug gerade erreicht wird.
   */
  const response = new NextResponse(null, {
    status: 307,
    headers: { Location: '/login' },
  });
  response.cookies.delete("streamer_dashboard_auth");
  return response;
}
