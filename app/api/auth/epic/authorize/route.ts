import crypto from 'crypto';
import { sitzungsDomain } from '@/lib/cookieDomain';
import { NextRequest, NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { EPIC_BEREICHE } from '@/lib/epicBereiche';


// Der Hinweg zu Epic Games - zum Verknuepfen des eigenen Epic-Kontos.
//
// Anders als Discord, Twitch und Google ist das hier keine Anmeldung, sondern
// ein Beweis: wer bei Epic eingeloggt ist und zustimmt, bekommt von Epic die
// Konto-Id mitgeteilt. Genau diese Id steht in jedem Replay und in jeder
// Bestenliste. Mit CompHub-Konto wird die Id am Konto gespeichert (Dashboard); ohne Konto
// gilt sie als signierter Cookie (lib/epicGast). Beides liefert eine Id, die niemand eintippen oder
// verfaelschen kann.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PFAD = '/api/auth/epic/callback';

/** Wohin es nach der Verknuepfung zurueckgeht: nur eine Adresse dieser Seite, ohne Anhang (wie die Anmeldung es auch verlangt). */
const sichererPfad = (p: string | null) => (p && /^\/[a-z0-9/_-]*$/i.test(p) && !p.startsWith('//') ? p : '');

export async function GET(req: NextRequest) {
  // Auch ohne CompHub-Konto: wer sich nur bei Epic verifiziert, sieht seine Werte (der Rueckweg legt dann einen signierten Cookie an,
  // lib/epicGast) - der Betreiber (13.10.2026): "ich soll nicht auf die Login-Page kommen, sondern zu Epic".
  const zurueck = sichererPfad(req.nextUrl.searchParams.get('zurueck'));

  const { id: CLIENT_ID } = await holeDienst('epic');
  if (!CLIENT_ID) {
    return new NextResponse(null, { status: 307, headers: { Location: '/account?epic=nicht-eingerichtet' } });
  }

  // Anderes Epic-Konto verbinden (Betreiber, 20.10.2026): Epic soll die Anmeldung noch einmal verlangen, statt das bereits eingeloggte Konto zu nehmen.
  const anderes = req.nextUrl.searchParams.get('anderes') === '1';
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    // Alle im Epic-Portal freigeschalteten Berechtigungen auf einmal - sonst meldet Epic "Fehlende Berechtigungen" (lib/epicBereiche).
    scope: EPIC_BEREICHE,
    redirect_uri: rueckwegVon(req, PFAD),
    state,
    ...(anderes ? { prompt: 'login' } : {}),
  });
  const antwort = NextResponse.redirect(`https://www.epicgames.com/id/authorize?${params.toString()}`);
  // Ein liegengebliebener Freunde-Weg darf das normale Verknuepfen nicht auf die Freundesliste umstellen.
  // Fuer beide Adressen (mit und ohne www) - wie app/api/auth/epic/freunde; Epic kommt auf der eingetragenen Adresse zurueck.
  const dom = sitzungsDomain(req);
  antwort.cookies.set('epic_oauth_art', '', { ...dom, path: '/', maxAge: 0 });
  if (dom.domain) antwort.headers.append('Set-Cookie', 'epic_oauth_art=; Path=/; Max-Age=0');
  if (zurueck) antwort.cookies.set('epic_rueck', zurueck, { ...dom, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  else antwort.cookies.set('epic_rueck', '', { ...dom, path: '/', maxAge: 0 });
  antwort.cookies.set('epic_oauth_state', state, {
    ...dom, httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 600,
  });
  return antwort;
}
