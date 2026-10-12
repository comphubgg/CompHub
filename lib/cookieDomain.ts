/*
 * Eine Anmeldung fuer thecomphub.com UND www.thecomphub.com.
 *
 * Die Seite ist unter beiden Namen erreichbar, und keiner leitet auf den anderen um. Ein Cookie ohne Domain gehoert
 * nur dem Namen, unter dem es gesetzt wurde: wer sich unter www anmeldete und danach thecomphub.com aufrief (oder
 * umgekehrt), war abgemeldet - der Betreiber (12.10.2026): "wieso muss ich mich jedes Mal neu einloggen?". Mit der
 * Domain ".thecomphub.com" gilt die Anmeldung fuer beide. Auf localhost, im Netzwerk und bei netlify.app bleibt es
 * beim Cookie ohne Domain.
 */

import type { NextResponse } from 'next/server';

export function hostVon(request?: Request | null): string {
  if (!request) return '';
  return (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].split(':')[0].trim().toLowerCase();
}

/** `{ domain: '.thecomphub.com' }` auf der eigenen Domain, sonst nichts. */
export function sitzungsDomain(request?: Request | null): { domain?: string } {
  const h = hostVon(request);
  return h === 'thecomphub.com' || h.endsWith('.thecomphub.com') ? { domain: '.thecomphub.com' } : {};
}

/**
 * Das Cookie ohne Domain (aelterer Stand) wegraeumen, damit nicht zwei gleichnamige nebeneinander stehen - der
 * Browser schickt sonst beide, und der Server liest das erste.
 */
export function altesHostCookieWeg(antwort: NextResponse, request: Request | null | undefined, ...namen: string[]): void {
  if (!sitzungsDomain(request).domain) return;
  for (const n of namen) {
    antwort.headers.append('Set-Cookie', `${n}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
  }
}
