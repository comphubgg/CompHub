import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';

// Der Hinweg zu Discord.
//
// Zwei Dinge waren hier kaputt:
//
//   * Es wurde kein state-Cookie gesetzt. Damit konnte der Rueckweg gar
//     nicht pruefen, ob die Antwort zu dieser Anfrage gehoert - jeder
//     untergeschobene Rueckweg waere durchgegangen.
//   * Die Berechtigung lief durch die Uebersetzungstabelle. Steht dort
//     eines Tages ein Eintrag zu diesem Schluessel, verlangt CompHub bei
//     Discord eine Berechtigung, die es nicht gibt, und die Anmeldung
//     bricht ab. Berechtigungen sind Namen einer fremden Schnittstelle und
//     gehoeren nie uebersetzt.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Client-Id kommt zur Laufzeit aus der Ablage (oder der Umgebung).
const PFAD = '/api/auth/discord/callback';

function weiterleitung(req: NextRequest) {
  const basis = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  // Ohne den Schraegstrich am Ende, sonst entstuende "…:3000//api/…" und das
  // stimmt mit keiner bei Discord hinterlegten Adresse ueberein.
  if (basis) return `${basis.replace(/\/+$/, '')}${PFAD}`;

  const protokoll = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  if (host) return `${protokoll}://${host}${PFAD}`;

  return `${req.nextUrl.origin}${PFAD}`;
}

export async function GET(req: NextRequest) {
  const { id: CLIENT_ID } = await holeDienst('discord');
  if (!CLIENT_ID) {
    return new NextResponse('Discord OAuth ist nicht eingerichtet.', { status: 500 });
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: weiterleitung(req),
    response_type: 'code',
    // "identify" fuer Name und Id, "email" fuer die Adresse, ueber die das
    // Konto gefuehrt wird. Beide als feste Zeichenkette.
    scope: 'identify email',
    state,
    prompt: 'consent',
  });

  const antwort = NextResponse.redirect(
    `https://discord.com/api/oauth2/authorize?${params.toString()}`);
  antwort.cookies.set('discord_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 300,
  });
  return antwort;
}
