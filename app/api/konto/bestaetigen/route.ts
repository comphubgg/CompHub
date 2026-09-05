import { NextResponse } from 'next/server';
import { bestaetigeMitSchluessel } from '@/lib/konten';
import { begruesse } from '@/lib/hilfsbot';

/*
 * Der Klick aus der Bestaetigungsmail.
 *
 * Vorher fuehrte er ins Werkzeug - eine Weiterleitung auf /konto. Das ist
 * genau dann falsch, wenn man die Mail dort liest, wo man nicht angemeldet
 * ist: der Betreiber oeffnet sie auf dem Telefon, auf dem sein Google-Konto
 * gar nicht eingerichtet ist, und stand dann vor einer Anmeldemaske. Das
 * sieht aus, als haette der Klick nichts bewirkt - dabei war die Adresse in
 * diesem Moment laengst bestaetigt.
 *
 * Deshalb endet der Weg jetzt hier, mit einer Seite, die genau das sagt und
 * sonst nichts: fertig, du kannst das Fenster zumachen. Keine Anmeldung,
 * keine Weiterleitung, nichts zu tun.
 *
 * Ohne Anmeldung: der Schluessel aus der Mail ist der Nachweis. Wer ihn hat,
 * kommt an das Postfach - mehr wird hier nicht behauptet. Er verfaellt beim
 * Einloesen, damit er nicht ein zweites Mal wirkt.
 *
 * Englisch, wie alles, was das Werkzeug nach aussen schreibt.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Die Seite, die der Klick zeigt.
 *
 * Als fertiges HTML und nicht als Seite der Anwendung: hier wird nichts
 * nachgeladen, nichts geklickt und nichts angemeldet. Ein einzelnes Dokument
 * ohne Javascript ist sofort da und geht auch dann auf, wenn der Browser im
 * Postfach eingebaut ist und wenig kann.
 */
function seite(gelungen: boolean): string {
  const titel = gelungen ? 'Address confirmed' : 'This link is no longer valid';
  const text = gelungen
    ? 'Your account carries the check now. You can close this page.'
    : 'The link was already used, or it has expired. Open your account in '
      + 'CompHub and ask for a new confirmation mail.';

  const rand = gelungen ? 'rgba(14,165,233,0.45)' : 'rgba(244,63,94,0.45)';
  const flaeche = gelungen ? 'rgba(14,165,233,0.14)' : 'rgba(244,63,94,0.14)';
  const farbe = gelungen ? '#38bdf8' : '#fb7185';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titel} — CompHub</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    background: #09090b; color: #e4e4e7; padding: 24px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .kasten {
    width: 100%; max-width: 420px; text-align: center;
    border: 1px solid #27272a; border-radius: 16px;
    background: #0e0e12; padding: 40px 28px;
  }
  img { width: 64px; height: 64px; border-radius: 14px; }
  .marke { margin-top: 14px; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .marke span { color: #0ea5e9; }
  .zeichen {
    margin: 24px auto 0; width: 44px; height: 44px; border-radius: 999px;
    display: grid; place-items: center; font-size: 22px; line-height: 1;
    background: ${flaeche}; border: 1px solid ${rand}; color: ${farbe};
  }
  h1 { margin: 22px 0 0; font-size: 17px; font-weight: 700; color: #f4f4f5; }
  p { margin: 10px 0 0; font-size: 14px; line-height: 1.7; color: #a1a1aa; }
  a { color: #38bdf8; }
</style>
</head>
<body>
  <div class="kasten">
    <img src="/social/comphub-profilbild-dunkel.png" alt="">
    <div class="marke"><span>COMP</span>HUB</div>
    <div class="zeichen">${gelungen ? '&#10003;' : '&times;'}</div>
    <h1>${titel}</h1>
    <p>${text}</p>
    ${gelungen ? '' : '<p><a href="/konto">Open CompHub</a></p>'}
  </div>
</body>
</html>`;
}

export async function GET(request: Request) {
  const schluessel = new URL(request.url).searchParams.get('schluessel') ?? '';
  const konto = await bestaetigeMitSchluessel(schluessel);

  /*
   * Die Begruessung im Chat.
   *
   * Genau hier und nicht schon bei der Registrierung: erst mit der
   * bestaetigten Adresse steht fest, dass da wirklich jemand ist. Wer sich
   * mit einer erfundenen Adresse anmeldet, bekommt kein Gespraech - und der
   * Posteingang des Betreibers bleibt sauber.
   */
  if (konto) await begruesse(konto);

  return new NextResponse(seite(Boolean(konto)), {
    status: konto ? 200 : 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Nicht aufbewahren: der Schluessel ist eingeloest, ein zweiter Aufruf
      // hat ein anderes Ergebnis.
      'Cache-Control': 'no-store',
    },
  });
}
