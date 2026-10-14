import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { aendern, kontoAus, nachEpicId, nachId } from '@/lib/konten';
import { holeDienst } from '@/lib/dienstZugaenge';
import { dienstWurzel } from '@/lib/oeffentlicheAdresse';
import { GAST_COOKIE, gastWert } from '@/lib/epicGast';
import { EPIC_BEREICHE } from '@/lib/epicBereiche';

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

/** Die Epic-Freunde eines Kontos (Konto-Ids ohne Striche) - oder null, wenn Epic die Liste nicht herausgibt. */
async function holeFreunde(epicId: string, zugriff: string | undefined): Promise<string[] | null> {
  const liste = await fetch(`https://api.epicgames.dev/epic/friends/v1/${epicId}/friends`, {
    headers: { Authorization: `Bearer ${zugriff ?? ''}` },
  });
  if (!liste.ok) return null;
  const roh = await liste.json().catch(() => null) as unknown;
  const eintraege: unknown[] = Array.isArray(roh) ? roh : Array.isArray((roh as { friends?: unknown[] } | null)?.friends) ? (roh as { friends: unknown[] }).friends : [];
  return [...new Set(eintraege.map((f) => String(typeof f === 'string' ? f : ((f as { accountId?: string; id?: string })?.accountId ?? (f as { id?: string })?.id ?? ''))
    .replace(/-/g, '').toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x)))];
}

