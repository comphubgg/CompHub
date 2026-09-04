import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  anlegen, merkeAnmeldung, nachDienst, nachEmail, SITZUNG_TAGE, sitzungFuer,
  verknuepfe,
} from '@/lib/konten';
import { ergaenzeAusDienst } from '@/lib/kontoErgaenzen';
import { ueberHttps } from '@/lib/vipCookie';
import { holeDienst } from '@/lib/dienstZugaenge';

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

function wurzel(req: NextRequest) {
  const basis = (process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  return basis ? basis.replace(/\/+$/, '') : req.nextUrl.origin;
}

function weiterleitung(req: NextRequest) {
  return `${wurzel(req)}/api/auth/discord/callback`;
}

function zurueck(req: NextRequest, ziel: string) {
  return NextResponse.redirect(`${wurzel(req)}${ziel}`);
}

export async function GET(req: NextRequest) {
  // Zugangsdaten zur Laufzeit: eingetragen schlaegt Umgebung.
  const { id: CLIENT_ID, secret: CLIENT_SECRET } = await holeDienst('discord');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const gemerkt = req.cookies.get('discord_oauth_state')?.value;

  if (!code) return zurueck(req, '/anmelden?fehler=abgebrochen');

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
