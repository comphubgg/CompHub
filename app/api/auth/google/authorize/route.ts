import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { holeDienst } from '@/lib/dienstZugaenge';

// Der Weg zu Google.
//
// Google verlangt eine "OAuth 2.0-Client-ID" - keinen API-Schluessel. Das
// ist ein haeufiger Irrtum: ein API-Schluessel oeffnet Googles eigene
// Dienste (Karten, Uebersetzung), er kann aber niemanden anmelden. Fuer
// "Mit Google anmelden" braucht es eine Client-ID samt Geheimnis, angelegt
// unter "Anmeldedaten" in der Google Cloud Console.
//
// Zwei Adressen muessen dort eingetragen sein:
//
//   Autorisierte JavaScript-Quelle   http://localhost:3000
//   Autorisierter Weiterleitungs-URI http://localhost:3000/api/auth/google/callback
//
// Der "state" ist kein Schmuck: er wandert als Cookie mit und wird beim
// Rueckweg verglichen. Ohne ihn koennte jemand einen Anmeldevorgang von
// aussen anstossen und den Nutzer in ein fremdes Konto setzen.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Zugangsdaten wie bei Twitch und Discord.
 *
 * Hier stand die Client-Id direkt aus process.env, und zwar auf Modulebene.
 * Das hatte zwei Folgen: was der Betreiber unter "Anmeldedienste" eintrug,
 * wurde bei Google stillschweigend ignoriert, und eine Aenderung an
 * .env.local wirkte erst nach einem Neustart. Die anderen beiden Dienste
 * fragen laengst holeDienst(); Google zog nach.
 */

export function weiterleitung(req: NextRequest) {
  return rueckwegVon(req, '/api/auth/google/callback');
}

export async function GET(req: NextRequest) {
  const { id: CLIENT_ID } = await holeDienst('google');
  if (!CLIENT_ID) {
    return NextResponse.json({
      error: 'Google ist nicht eingerichtet.',
      hinweis: 'In .env.local fehlen GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET. '
        + 'Beide entstehen in der Google Cloud Console unter '
        + '"APIs und Dienste → Anmeldedaten → OAuth-Client-ID erstellen" '
        + '— oder im Werkzeug unter Admin → Anmeldedienste.',
    }, { status: 503 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const ziel = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  ziel.searchParams.set('client_id', CLIENT_ID);
  ziel.searchParams.set('redirect_uri', weiterleitung(req));
  ziel.searchParams.set('response_type', 'code');
  // Nur was gebraucht wird: Adresse und Name. Kein Zugriff auf Mail,
  // Kalender oder Ablage - danach zu fragen waere ueberzogen.
  ziel.searchParams.set('scope', 'openid email profile');
  ziel.searchParams.set('state', state);
  // Ohne diese beiden fragt Google beim zweiten Mal nichts mehr und liefert
  // kein neues Token - fuer eine reine Anmeldung genuegt das zwar, aber so
  // ist das Verhalten bei jedem Durchgang dasselbe.
  ziel.searchParams.set('prompt', 'select_account');

  const antwort = NextResponse.redirect(ziel.toString());
  antwort.cookies.set('google_oauth_state', state, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 600,
    secure: process.env.NODE_ENV === 'production',
  });
  return antwort;
}
