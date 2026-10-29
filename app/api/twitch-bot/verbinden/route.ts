import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { wer } from '@/lib/pov';
import { BOT_SCOPES } from '@/lib/twitchBot';

/*
 * Das Bot-Konto mit CompHub verbinden (lib/twitchBot) - nur der Admin. Fuehrt zu Twitch mit den Rechten, die der Bot braucht (lesen, schreiben,
 * moderieren); zurueck kommt man ueber denselben Rueckweg wie bei der Anmeldung (app/api/auth/twitch/callback), erkennbar am Cookie twitch_oauth_art=bot.
 * "force_verify": Twitch fragt immer nach dem Konto - so meldet man sich als Bot an und nicht aus Versehen mit dem eigenen Kanal.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const ich = await wer();
  if (ich.rolle !== 'admin') return NextResponse.redirect(new URL('/twitch-bot?fehler=nur-admin', req.url));
  const { id } = await holeDienst('twitch');
  if (!id) return NextResponse.redirect(new URL('/twitch-bot?fehler=twitch', req.url));
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: id, redirect_uri: rueckwegVon(req, '/api/auth/twitch/callback'), response_type: 'code', scope: BOT_SCOPES, state, force_verify: 'true',
  });
  const antwort = NextResponse.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
  const optionen = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 };
  antwort.cookies.set('twitch_oauth_state', state, optionen);
  antwort.cookies.set('twitch_oauth_art', 'bot', optionen);
  return antwort;
}
