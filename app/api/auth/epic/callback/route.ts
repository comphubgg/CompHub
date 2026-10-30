import crypto from 'crypto';
import { appendFileSync } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { aendern, kontoAus, merkeAnmeldung, nachEpicId, nachId, SITZUNG_TAGE, sitzungFuer } from '@/lib/konten';
import { altesHostCookieWeg, sitzungsDomain } from '@/lib/cookieDomain';
import { ueberHttps } from '@/lib/vipCookie';
import { holeDienst } from '@/lib/dienstZugaenge';
import { dienstWurzel } from '@/lib/oeffentlicheAdresse';
import { GAST_COOKIE, gastWert } from '@/lib/epicGast';
import { EPIC_BEREICHE } from '@/lib/epicBereiche';
import { merkeKonto } from '@/lib/eigeneAuswertung';

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
  // Jeder Ausgang ins Protokoll (nur das Ziel mit der Meldung, keine Schluessel) - 30.10.2026: 'Verify with Epic' endete still ohne Verbindung.
  try { appendFileSync(path.join(process.cwd(), 'epic-anmeldung.log'), `${new Date().toISOString()} -> ${ziel.slice(0, 200)}
`); } catch { /* ohne Protokoll weiter */ }
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
    // Der Name, den Epic gerade fuehrt - wer sich umbenannt hat, sieht ihn nach "Neu laden" hier.
    let epicName = '';
    if (token.access_token) {
      try {
        const info = await fetch('https://api.epicgames.dev/epic/oauth/v2/userInfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
        if (info.ok) epicName = String(((await info.json()) as { preferred_username?: string }).preferred_username ?? '').slice(0, 60);
      } catch { /* dann bleibt der Name aus dem Verzeichnis */ }
    }

    // Der Weg "Freunde freigeben" (app/api/auth/epic/freunde): dasselbe Epic-Konto, dazu die Freundesliste mit Epics Zustimmung.
    if (req.cookies.get('epic_oauth_art')?.value === 'freunde') {
      if (!konto || konto.gesperrt) return aufraeumen(zurueck('/sign-in'));
      const loeschen = (a: NextResponse) => {
        a.cookies.set('epic_oauth_state', '', { path: '/', maxAge: 0 });
        a.cookies.set('epic_oauth_art', '', { path: '/', maxAge: 0 });
        return a;
      };
      // Noch nicht verifiziert: hier gleich mit - solange das Epic-Konto dasselbe ist, das dem CompHub-Konto zugeordnet ist (oder noch keins).
      if (konto.epicId && konto.epicId !== epicId && (konto.epicVerifiziert || konto.rolle !== 'admin')) return aufraeumen(loeschen(zurueck('/account?epic=freunde-anderes-konto')));
      if (!konto.epicVerifiziert) {
        const anderes = await nachEpicId(epicId);
        if (anderes && anderes.id !== konto.id && konto.epicId !== epicId) return aufraeumen(loeschen(zurueck('/account?epic=vergeben')));
        await aendern(konto.id, { epicId, epicVerifiziert: true, ...(epicName ? { epicName } : {}) });
        await merkeKonto(epicId);
      }
      const ids = await holeFreunde(epicId, token.access_token);
      if (!ids) return aufraeumen(loeschen(zurueck(`${heim}?epic=freunde-fehler`)));
      await aendern(konto.id, { epicFreunde: ids, epicFreundeStand: Date.now() });
      return aufraeumen(loeschen(zurueck(`${heim}?epic=freunde`)));
    }

    // Wer sich verifiziert, dessen Cups werden von selbst ausgewertet (lib/eigeneAuswertung) - ohne dass er erst jeden Cup oeffnen muss.
    await merkeKonto(epicId);

    /*
     * Von der Anmeldeseite (Betreiber, 19.10.2026: "auf der Login-Seite Epic zum Verifizieren"): gehoert diese Epic-Id schon einem verifizierten
     * CompHub-Konto, ist der Besucher damit angemeldet - wie bei Discord und Twitch. Sonst bleibt es bei der Verifizierung ohne Konto.
     */
    if (!konto) {
      const eigenes = await nachEpicId(epicId);
      if (eigenes && !eigenes.gesperrt && eigenes.epicVerifiziert) {
        await merkeAnmeldung(eigenes.id);
        const eingeloggt = aufraeumen(zurueck(heim));
        altesHostCookieWeg(eingeloggt, req, COOKIE);
        eingeloggt.cookies.set(COOKIE, sitzungFuer(eigenes.id), {
          ...sitzungsDomain(req),
          httpOnly: true, sameSite: 'lax', path: '/',
          secure: ueberHttps(req),
          maxAge: SITZUNG_TAGE * 24 * 3600,
        });
        return eingeloggt;
      }
    }

    // Ohne CompHub-Konto: die Verifizierung gilt als signierter Cookie (lib/epicGast) - wie bei Osirion braucht es kein Konto dafuer.
    if (!konto || konto.gesperrt) {
      const antwort = aufraeumen(zurueck(`${heim}?epic=verbunden`));
      antwort.cookies.set(GAST_COOKIE, gastWert(epicId), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 400 * 24 * 3600 }); // 400 Tage: mehr erlauben Browser nicht - die Verifizierung bleibt, bis jemand sie trennt
      return antwort;
    }

    /*
     * Hat der Betreiber diesem Konto genau diese Epic-Id zugewiesen, gilt sie hier - auch wenn ein anderes (z. B. ein Pro-Testkonto) sie ebenfalls traegt
     * (30.10.2026: 'Verify with Epic' fuehrte zurueck, und es stand weiter 'nicht verbunden' - sein Admin-Konto und ein Pro-Testkonto hatten dieselbe Id).
     */
    const anderes = await nachEpicId(epicId);
    if (anderes && anderes.id !== konto.id && konto.epicId !== epicId) return aufraeumen(zurueck(`${heim}?epic=vergeben`));
    // Fuer den Admin selbst gilt, was er bei Epic bestaetigt (30.10.2026) - die Zuweisung haelt nur bei anderen Konten.
    if (konto.epicId && konto.epicId !== epicId && !konto.epicVerifiziert && konto.rolle !== 'admin') {
      // Der Betreiber hat eine andere Id zugewiesen - die gilt weiter.
      return aufraeumen(zurueck(`${heim}?epic=zugewiesen`));
    }

    await aendern(konto.id, { epicId, epicVerifiziert: true, ...(epicName ? { epicName } : {}) });
    // Die Freundesliste kommt mit denselben Berechtigungen mit (lib/epicBereiche) - gleich mitnehmen; scheitert das, bleibt die Verknuepfung gueltig.
    const freunde = await holeFreunde(epicId, token.access_token).catch(() => null);
    if (freunde) await aendern(konto.id, { epicFreunde: freunde, epicFreundeStand: Date.now() }).catch(() => undefined);
    // Kam der Spieler von einer Cup-Seite ("Verify with Epic Games"), geht er dorthin zurueck.
    return aufraeumen(zurueck(`${heim}?epic=verbunden`));
  } catch {
    return aufraeumen(zurueck(`${heim}?epic=unerwartet`));
  }
}