export async function GET(req: NextRequest) {
  const { id: CLIENT_ID, secret: CLIENT_SECRET } = await holeDienst('epic');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const gemerkt = req.cookies.get('epic_oauth_state')?.value;

  const kontoId = kontoAus(req.cookies.get(COOKIE)?.value);
  const konto = kontoId ? await nachId(kontoId) : null;
  // Wohin es zurueckgeht: die Seite, von der der Spieler kam (epic_rueck), sonst das Dashboard.
  const rueckCookie = req.cookies.get('epic_rueck')?.value ?? '';
  const heim = rueckCookie.startsWith('/') && !rueckCookie.startsWith('//') && rueckCookie.split('').every((c) => /[a-z0-9/_-]/i.test(c)) ? rueckCookie : '/account';
  const aufraeumen = (a: NextResponse) => {
    for (const k of ['epic_oauth_state', 'epic_oauth_art', 'epic_rueck']) a.cookies.set(k, '', { path: '/', maxAge: 0 });
    return a;
  };

  if (!code) {
    const grund = req.nextUrl.searchParams.get('error_description')
      || req.nextUrl.searchParams.get('error') || '';
    const anhang = grund ? `&grund=${encodeURIComponent(grund.slice(0, 200))}` : '';
    return aufraeumen(zurueck(`${heim}?epic=abgebrochen${anhang}`));
  }
  if (!state || !gemerkt || state.length !== gemerkt.length
      || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(gemerkt))) {
    return zurueck(`${heim}?epic=state`);
  }
  if (!CLIENT_ID || !CLIENT_SECRET) return zurueck(`${heim}?epic=nicht-eingerichtet`);

  try {
    // Der Austausch von Code gegen Token - mit denselben Berechtigungen wie der Hinweg (lib/epicBereiche).
    const anfordern = (mitBereichen: boolean) => fetch('https://api.epicgames.dev/epic/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        ...(mitBereichen ? { scope: EPIC_BEREICHE } : {}),
        redirect_uri: `${dienstWurzel(req)}/api/auth/epic/callback`,
      }),
    });
    /** Epics Begruendung aus einer abgelehnten Antwort (nie Zugangsdaten): Fehlercode und Text. */
    const begruendung = async (a: Response) => {
      const j = await a.json().catch(() => null) as Record<string, unknown> | null;
      const teile = [j?.errorCode, j?.error, j?.errorMessage, j?.error_description, j?.message].filter((x) => typeof x === 'string') as string[];
      return (teile.length ? teile.join(' - ') : `HTTP ${a.status}`).slice(0, 200);
    };
    let tokenAntwort = await anfordern(true);
    let epicGrund = '';
    if (!tokenAntwort.ok) {
      epicGrund = await begruendung(tokenAntwort);
      // Nur wenn Epic an den Berechtigungen im Austausch Anstoss nimmt, noch einmal ohne sie (der Code ist sonst verbraucht).
      if (/scope/i.test(epicGrund)) {
        tokenAntwort = await anfordern(false);
        if (!tokenAntwort.ok) epicGrund = await begruendung(tokenAntwort);
      }
    }
    if (!tokenAntwort.ok) {
      console.warn(`[epic] Token-Austausch abgelehnt: ${epicGrund}`);
      return aufraeumen(zurueck(`${heim}?epic=token&grund=${encodeURIComponent(epicGrund)}`));
    }
    const token = await tokenAntwort.json() as { access_token?: string; account_id?: string };

    let epicId = String(token.account_id ?? '');
    if (!epicId && token.access_token) {
      const info = await fetch('https://api.epicgames.dev/epic/oauth/v2/userInfo', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (info.ok) epicId = String(((await info.json()) as { sub?: string }).sub ?? '');
    }
    epicId = epicId.replace(/-/g, '').toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(epicId)) return aufraeumen(zurueck(`${heim}?epic=profil`));

    // Der Weg "Freunde freigeben" (app/api/auth/epic/freunde): dasselbe Epic-Konto, dazu die Freundesliste mit Epics Zustimmung.
    if (req.cookies.get('epic_oauth_art')?.value === 'freunde') {
      if (!konto || konto.gesperrt) return aufraeumen(zurueck('/sign-in'));
      const loeschen = (a: NextResponse) => {
        a.cookies.set('epic_oauth_state', '', { path: '/', maxAge: 0 });
        a.cookies.set('epic_oauth_art', '', { path: '/', maxAge: 0 });
        return a;
      };
      if (!konto.epicVerifiziert || konto.epicId !== epicId) return loeschen(zurueck('/account?epic=freunde-anderes-konto'));
      const ids = await holeFreunde(epicId, token.access_token);
      if (!ids) return loeschen(zurueck('/account?epic=freunde-fehler'));
      await aendern(konto.id, { epicFreunde: ids, epicFreundeStand: Date.now() });
      return loeschen(zurueck('/account?epic=freunde'));
    }

    // Ohne CompHub-Konto: die Verifizierung gilt als signierter Cookie (lib/epicGast) - wie bei Osirion braucht es kein Konto dafuer.
    if (!konto || konto.gesperrt) {
      const antwort = aufraeumen(zurueck(`${heim}?epic=verbunden`));
      antwort.cookies.set(GAST_COOKIE, gastWert(epicId), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 400 * 24 * 3600 }); // 400 Tage: mehr erlauben Browser nicht - die Verifizierung bleibt, bis jemand sie trennt
      return antwort;
    }

    const anderes = await nachEpicId(epicId);
    if (anderes && anderes.id !== konto.id) return aufraeumen(zurueck(`${heim}?epic=vergeben`));
    if (konto.epicId && konto.epicId !== epicId && !konto.epicVerifiziert) {
      // Der Betreiber hat eine andere Id zugewiesen - die gilt weiter.
      return aufraeumen(zurueck(`${heim}?epic=zugewiesen`));
    }

    await aendern(konto.id, { epicId, epicVerifiziert: true });
    // Die Freundesliste kommt mit denselben Berechtigungen mit (lib/epicBereiche) - gleich mitnehmen; scheitert das, bleibt die Verknuepfung gueltig.
    const freunde = await holeFreunde(epicId, token.access_token).catch(() => null);
    if (freunde) await aendern(konto.id, { epicFreunde: freunde, epicFreundeStand: Date.now() }).catch(() => undefined);
    // Kam der Spieler von einer Cup-Seite ("Verify with Epic Games"), geht er dorthin zurueck.
    return aufraeumen(zurueck(`${heim}?epic=verbunden`));
  } catch {
    return aufraeumen(zurueck(`${heim}?epic=unerwartet`));
  }
}
