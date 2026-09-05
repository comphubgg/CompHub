import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { zaehleAufruf, BESUCH_COOKIE } from '@/lib/besuche';
import { kontoAus, nachId } from '@/lib/konten';
import { vipAus } from '@/lib/vipCookie';
import { merkeAufruf } from '@/lib/anwesenheit';

/*
 * Die Meldung "hier ist jemand".
 *
 * Warum ueberhaupt eine eigene Adresse und nicht die Middleware: die laeuft
 * in der Edge-Laufzeit, und dort gibt es keine Dateien - der Zaehler steht
 * aber in data/besuche.json. Und der Rahmen (app/layout.tsx) rendert auch
 * beim Vorausladen, das Next im Hintergrund macht, sobald die Maus ueber
 * einem Verweis steht; das haette Aufrufe gezaehlt, die niemand gesehen hat.
 *
 * Dieser Weg zaehlt, was tatsaechlich in einem Browser angekommen ist. Er
 * hat damit die umgekehrte Ungenauigkeit: wer JavaScript abschaltet, faellt
 * heraus, und Suchmaschinen fallen ebenfalls heraus. Beides ist die
 * angenehmere Seite des Irrtums - lieber ein paar zu wenig als eine Zahl,
 * die von Robotern aufgeblasen ist.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

/**
 * Ist das der Betreiber selbst?
 *
 * Seine eigenen Aufrufe gehoeren nicht in die Zahl. Er hat das Werkzeug beim
 * Bauen den halben Tag offen; wuerde das mitgezaehlt, waere der Balken vor
 * allem ein Bild seiner eigenen Arbeitszeit und nicht der Besucher, nach
 * denen er gefragt hat.
 */
async function istBetreiber(laden: Awaited<ReturnType<typeof cookies>>): Promise<boolean> {
  // Der alte Weg: der Zugangsschluessel des Betreibers.
  if (vipAus(laden.get(VIP_COOKIE)?.value)?.trim().toLowerCase() === 'admin-juanito') {
    return true;
  }
  // Der neue Weg: die Rolle am CompHub-Konto.
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (!id) return false;
  return (await nachId(id))?.rolle === 'admin';
}

export async function POST(request: Request) {
  try {
    const laden = await cookies();

    /*
     * Wer angemeldet ist, wird namentlich vermerkt.
     *
     * Getrennt vom Zaehler darueber: der zaehlt Browser und nennt bewusst
     * keine Namen. Hier geht es um die Angemeldeten, und die sind
     * namentlich bekannt, weil sie sich mit Namen angemeldet haben. Daraus
     * entsteht die Liste "wer ist gerade da" in den Adminwerkzeugen.
     *
     * Auch fuer den Betreiber selbst - er will ja sehen, dass es geht, und
     * bei den Besuchszahlen bleibt er weiterhin aussen vor.
     */
    const vip = vipAus(laden.get(VIP_COOKIE)?.value);
    if (vip) {
      void merkeAufruf(`vip:${vip.toLowerCase()}`, vip, 'vip');
    } else {
      const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
      if (id) {
        const k = await nachId(id);
        if (k) void merkeAufruf(k.id, k.name || k.email, 'konto');
      }
    }

    /*
     * Ein Lebenszeichen zaehlt keinen Besuch.
     *
     * Jeder offene Reiter meldet sich jede Minute, damit "gerade da"
     * stimmt. Wuerde das mitgezaehlt, haette eine einzige den ganzen Tag
     * offene Seite die Besuchszahlen um tausend Aufrufe aufgeblaeht.
     */
    if (new URL(request.url).searchParams.get('puls') === '1') {
      return new NextResponse(null, { status: 204 });
    }

    if (await istBetreiber(laden)) return new NextResponse(null, { status: 204 });

    const neuesCookie = await zaehleAufruf(laden.get(BESUCH_COOKIE)?.value);

    const antwort = new NextResponse(null, { status: 204 });
    if (neuesCookie) {
      antwort.cookies.set(BESUCH_COOKIE, neuesCookie, {
        httpOnly: true,
        sameSite: 'lax',
        // Auf der Domain ueber https, oertlich ueber http - sonst kaeme das
        // Cookie im Entwicklungsbetrieb nie an und jeder Aufruf zaehlte als
        // neuer Besucher.
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 2 * 365 * 24 * 3600,
      });
    }
    return antwort;
  } catch {
    // Ein Zaehler darf nie im Weg stehen. Wer hier landet, hat trotzdem
    // seine Seite - er wird nur nicht mitgezaehlt.
    return new NextResponse(null, { status: 204 });
  }
}
