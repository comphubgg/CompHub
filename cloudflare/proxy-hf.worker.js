/*
 * thecomphub.com -> die Seite auf Hugging Face Spaces.
 *
 * Warum: Netlify hat am 11.10.2026 die 300 Punkte des kostenlosen Tarifs aufgebraucht und die Seite bis
 * zum 4.11. abgeschaltet ("Account usage exceeded for credits"). Die Seite laeuft deshalb als fertiges
 * Docker-Image auf einem Hugging-Face-Space (kostenlos, ohne Karte). Dessen Adresse
 * (<konto>-<space>.hf.space) soll nie sichtbar werden - die Domain bleibt thecomphub.com. Dafuer ist
 * dieser Worker da: er reicht jede Anfrage an den Space weiter und schreibt Weiterleitungen zurueck.
 *
 * Einrichten (einmal, im Cloudflare-Dashboard):
 *   1. Workers & Pages -> Create -> Start with Hello World -> Deploy
 *   2. Edit code -> alles ersetzen durch diese Datei, HF_HOST unten eintragen -> Deploy
 *   3. Settings -> Domains & Routes -> Add -> Route:  *thecomphub.com/*   Zone: thecomphub.com
 *   4. DNS: bei den Eintraegen "thecomphub.com" und "www" die graue Wolke auf ORANGE stellen (Proxy),
 *      sonst laeuft der Worker nicht. SSL/TLS -> Overview -> "Full".
 */

// Die Adresse des Space - ohne https://, z. B. "meinkonto-comphub.hf.space".
const HF_HOST = 'HIER-EINTRAGEN.hf.space';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ziel = new URL(request.url);
    ziel.protocol = 'https:';
    ziel.hostname = HF_HOST;
    ziel.port = '';

    const koepfe = new Headers(request.headers);
    // Die Seite baut ihre Adressen aus diesen Koepfen (Weiterleitungen, Links in Mails).
    koepfe.set('X-Forwarded-Host', url.hostname);
    koepfe.set('X-Forwarded-Proto', 'https');

    let antwort;
    try {
      antwort = await fetch(new Request(ziel.toString(), {
        method: request.method,
        headers: koepfe,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
      }));
    } catch (e) {
      return new Response('CompHub is starting - please reload in a minute.', {
        status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' },
      });
    }

    // Weiterleitungen, die auf den Space zeigen, wieder auf die eigene Domain biegen.
    const nach = antwort.headers.get('Location');
    if (nach && nach.includes(HF_HOST)) {
      const kopie = new Response(antwort.body, antwort);
      kopie.headers.set('Location', nach.split(HF_HOST).join(url.host));
      return kopie;
    }
    return antwort;
  },
};
