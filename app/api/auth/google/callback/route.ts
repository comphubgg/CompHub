import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  anlegen, merkeAnmeldung, nachDienst, nachEmail, SITZUNG_TAGE, sitzungFuer,
  verknuepfe,
} from '@/lib/konten';
import { ueberHttps } from '@/lib/vipCookie';

// Der Rueckweg von Google.
//
// Drei Faelle, und die Reihenfolge entscheidet:
//
//   1. Dieses Google-Konto ist schon verknuepft -> anmelden.
//   2. Die Adresse gibt es bereits, aber ohne Google -> verknuepfen und
//      anmelden. Sonst haette derselbe Mensch zwei Konten, nur weil er
//      einmal ein Passwort und einmal Google benutzt hat.
//   3. Weder noch -> Konto anlegen. Die Adresse gilt sofort als bestaetigt;
//      Google laesst niemanden mit einer fremden Adresse herein.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const COOKIE = 'streamer_dashboard_konto';

function weiterleitung(req: NextRequest) {
  const basis = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const wurzel = basis ? basis.replace(/\/+$/, '') : req.nextUrl.origin;
  return `${wurzel}/api/auth/google/callback`;
}

function zurueck(req: NextRequest, ziel: string) {
  const basis = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const wurzel = basis ? basis.replace(/\/+$/, '') : req.nextUrl.origin;
  return NextResponse.redirect(`${wurzel}${ziel}`);
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const gemerkt = req.cookies.get('google_oauth_state')?.value;

  if (!code) return zurueck(req, '/anmelden?fehler=abgebrochen');

  /*
   * Der state-Vergleich. Zeitkonstant, damit die Laufzeit nicht verraet,
   * wie weit ein Rateversuch gekommen ist - und beide Werte muessen da
   * sein, sonst wuerde ein fehlendes Cookie den Vergleich ueberspringen.
   */
  if (!state || !gemerkt || state.length !== gemerkt.length
      || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(gemerkt))) {
    return zurueck(req, '/anmelden?fehler=state');
  }

  try {
    const tokenAntwort = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: weiterleitung(req),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenAntwort.ok) return zurueck(req, '/anmelden?fehler=token');
    const token = await tokenAntwort.json() as { access_token?: string };
    if (!token.access_token) return zurueck(req, '/anmelden?fehler=token');

    const nutzerAntwort = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!nutzerAntwort.ok) return zurueck(req, '/anmelden?fehler=profil');
    const nutzer = await nutzerAntwort.json() as {
      id?: string; email?: string; name?: string; verified_email?: boolean;
    };
    if (!nutzer.id || !nutzer.email) return zurueck(req, '/anmelden?fehler=profil');

    // 1. Schon verknuepft?
    let konto = await nachDienst('google', nutzer.id);

    // 2. Adresse bekannt, aber ohne Google?
    if (!konto) {
      const vorhanden = await nachEmail(nutzer.email);
      if (vorhanden) konto = await verknuepfe(vorhanden.id, 'google', nutzer.id);
    }

    // 3. Neu.
    if (!konto) {
      const ergebnis = await anlegen({
        email: nutzer.email,
        name: nutzer.name ?? nutzer.email.split('@')[0],
        dienst: { art: 'google', id: nutzer.id },
      });
      if ('fehler' in ergebnis) return zurueck(req, '/anmelden?fehler=konto');
      konto = ergebnis.konto;
    }

    await merkeAnmeldung(konto.id);
    const antwort = zurueck(req, '/konto');
    antwort.cookies.set(COOKIE, sitzungFuer(konto.id), {
      httpOnly: true, sameSite: 'lax', path: '/',
      secure: ueberHttps(req),
      maxAge: SITZUNG_TAGE * 24 * 3600,
    });
    antwort.cookies.set('google_oauth_state', '', { path: '/', maxAge: 0 });
    return antwort;
  } catch {
    return zurueck(req, '/anmelden?fehler=unerwartet');
  }
}
