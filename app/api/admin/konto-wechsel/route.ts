import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus, ueberHttps } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';

/*
 * Als Admin in einen anderen Zugang wechseln.
 *
 * Der Betreiber wollte sehen, was ein VIP oder ein Manager sieht, ohne
 * dessen Schluessel zu kennen und ohne sich abzumelden: "dass ich als Admin
 * in jeden VIP-Account und Manager-Account rein kann, ohne dass ich mich
 * ausloggen muss."
 *
 * Gewechselt wird, indem das Anmelde-Cookie neu unterschrieben wird - auf
 * denselben Weg, den die gewoehnliche Anmeldung nimmt. Danach ist die
 * Sitzung dieser Zugang, vollstaendig: jede Seite, jede Schnittstelle, auch
 * die Overlay-Ablage.
 *
 * Der Rueckweg fuehrt ueber eine neue Anmeldung. Das ist Absicht und war
 * auch so abgesprochen ("ich muss mich dann wieder neu einloggen"): ein
 * Cookie, das den Admin heimlich weiter mitfuehrt, waere ein zweiter
 * Schluessel zur Verwaltung - und er laege dann in jeder Sitzung, in die
 * gewechselt wurde.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

const GEHEIMNIS = process.env.AUTH_COOKIE_SECRET
  || process.env.DISCORD_CLIENT_SECRET
  || process.env.TWITCH_CLIENT_SECRET
  || 'streamer-dashboard-secret';

function unterschreibe(wert: string) {
  return crypto.createHmac('sha256', GEHEIMNIS).update(wert).digest('hex');
}

/** Derselbe Aufbau wie in der gewoehnlichen Anmeldung: name:zeit:unterschrift. */
function cookieWert(name: string) {
  const klein = name.trim().toLowerCase();
  const zeit = String(Date.now());
  return `${klein}:${zeit}:${unterschreibe(`${klein}:${zeit}`)}`;
}

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k?.rolle === 'admin' && !k.gesperrt) return true;
  }
  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;
  const name = vipAus(wert);
  if (!name) return false;
  return rechteVon(await zugangNach(name)).rolle === 'admin';
}

export async function POST(request: NextRequest) {
  if (!await istAdmin()) {
    return NextResponse.json({ fehler: 'nicht erlaubt' }, { status: 403 });
  }

  const koerper = await request.json().catch(() => ({}));
  const ziel = String(koerper.name ?? '').trim();
  if (!ziel) {
    return NextResponse.json({ fehler: 'kein Name' }, { status: 400 });
  }

  /*
   * In die Betreiberkennung wird nicht gewechselt.
   *
   * Sie haengt an keinem Eintrag und gilt ueberall als hoechstes Recht; sie
   * soll nur ueber den echten Schluessel erreichbar sein. Sonst waere der
   * Wechsel ein Weg, sich Betreiberrechte zu holen.
   */
  if (ziel.toLowerCase() === 'admin-juanito') {
    return NextResponse.json(
      { fehler: 'In die Betreiberkennung lässt sich nicht wechseln.' },
      { status: 400 });
  }

  const zugang = await zugangNach(ziel);
  if (!zugang) {
    return NextResponse.json(
      { fehler: 'Für diesen Namen gibt es keinen Zugang.' }, { status: 404 });
  }
  const darf = rechteVon(zugang);
  if (!darf.gueltig) {
    return NextResponse.json(
      { fehler: 'Dieser Zugang ist stillgelegt.' }, { status: 400 });
  }

  const https = ueberHttps(request);
  const antwort = NextResponse.json({
    ok: true,
    als: zugang.username,
    rolle: darf.rolle,
    verwaltet: zugang.verwaltet ?? null,
  });

  antwort.cookies.set(VIP_COOKIE, cookieWert(zugang.username), {
    httpOnly: true,
    secure: https,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  antwort.cookies.set('streamer_dashboard_user_login', zugang.username, {
    httpOnly: false,
    secure: https,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  /*
   * Das CompHub-Konto muss weg.
   *
   * Wer sich ueber E-Mail angemeldet hat, traegt seine Adminrolle dort -
   * und behielte sie waehrend des Wechsels. Er saehe dann die
   * Verwaltungskacheln neben der Ansicht des VIPs und waere zugleich beides.
   */
  antwort.cookies.delete(KONTO_COOKIE);

  return antwort;
}
