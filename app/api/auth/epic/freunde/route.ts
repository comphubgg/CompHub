import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { aendern, kontoAus, nachId } from '@/lib/konten';
import { vipAus } from '@/lib/vipCookie';
import { sitzungsDomain } from '@/lib/cookieDomain';
import { zugangNach } from '@/lib/vipZugaenge';
import { holeDienst } from '@/lib/dienstZugaenge';
import { rueckwegVon } from '@/lib/oeffentlicheAdresse';
import { EPIC_BEREICHE } from '@/lib/epicBereiche';
import { vollstaendigeFreunde } from '@/lib/epicFreundeStatus';

/** Gespeicherte Freigabe plus - fuer das Konto des Betreibers - die ganze Liste von Epic (lib/epicFreundeStatus). */
async function mitVoller(ids: string[] | undefined, ich: string | null | undefined): Promise<string[]> {
  const voll = await vollstaendigeFreunde(ich).catch(() => null);
  return [...new Set([...(ids ?? []), ...(voll ?? [])])];
}

// Die Epic-Freundesliste fuer das Freunde-Leaderboard.
//
//   GET ?start=1  -> zu Epic: der Spieler stimmt der Freundesliste zu (Epic-Berechtigung "friends_list")
//   GET           -> die freigegebenen Freunde dieses Kontos: { ids, stand }
//   DELETE        -> die gespeicherte Liste loeschen
//
// Der Betreiber (4.10./13.10.2026): unter dem Leaderboard zwischen allen und "Friends" umschalten, um zu sehen, wie die Freunde platziert
// sind - wie bei Osirion. Die Zustimmung ist ein eigener Schritt, getrennt von "Mit Epic Games verbinden": Epic muss die Berechtigung fuer
// die Anwendung freigeschaltet haben (Epic-Portal, Epic-Konto-Dienste, Berechtigungen - "Friends"), sonst lehnt es die Anfrage ab, und
// das Verknuepfen des eigenen Kontos darf daran nicht scheitern.
//
// Zurueck vom Hinweg kommt der Spieler ueber denselben Rueckweg wie beim Verknuepfen (app/api/auth/epic/callback) - dort wird, erkennbar
// am Cookie epic_oauth_art, die Liste geholt und am Konto gespeichert.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

async function konto(req: NextRequest) {
  const id = kontoAus(req.cookies.get(COOKIE)?.value);
  const k = id ? await nachId(id) : null;
  return k && !k.gesperrt ? k : null;
}

export async function GET(req: NextRequest) {
  const k = await konto(req);
  // Mit Schluessel angemeldet: die Freunde stehen am Zugang (app/api/auth/epic/callback).
  const schluessel = !k ? vipAus(req.cookies.get('streamer_dashboard_auth')?.value) : null;
  const z = schluessel ? await zugangNach(schluessel) : null;
  if (!k && z && z.status === 'active') {
    if (!req.nextUrl.searchParams.get('start')) {
      const ich = z.epicVerifiziert ? z.epicId ?? null : null;
      return NextResponse.json({ ok: true, ids: await mitVoller(z.epicFreunde, ich), stand: z.epicFreundeStand ?? null, ich }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }
  if (!k && !(z && z.status === 'active')) {
    if (req.nextUrl.searchParams.get('start')) return new NextResponse(null, { status: 307, headers: { Location: '/sign-in' } });
    return NextResponse.json({ ok: false, ids: [] }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  if (req.nextUrl.searchParams.get('start')) {
    // (Mit Schluessel: k ist leer, der Zugang z traegt die Bestaetigung - der Callback erkennt ihn am Schluessel-Cookie.)
    // Ohne Verifizierung nicht mehr erst ins Konto (Betreiber, 30.10.2026: Friends ging "immer noch nicht"): derselbe Weg verifiziert und holt die Freunde.
    const { id: CLIENT_ID } = await holeDienst('epic');
    if (!CLIENT_ID) return new NextResponse(null, { status: 307, headers: { Location: '/account?epic=nicht-eingerichtet' } });
    const state = crypto.randomUUID();
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      scope: EPIC_BEREICHE,
      redirect_uri: rueckwegVon(req, '/api/auth/epic/callback'),
      state,
    });
    const antwort = NextResponse.redirect(`https://www.epicgames.com/id/authorize?${params.toString()}`);
    // Fuer beide Adressen (mit und ohne www) - Epic kommt auf der eingetragenen zurueck, und das war nicht immer die, auf der der Knopf stand
    // (30.10.2026: 'Share now' endete mit ?epic=state).
    const optionen = { ...sitzungsDomain(req), httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 600 };
    antwort.cookies.set('epic_oauth_state', state, optionen);
    antwort.cookies.set('epic_oauth_art', 'freunde', optionen);
    // Zurueck dorthin, wo der Knopf stand (z. B. die Bestenliste eines Cups) - nur eigene Pfade.
    const zurueck = req.nextUrl.searchParams.get('zurueck') ?? '';
    if (zurueck.startsWith('/') && !zurueck.startsWith('//') && zurueck.split('').every((c) => /[a-z0-9/_-]/i.test(c))) antwort.cookies.set('epic_rueck', zurueck, optionen);
    return antwort;
  }

  return NextResponse.json({
    ok: true,
    ids: await mitVoller(k!.epicFreunde, k!.epicVerifiziert ? k!.epicId : null),
    stand: k!.epicFreundeStand ?? null,
    // Das eigene Konto gehoert zum Freunde-Leaderboard dazu.
    ich: k!.epicId ?? null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function DELETE(req: NextRequest) {
  const k = await konto(req);
  if (!k) return NextResponse.json({ ok: false }, { status: 401 });
  await aendern(k.id, { epicFreunde: [], epicFreundeStand: 0 });
  return NextResponse.json({ ok: true });
}
