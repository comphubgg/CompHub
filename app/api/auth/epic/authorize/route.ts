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

export async function GET(req: NextRequest) {
  const kontoId = kontoAus(req.cookies.get(COOKIE)?.value);
  const konto = kontoId ? await nachId(kontoId) : null;
  if (!konto || konto.gesperrt) {
    return new NextResponse(null, { status: 307, headers: { Location: '/sign-in' } });
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
  antwort.cookies.set('epic_oauth_state', state, {
    httpOnly: true, sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 600,
  });
  return antwort;
}
