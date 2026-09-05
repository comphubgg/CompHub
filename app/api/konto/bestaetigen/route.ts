import { NextResponse } from 'next/server';
import { bestaetigeMitSchluessel } from '@/lib/konten';

/*
 * Der Klick aus der Bestaetigungsmail.
 *
 * Bewusst ein Weg, der weiterleitet und keine Seite fuer sich: wer aus seinem
 * Postfach kommt, soll im Werkzeug landen und nicht auf einer weissen Seite
 * mit dem Wort "ok". Was passiert ist, steht dann in der Adresse und wird
 * dort angezeigt.
 *
 * Ohne Anmeldung: der Schluessel aus der Mail ist der Nachweis. Wer ihn hat,
 * kommt an das Postfach - mehr wird hier nicht behauptet. Er verfaellt beim
 * Einloesen, damit er nicht ein zweites Mal wirkt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const schluessel = new URL(request.url).searchParams.get('schluessel') ?? '';
  const konto = await bestaetigeMitSchluessel(schluessel);

  // Ein relatives Ziel: NextResponse.redirect schreibt die Adresse sonst auf
  // die um, unter der der Server lauscht - hinter dem Tunnel "0.0.0.0:3100".
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: konto ? '/konto?bestaetigt=1' : '/anmelden?fehler=schluessel',
    },
  });
}
