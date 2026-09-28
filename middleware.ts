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

/*
 * Die Verwaltung (/admin und alles darunter) gibt es nur angemeldet - und
 * nur fuer Admin und Manager.
 *
 * Bisher entschied das allein die Seite im Browser: sie fragte nach dem
 * Laden bei /api/auth/check-admin nach und blendete Kacheln aus. Wer
 * "/admin" in die Adresszeile tippte, sah die Verwaltung trotzdem einen
 * Moment lang - und ohne jede Anmeldung die Kacheln, die keinem Bereich
 * zugeordnet sind. Der Betreiber: "das darf auch nicht passieren, das ist
 * eine Sicherheitsluecke." Jetzt faellt die Entscheidung hier, bevor die
 * Seite ueberhaupt gebaut wird.
 *
 * Ohne Sitzungs-Cookie ist die Antwort sofort klar: zur Anmeldung, mit
 * der Adresse als Rueckweg. Mit Cookie fragt die Middleware dieselbe
 * Auskunft wie die Seite - sie laeuft in der Edge-Laufzeit und kann die
 * Konten nicht selbst lesen. Antwortet die Auskunft nicht, gilt: nicht
 * angemeldet.
 */
const SITZUNGS_COOKIES = ['streamer_dashboard_konto', 'streamer_dashboard_auth'];

/*
 * Wohin die Nachfrage geht.
 *
 * Bei Vercel ging sie an die eigene oeffentliche Adresse. Auf dem eigenen
 * Host (Render, hinter Cloudflare) kam sie von dort nie an: jeder Aufruf
 * von /admin landete bei der Anmeldung, die den angemeldeten Betreiber
 * sofort zurueckschickte - der Betreiber (28.9.2026): "obwohl ich
 * eingeloggt bin, komme ich wieder auf die Login-Page". Dort fragt die
 * Middleware deshalb den Server direkt (COMPHUB_INTERN_URL, im Image
 * gesetzt) und nur ersatzweise die oeffentliche Adresse.
 */
function auskunftAdressen(request: NextRequest): string[] {
  const oeffentlich = new URL('/api/auth/check-admin', request.url).toString();
  const intern = process.env.COMPHUB_INTERN_URL;
  return intern ? [`${intern.replace(/\/+$/, '')}/api/auth/check-admin`, oeffentlich] : [oeffentlich];
}

async function verwaltungErlaubt(request: NextRequest): Promise<boolean> {
  if (!SITZUNGS_COOKIES.some((c) => request.cookies.get(c)?.value)) return false;
  for (const adresse of auskunftAdressen(request)) {
    try {
      const r = await fetch(adresse, {
        headers: { cookie: request.headers.get('cookie') ?? '' },
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) {
        console.warn(`[verwaltung] ${adresse}: HTTP ${r.status}`);
        continue;
      }
      const j = await r.json() as { isAdmin?: boolean; rolle?: string | null };
      return j.isAdmin === true || j.rolle === 'manager';
    } catch (e) {
      console.warn(`[verwaltung] ${adresse}: ${(e as Error).message}`);
    }
  }
  // Keine Auskunft: wie bisher nicht angemeldet - die Verwaltung bleibt zu.
  return false;
}

export async function middleware(request: NextRequest) {
  const pfad = request.nextUrl.pathname;
  if (pfad === '/admin' || pfad.startsWith('/admin/')) {
    if (!(await verwaltungErlaubt(request))) {
      const ziel = new URL('/sign-in', request.url);
      ziel.searchParams.set('weiter', pfad);
      return NextResponse.redirect(ziel);
    }
  }
  const koepfe = new Headers(request.headers);
  koepfe.set('x-comphub-pfad', pfad);
  return NextResponse.next({ request: { headers: koepfe } });
}

export const config = {
  /*
   * Alles ausser den Dingen, die ohnehin nie ein Bereich sind: die eigenen
   * Schnittstellen, Nexts Bauwerk, die Bilddateien. Das spart bei jedem
   * Seitenaufruf eine Handvoll ueberfluessiger Durchlaeufe.
   */
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|logos|players|flags|bilder).*)'],
};
