import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { kontoAus, nachId } from '@/lib/konten';

// Der Hinweg zu Epic Games - zum Verknuepfen des eigenen Epic-Kontos.
//
// Anders als Discord, Twitch und Google ist das hier keine Anmeldung, sondern
// ein Beweis: wer bei Epic eingeloggt ist und zustimmt, bekommt von Epic die
// Konto-Id mitgeteilt. Genau diese Id steht in jedem Replay und in jeder
// Bestenliste. Deshalb braucht der Weg ein CompHub-Konto (wer sich verknuepft,
// muss schon eingeloggt sein) und liefert eine Id, die niemand eintippen oder
// verfaelschen kann.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PFAD = '/api/auth/epic/callback';
const COOKIE = 'streamer_dashboard_konto';

/** Wohin es nach der Verknuepfung zurueckgeht: nur eine Adresse dieser Seite, ohne Anhang (wie die Anmeldung es auch verlangt). */
const sichererPfad = (p: string | null) => (p && /^\/[a-z0-9/_-]*$/i.test(p) && !p.startsWith('//') ? p : '');

export async function GET(req: NextRequest) {
  const zurueck = sichererPfad(req.nextUrl.searchParams.get('zurueck'));
  const kontoId = kontoAus(req.cookies.get(COOKIE)?.value);
  const konto = kontoId ? await nachId(kontoId) : null;
  if (!konto || konto.gesperrt) {
    // Wer von einer Cup-Seite kommt, geht nach der Anmeldung dorthin zurueck und kann von dort verifizieren.
    return new NextResponse(null, { status: 307, headers: { Location: zurueck ? `/sign-in?weiter=${encodeURIComponent(zurueck)}` : '/sign-in' } });
  }

  const { id: CLIENT_ID } = await holeDienst('epic');
  if (!CLIENT_ID) {
    return new NextResponse(null, { status: 307, headers: { Location: '/account?epic=nicht-eingerichtet' } });
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    // basic_profile: Epic nennt die Konto-Id und den Anzeigenamen - mehr wird nicht verlangt.
    scope: 'basic_profile',
    redirect_uri: rueckwegVon(req, PFAD),
    state,
  });
  const antwort = NextResponse.redirect(`https://www.epicgames.com/id/authorize?${params.toString()}`);
  // Ein liegengebliebener Freunde-Weg darf das normale Verknuepfen nicht auf die Freundesliste umstellen.
  antwort.cookies.set('epic_oauth_art', '', { path: '/', maxAge: 0 });
  if (zurueck) antwort.cookies.set('epic_rueck', zurueck, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 });
  else antwort.cookies.set('epic_rueck', '', { path: '/', maxAge: 0 });
  antwort.cookies.set('epic_oauth_state', state, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 600,
  });
  return antwort;
}
