import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { holeDienst } from '@/lib/dienstZugaenge';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { sitzungsDomain } from '@/lib/cookieDomain';
import { CLIPS_SCOPES, einladungGueltig } from '@/lib/tiktokClips';

/*
 * Ein Streamer verbindet seinen Twitch-Kanal fuer die TikTok-Clips (lib/tiktokClips) - nur ueber einen Link, den der Admin erzeugt hat (seine Freigabe).
 * Fuehrt zu Twitch mit dem Recht channel:manage:clips; zurueck ueber den Rueckweg der Anmeldung (app/api/auth/twitch/callback), erkennbar am Cookie
 * twitch_oauth_art=clips. force_verify: Twitch fragt nach dem Konto - so verbindet sich der richtige Kanal.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code') ?? '';
  if (!(await einladungGueltig(code))) return NextResponse.redirect(new URL('/?tiktok-clips=link-ungueltig', req.url));
  const { id } = await holeDienst('twitch');
  if (!id) return NextResponse.redirect(new URL('/?tiktok-clips=fehler', req.url));
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: id, redirect_uri: rueckwegVon(req, '/api/auth/twitch/callback'), response_type: 'code', scope: CLIPS_SCOPES, state, force_verify: 'true',
  });
  const antwort = NextResponse.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
  const optionen = { ...sitzungsDomain(req), httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 };
  antwort.cookies.set('twitch_oauth_state', state, optionen);
  antwort.cookies.set('twitch_oauth_art', 'clips', optionen);
  antwort.cookies.set('tiktok_clips_code', code, optionen);
  return antwort;
}
