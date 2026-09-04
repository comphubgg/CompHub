import { NextResponse, type NextRequest } from 'next/server';

/*
 * Den aufgerufenen Pfad an den Rahmen weiterreichen.
 *
 * Hintergrund: die sieben Hauptbereiche lassen sich einzeln zumachen (siehe
 * lib/sektionen.ts). Die Entscheidung darf nicht erst im Browser fallen -
 * sonst stuende der Inhalt eines "offline" geschalteten Bereichs trotzdem im
 * Quelltext der Seite, und wer die Adresse kennt, koennte ihn lesen. Der
 * Betreiber wollte ausdruecklich, dass "direkte Aufrufe der URL ebenfalls
 * abgefangen" werden.
 *
 * Der Rahmen (app/layout.tsx) ist ein Server-Bestandteil und koennte das
 * entscheiden - nur kennt er den Pfad nicht. Next reicht ihn dort nicht
 * hinein. Diese Middleware schreibt ihn deshalb in einen Kopf, den der
 * Rahmen auslesen kann.
 *
 * Warum nicht hier selbst sperren: die Middleware laeuft in der
 * Edge-Laufzeit, und dort gibt es keine Dateien - der Zustand steht aber in
 * data/sektionen.json. Nur den Pfad durchzureichen ist billig und laesst
 * die Entscheidung dort, wo alle noetigen Angaben vorliegen.
 */

export function middleware(request: NextRequest) {
  const koepfe = new Headers(request.headers);
  koepfe.set('x-comphub-pfad', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: koepfe } });
}

export const config = {
  /*
   * Alles ausser den Dingen, die ohnehin nie ein Bereich sind: die eigenen
   * Schnittstellen, Nexts Bauwerk, die Bilddateien. Das spart bei jedem
   * Seitenaufruf eine Handvoll ueberfluessiger Durchlaeufe.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos|players|flags).*)'],
};
