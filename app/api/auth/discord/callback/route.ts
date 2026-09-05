import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  anlegen, merkeAnmeldung, nachDienst, nachEmail, SITZUNG_TAGE, sitzungFuer,
  verknuepfe,
} from '@/lib/konten';
import { ergaenzeAusDienst } from '@/lib/kontoErgaenzen';
import { ueberHttps } from '@/lib/vipCookie';
import { holeDienst } from '@/lib/dienstZugaenge';
import { dienstWurzel } from '@/lib/oeffentlicheAdresse';

// Der Rueckweg von Discord.
//
// Wie bei Twitch fuehrte dieser Weg bisher in den alten VIP-Zugang und legte
// kein CompHub-Konto an. Jetzt laeuft er wie Google und Twitch.
//
// Drei Faelle, und die Reihenfolge entscheidet:
//
//   1. Dieses Discord-Konto ist schon verknuepft -> anmelden.
//   2. Die Adresse gibt es bereits, aber ohne Discord -> verknuepfen und
//      anmelden.
//   3. Weder noch -> Konto anlegen.
//
// Discord gibt die Adresse mit dem Recht "email" heraus und sagt dazu, ob
// sie bestaetigt ist. Eine unbestaetigte wird abgelehnt: sonst koennte
// jemand ein Discord-Konto mit fremder Adresse anlegen und darueber an ein
// CompHub-Konto kommen, das dieser Adresse gehoert.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COOKIE = 'streamer_dashboard_konto';

/*
 * Der Rueckweg fuer den Tausch des Codes.
 *
 * Er muss Zeichen fuer Zeichen derselbe sein wie der beim Hinweg genannte -
 * die Dienste pruefen das. Deshalb dieselbe Quelle wie dort: dienstWurzel,
 * also die feste oeffentliche Adresse. Aus wurzelVon(req) entstuende hier
 * "www.thecomphub.com", wenn jemand ueber www hereingekommen ist, und der
 * Tausch scheiterte mit "invalid request".
 */
function wurzel(req: NextRequest) {
  return dienstWurzel(req);
}

function weiterleitung(req: NextRequest) {
  return `${wurzel(req)}/api/auth/discord/callback`;
}

/*
 * Zurueck ins Werkzeug - mit einem relativen Ziel.
 *
 * NextResponse.redirect() verlangt eine vollstaendige Adresse und schreibt
 * sie danach auf die Adresse um, unter der der Server lauscht. Hinter dem
 * Tunnel ist das "0.0.0.0:3100": wer sich erfolgreich angemeldet hatte,
 * wurde also auf eine Adresse geschickt, die es nicht gibt - die Anmeldung
 * sah dadurch aus, als waere sie fehlgeschlagen.
 *
 * Ein relatives Ziel loest der Browser gegen die Adresse auf, die er offen
 * hat. Damit landet jeder wieder dort, wo er hergekommen ist.
 */
function zurueck(_req: NextRequest, ziel: string) {
  return new NextResponse(null, { status: 307, headers: { Location: ziel } });
}

export async function GET(req: NextRequest) {
  // Zugangsdaten zur Laufzeit: eingetragen schlaegt Umgebung.
  const { id: CLIENT_ID, secret: CLIENT_SECRET } = await holeDienst('discord');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const gemerkt = req.cookies.get('discord_oauth_state')?.value;

  /*
   * Warum kein Code kam.
   *
   * Ohne Code hiess es hier frueher schlicht "abgebrochen" - und das sah aus,
   * als haette der Nutzer selbst abgebrochen. Meistens hat aber der Dienst
   * abgelehnt und den Grund mitgeschickt: ein Rueckweg, der dort nicht
   * eingetragen ist, eine gesperrte Anwendung, eine fehlende Freigabe. Diesen
   * Grund zu verschlucken macht die Fehlersuche unnoetig schwer, deshalb
   * wandert er sichtbar in die Adresse.
   */
  if (!code) {
    const grund = req.nextUrl.searchParams.get('error')
      || req.nextUrl.searchParams.get('error_description') || '';
    const anhang = grund ? `&grund=${encodeURIComponent(grund.slice(0, 200))}` : '';
    return zurueck(req, `/anmelden?fehler=abgebrochen&dienst=discord${anhang}`);
  }

  if (!state || !gemerkt || state.length !== gemerkt.length
      || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(gemerkt))) {
    return zurueck(req, '/anmelden?fehler=state');
  }

  try {
    const tokenAntwort = await fetch('https://discord.com/api/oauth2/token', {
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

    const nutzerAntwort = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!nutzerAntwort.ok) return zurueck(req, '/anmelden?fehler=profil');
    const nutzer = await nutzerAntwort.json() as {
      id?: string; username?: string; global_name?: string;
      email?: string; verified?: boolean; avatar?: string | null;
    };
    if (!nutzer.id) return zurueck(req, '/anmelden?fehler=profil');
    if (!nutzer.email) return zurueck(req, '/anmelden?fehler=keine-email');
    if (nutzer.verified === false) {
      return zurueck(req, '/anmelden?fehler=email-unbestaetigt');
    }

    // 1. Schon verknuepft?
    let konto = await nachDienst('discord', nutzer.id);

    // 2. Adresse bekannt, aber ohne Discord?
    if (!konto) {
      const vorhanden = await nachEmail(nutzer.email);
      if (vorhanden) konto = await verknuepfe(vorhanden.id, 'discord', nutzer.id);
    }

    // 3. Neu.
    if (!konto) {
      const ergebnis = await anlegen({
        email: nutzer.email,
        name: nutzer.global_name || nutzer.username || nutzer.email.split('@')[0],
        dienst: { art: 'discord', id: nutzer.id },
      });
      if ('fehler' in ergebnis) return zurueck(req, '/anmelden?fehler=konto');
      konto = ergebnis.konto;
    }

    await merkeAnmeldung(konto.id);
    // Dasselbe wie bei Twitch: Name und Bild uebernehmen, wo nichts steht.
    await ergaenzeAusDienst(konto.id, {
      netz: 'discord',
      name: nutzer.username || nutzer.global_name,
      bildUrl: nutzer.avatar
        ? `https://cdn.discordapp.com/avatars/${nutzer.id}/${nutzer.avatar}.png?size=256`
        : undefined,
    });
    const antwort = zurueck(req, '/konto');
    antwort.cookies.set(COOKIE, sitzungFuer(konto.id), {
      httpOnly: true, sameSite: 'lax', path: '/',
      secure: ueberHttps(req),
      maxAge: SITZUNG_TAGE * 24 * 3600,
    });
    antwort.cookies.set('discord_oauth_state', '', { path: '/', maxAge: 0 });
    return antwort;
  } catch {
    return zurueck(req, '/anmelden?fehler=unerwartet');
  }
}
