import type { NextRequest } from 'next/server';

/*
 * Unter welcher Adresse das Werkzeug gerade erreicht wurde.
 *
 * Fuer die Anmeldedienste ist das die entscheidende Frage. Twitch, Google und
 * Discord bekommen beim Hinweg einen Rueckweg mitgeteilt und pruefen ihn auf
 * das Zeichen genau gegen das, was in ihrer Verwaltung eingetragen ist.
 * Stimmt er nicht, kommt keine Anmeldung zustande, sondern "invalid request".
 *
 * Genau das war der Fehler: der Rueckweg wurde fest aus NEXT_PUBLIC_BASE_URL
 * gebildet, und dort stand "http://localhost:3000". Wer die Seite unter
 * thecomphub.com aufrief, schickte die Dienste also zu einem Rechner, den es
 * fuer sie nicht gibt. Umgekehrt haette ein fest eingetragenes
 * "https://thecomphub.com" die Anmeldung waehrend der Entwicklung
 * unbrauchbar gemacht.
 *
 * Deshalb entsteht die Adresse hier aus der Anfrage selbst. Dann gilt jeder
 * Weg, unter dem das Werkzeug wirklich erreichbar ist - der Rechner daheim
 * ebenso wie die Domain -, ohne dass jemand vorher etwas umstellt. Beim
 * Anbieter muessen dafuer beide Rueckwege hinterlegt sein; das ist dort
 * ausdruecklich vorgesehen und in einer Minute getan.
 *
 * NEXT_PUBLIC_BASE_URL bleibt trotzdem stehen und wird weiter gebraucht: fuer
 * die Sitemap, robots.txt und die Vorschaubilder gehoert die eine, feste
 * oeffentliche Adresse hin - dort waere "je nachdem, wer fragt" falsch.
 */

/**
 * Die Wurzel der Anfrage, ohne Schraegstrich am Ende.
 *
 * Hinter dem Cloudflare-Tunnel kommt die Anfrage als schlichtes HTTP auf dem
 * Rechner an; nach aussen ist sie verschluesselt. Der Vermerk
 * "x-forwarded-proto" traegt das urspruengliche Schema mit - ohne ihn wuerde
 * hier "http://thecomphub.com" entstehen, und daran scheitert die Pruefung
 * beim Anbieter genauso.
 */
export function wurzelVon(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host')
    || req.headers.get('host')
    || req.nextUrl.host;

  const gemeldet = (req.headers.get('x-forwarded-proto') || '')
    .split(',')[0].trim();

  // Ohne Vermerk entscheidet der Name: der eigene Rechner laeuft unverschluesselt,
  // alles andere ist heute verschluesselt erreichbar.
  const daheim = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
  const schema = gemeldet || (daheim ? 'http' : 'https');

  return `${schema}://${host}`;
}

/** Der Rueckweg eines Anmeldedienstes, etwa `/api/auth/google/callback`. */
export function rueckwegVon(req: NextRequest, pfad: string): string {
  return `${wurzelVon(req)}${pfad}`;
}
