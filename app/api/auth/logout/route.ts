import { NextRequest, NextResponse } from "next/server";
import { rueckwegVon } from "@/lib/oeffentlicheAdresse";

export function GET(request: NextRequest) {
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
  // Genommen wird der Name aus der Anfrage, nicht request.nextUrl.origin:
  // letzteres ist die Adresse, auf der der Server lauscht. Hinter dem Tunnel
  // ist das "0.0.0.0:3100", und wer sich abmeldete, landete auf
  // "https://0.0.0.0:3100/login" - einer Adresse, die es nicht gibt.
  const response = NextResponse.redirect(rueckwegVon(request, '/login'));
  response.cookies.delete("streamer_dashboard_auth");
  return response;
}
