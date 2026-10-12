/*
 * thecomphub.com -> zwei Netlify-Konten, je die Haelfte der Besucher - und fuer jeden Besucher das andere als Reserve.
 *
 * Warum: Netlify zaehlt im kostenlosen Tarif 300 Punkte im Monat (jeder Bau 15, dazu Datenverkehr und Funktionen).
 * Am 11.10.2026 waren sie auf dem ersten Konto aufgebraucht, und die Seite war aus. Der Betreiber (12.10.2026):
 * die Last auf zwei Konten teilen, "ein Account hat die Sachen und der andere hat die Sachen", damit es nicht
 * wieder ueberlastet. Beide Seiten sind derselbe Bau (der Montagslauf in .github/workflows/netlify-bereitstellen.yml
 * stellt beide bereit) und lesen dieselben Daten - es ist egal, auf welcher ein Besucher landet.
 *
 * So verteilt der Worker:
 *   - Jeder Besucher bekommt je nach Adresse (IP) fest die eine oder die andere Seite - so bleibt der Zwischenspeicher
 *     warm und die Hälfte der Anfragen geht an jedes Konto.
 *   - Antwortet seine Seite mit einem Fehler (503 "Site not available" bei aufgebrauchten Punkten, 5xx, 402), fragt der
 *     Worker automatisch die andere. Ein Konto darf also ganz ausfallen, ohne dass die Seite ausfaellt.
 *   - Der Rest der Domain bleibt unberuehrt: die Adresse thecomphub.com wird nie gegen eine netlify.app getauscht.
 *
 * Nicht auf Netlify moeglich (braucht einen dauernd laufenden Server): das Live-POV der Profis (/api/pov/senden und
 * /api/pov/strom). Wer das nutzt, braucht weiter den Rechner daheim hinter dem Tunnel - die Routen dafuer unten
 * (ZUHAUSE) ausnehmen oder auf den Tunnel legen.
 *
 * Einrichten (einmal, im Cloudflare-Dashboard):
 *   1. Workers & Pages -> Create -> Start with Hello World -> Deploy
 *   2. Edit code -> alles ersetzen durch diese Datei, die zwei Adressen unten pruefen -> Deploy
 *   3. Settings -> Domains & Routes -> Add -> Route:  *thecomphub.com/*   Zone: thecomphub.com
 *   4. DNS: bei den Eintraegen "thecomphub.com" und "www" die graue Wolke auf ORANGE stellen (Proxy),
 *      sonst laeuft der Worker nicht. SSL/TLS -> Overview -> "Full".
 *   Zum Rueckgaengigmachen: die Route in Schritt 3 loeschen.
 */

// Die beiden Netlify-Seiten - ohne https://.
const SEITEN = [
  'thecomphub.netlify.app',          // Konto 1
  'lambent-moxie-2dc34a.netlify.app', // Konto 2
];

/** Diese Pfade bleiben beim Rechner daheim (Tunnel) - sie brauchen einen dauernd laufenden Server. */
const ZUHAUSE = [/^\/api\/pov\/(senden|strom)/];
const ZUHAUSE_HOST = ''; // z. B. 'daheim.thecomphub.com' - leer lassen, solange es keinen eigenen Namen fuer den Tunnel gibt.

/** Eine kleine, stabile Zahl aus einem Text (FNV-1a). */
function streuwert(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Ist das ein Ausfall dieser Seite (nicht der Inhalt: ein 404 der Seite ist ein 404)? */
function istAusfall(status) {
  return status === 402 || status === 429 || status >= 500;
}

async function an(seite, request, url, koerper) {
  const ziel = new URL(request.url);
  ziel.protocol = 'https:';
  ziel.hostname = seite;
  ziel.port = '';
  const koepfe = new Headers(request.headers);
  // Die Seite baut ihre Adressen aus diesen Koepfen (Weiterleitungen, Links in Mails).
  koepfe.set('X-Forwarded-Host', url.hostname);
  koepfe.set('X-Forwarded-Proto', 'https');
  return fetch(new Request(ziel.toString(), {
    method: request.method, headers: koepfe, body: koerper, redirect: 'manual',
  }));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (ZUHAUSE_HOST && ZUHAUSE.some((r) => r.test(url.pathname))) {
      const ziel = new URL(request.url);
      ziel.hostname = ZUHAUSE_HOST;
      return fetch(new Request(ziel.toString(), request));
    }

    // Wer es sendet, kann nur einmal senden: den Koerper vorher lesen, damit die zweite Seite ihn auch bekommt.
    const hatKoerper = !['GET', 'HEAD'].includes(request.method);
    const koerper = hatKoerper ? await request.arrayBuffer() : undefined;

    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';
    const erste = streuwert(ip + (request.headers.get('User-Agent') || '')) % SEITEN.length;
    const reihenfolge = [SEITEN[erste], ...SEITEN.filter((_, i) => i !== erste)];

    let letzte = null;
    for (const seite of reihenfolge) {
      try {
        const antwort = await an(seite, request, url, koerper);
        if (!istAusfall(antwort.status)) {
          // Weiterleitungen, die auf eine netlify.app zeigen, wieder auf die eigene Domain biegen.
          const nach = antwort.headers.get('Location');
          if (nach && SEITEN.some((h) => nach.includes(h))) {
            const kopie = new Response(antwort.body, antwort);
            kopie.headers.set('Location', SEITEN.reduce((t, h) => t.split(h).join(url.host), nach));
            return kopie;
          }
          return antwort;
        }
        letzte = antwort;
      } catch { /* diese Seite ist nicht erreichbar - die naechste */ }
    }
    return letzte ?? new Response('CompHub is starting - please reload in a minute.', {
      status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' },
    });
  },
};
