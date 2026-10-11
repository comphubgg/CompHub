import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { aendern, kontoAus, nachEpicId, nachId } from '@/lib/konten';
import { holeDienst } from '@/lib/dienstZugaenge';
import { dienstWurzel } from '@/lib/oeffentlicheAdresse';

// Der Rueckweg von Epic Games - die Verknuepfung wird hier festgemacht.
//
// Epic sagt nach der Zustimmung, wem das Konto gehoert (account_id). Diese Id
// wird am eingeloggten CompHub-Konto gespeichert und als "von Epic bestaetigt"
// markiert. Zwei Dinge werden nicht zugelassen:
//
//   * Eine Epic-Id, die schon an einem anderen CompHub-Konto haengt - sonst
//     koennte sich jemand mit zwei Konten auf demselben Spieler anmelden.
//   * Ein Konto, dem der Betreiber schon eine andere Id zugewiesen hat - die
//     Zuweisung des Betreibers bleibt, bis er sie selbst aendert.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

function zurueck(ziel: string) {
  return new NextResponse(null, { status: 307, headers: { Location: ziel } });
}

export async function GET(req: NextRequest) {
  const { id: CLIENT_ID, secret: CLIENT_SECRET } = await holeDienst('epic');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const gemerkt = req.cookies.get('epic_oauth_state')?.value;

  const kontoId = kontoAus(req.cookies.get(COOKIE)?.value);
  const konto = kontoId ? await nachId(kontoId) : null;
  if (!konto || konto.gesperrt) return zurueck('/sign-in');

  if (!code) {
    const grund = req.nextUrl.searchParams.get('error_description')
      || req.nextUrl.searchParams.get('error') || '';
    const anhang = grund ? `&grund=${encodeURIComponent(grund.slice(0, 200))}` : '';
    return zurueck(`/account?epic=abgebrochen${anhang}`);
  }
  if (!state || !gemerkt || state.length !== gemerkt.length
      || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(gemerkt))) {
    return zurueck('/account?epic=state');
  }
  if (!CLIENT_ID || !CLIENT_SECRET) return zurueck('/account?epic=nicht-eingerichtet');

  try {
    const tokenAntwort = await fetch('https://api.epicgames.dev/epic/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        scope: 'basic_profile',
        redirect_uri: `${dienstWurzel(req)}/api/auth/epic/callback`,
      }),
    });
    if (!tokenAntwort.ok) return zurueck('/account?epic=token');
    const token = await tokenAntwort.json() as { access_token?: string; account_id?: string };

    let epicId = String(token.account_id ?? '');
    if (!epicId && token.access_token) {
      const info = await fetch('https://api.epicgames.dev/epic/oauth/v2/userInfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (info.ok) epicId = String(((await info.json()) as { sub?: string }).sub ?? '');
    }
    epicId = epicId.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(epicId)) return zurueck('/account?epic=profil');

    const anderes = await nachEpicId(epicId);
    if (anderes && anderes.id !== konto.id) return zurueck('/account?epic=vergeben');
    if (konto.epicId && konto.epicId !== epicId && !konto.epicVerifiziert) {
      // Der Betreiber hat eine andere Id zugewiesen - die gilt weiter.
      return zurueck('/account?epic=zugewiesen');
    }

    await aendern(konto.id, { epicId, epicVerifiziert: true });
    const antwort = zurueck('/account?epic=verbunden');
    antwort.cookies.set('epic_oauth_state', '', { path: '/', maxAge: 0 });
    return antwort;
  } catch {
    return zurueck('/account?epic=unerwartet');
  }
}
