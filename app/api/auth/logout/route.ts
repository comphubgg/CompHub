import { NextRequest, NextResponse } from "next/server";

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
  const baseUrl = (request.nextUrl.origin
    || process.env.NEXT_PUBLIC_BASE_URL || "").trim();
  const response = NextResponse.redirect(`${baseUrl.replace(/\/$/, "")}/login`);
  response.cookies.delete("streamer_dashboard_auth");
  return response;
}
