import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  anlegen, merkeAnmeldung, nachDienst, nachEmail, SITZUNG_TAGE, sitzungFuer,
  verknuepfe,
} from '@/lib/konten';
import { ergaenzeAusDienst } from '@/lib/kontoErgaenzen';
import { ueberHttps } from '@/lib/vipCookie';
import { holeDienst } from '@/lib/dienstZugaenge';

// Der Rueckweg von Twitch.
//
// Bisher landete man hier im alten VIP-Zugang: die Anmeldung galt nur fuer
// eine kurze Liste freigeschalteter Namen und legte kein CompHub-Konto an.
// Wer sich also "mit Twitch registrieren" wollte, bekam am Ende gar kein
// Konto. Jetzt laeuft es wie bei Google.
//
// Drei Faelle, und die Reihenfolge entscheidet:
//
//   1. Dieses Twitch-Konto ist schon verknuepft -> anmelden.
//   2. Die Adresse gibt es bereits, aber ohne Twitch -> verknuepfen und
//      anmelden. Sonst haette derselbe Mensch zwei Konten, nur weil er
//      einmal ein Passwort und einmal Twitch benutzt hat.
//   3. Weder noch -> Konto anlegen.
//
// Ohne Adresse geht nichts: das Konto wird ueber die E-Mail gefuehrt, und
// eine erfundene Adresse waere schlimmer als eine klare Absage. Twitch gibt
// sie nur mit dem Recht "user:read:email" heraus, das der Hinweg anfordert.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

function wurzel(req: NextRequest) {
  const basis = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  // Ohne den Schraegstrich am Ende: steht dort "http://localhost:3000/",
  // entstuende sonst "localhost:3000//api/…" - und das stimmt mit keiner bei
  // Twitch hinterlegten Adresse ueberein.
  return basis ? basis.replace(/\/+$/, '') : req.nextUrl.origin;
}

function weiterleitung(req: NextRequest) {
  return `${wurzel(req)}/api/auth/twitch/callback`;
}

function zurueck(req: NextRequest, ziel: string) {
  return NextResponse.redirect(`${wurzel(req)}${ziel}`);
}

export async function GET(req: NextRequest) {
  // Zugangsdaten zur Laufzeit: eingetragen schlaegt Umgebung.
  const { id: CLIENT_ID, secret: CLIENT_SECRET } = await holeDienst('twitch');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const gemerkt = req.cookies.get('twitch_oauth_state')?.value;

  if (!code) return zurueck(req, '/anmelden?fehler=abgebrochen');

  /*
   * Der state-Vergleich. Zeitkonstant, damit die Laufzeit nicht verraet, wie
   * weit ein Rateversuch gekommen ist - und beide Werte muessen da sein,
   * sonst wuerde ein fehlendes Cookie den Vergleich ueberspringen.
   */
  if (!state || !gemerkt || state.length !== gemerkt.length
      || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(gemerkt))) {
    return zurueck(req, '/anmelden?fehler=state');
  }

  try {
    const tokenAntwort = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: weiterleitung(req),
      }),
    });
    if (!tokenAntwort.ok) return zurueck(req, '/anmelden?fehler=token');
    const token = await tokenAntwort.json() as { access_token?: string };
    if (!token.access_token) return zurueck(req, '/anmelden?fehler=token');

    // Twitch verlangt beides: den Schluessel der Anwendung und das Token.
    const nutzerAntwort = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'Client-Id': CLIENT_ID,
      },
    });
    if (!nutzerAntwort.ok) return zurueck(req, '/anmelden?fehler=profil');
    const daten = await nutzerAntwort.json() as {
      data?: Array<{ id?: string; login?: string; display_name?: string; email?: string;
        profile_image_url?: string }>;
    };
    const nutzer = daten.data?.[0];
    if (!nutzer?.id) return zurueck(req, '/anmelden?fehler=profil');

    // Wer die Freigabe fuer die Adresse verweigert, kann kein Konto bekommen.
    // Das wird gesagt, statt eine Adresse zu erfinden.
    if (!nutzer.email) return zurueck(req, '/anmelden?fehler=keine-email');

    // 1. Schon verknuepft?
    let konto = await nachDienst('twitch', nutzer.id);

    // 2. Adresse bekannt, aber ohne Twitch?
    if (!konto) {
      const vorhanden = await nachEmail(nutzer.email);
      if (vorhanden) konto = await verknuepfe(vorhanden.id, 'twitch', nutzer.id);
    }

    // 3. Neu.
    if (!konto) {
      const ergebnis = await anlegen({
        email: nutzer.email,
        name: nutzer.display_name || nutzer.login || nutzer.email.split('@')[0],
        dienst: { art: 'twitch', id: nutzer.id },
      });
      if ('fehler' in ergebnis) return zurueck(req, '/anmelden?fehler=konto');
      konto = ergebnis.konto;
    }

    await merkeAnmeldung(konto.id);
    // Was Twitch ohnehin mitliefert, gleich ins Profil - aber nur, wo dort
    // noch nichts steht. Siehe lib/kontoErgaenzen.ts.
    await ergaenzeAusDienst(konto.id, {
      netz: 'twitch',
      name: nutzer.login || nutzer.display_name,
      bildUrl: nutzer.profile_image_url,
    });
    const antwort = zurueck(req, '/konto');
    antwort.cookies.set(COOKIE, sitzungFuer(konto.id), {
      httpOnly: true, sameSite: 'lax', path: '/',
      secure: ueberHttps(req),
      maxAge: SITZUNG_TAGE * 24 * 3600,
    });
    antwort.cookies.set('twitch_oauth_state', '', { path: '/', maxAge: 0 });
    return antwort;
  } catch {
    return zurueck(req, '/anmelden?fehler=unerwartet');
  }
}
