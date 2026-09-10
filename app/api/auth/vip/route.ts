import { NextRequest, NextResponse } from 'next/server';
import fs from '@/lib/ablageFs';
import path from 'path';
import crypto from 'crypto';
import { ueberHttps } from '@/lib/vipCookie';
import { DATEN_ORT } from '@/lib/datenOrt';
import { merkeAnmeldung as merkeAnwesenheit } from '@/lib/anwesenheit';
import { modName } from '@/lib/modName';

/*
 * Bei jeder Anfrage neu ausfuehren.
 *
 * Ohne das wertet Next die Route beim Bauen einmal aus und liefert danach
 * immer dieselbe Antwort. Beim Abmelden wurde so die Adresse des Bauvorgangs
 * eingebacken - jeder landete auf "https://0.0.0.0:3100/login", einer Adresse,
 * die es nicht gibt. Wo die Antwort von der Anfrage abhaengt, muss sie auch
 * bei jeder Anfrage entstehen.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


const VIP_USERS_FILE = path.join(DATEN_ORT, 'vip-users.json');

/**
 * Das Namensschild eines Managers.
 *
 * Ein Manager-Zugang gehoert nicht einer Person: mehrere teilen sich Name und
 * Schluessel. Damit der Streamer trotzdem sieht, wer ein Overlay angelegt oder
 * geaendert hat, gibt jeder beim Anmelden zusaetzlich seinen eigenen Namen an
 * - der Wunsch des Betreibers: "dass der VIP weiss, wer was erstellt hat, wer
 * was geaendert hat ... Access Key und so bleibt gleich."
 *
 * Es ist ausdruecklich ein Schild und keine Anmeldung. Wer den Schluessel hat,
 * kann jeden Namen eintippen - unterschrieben oder nicht, das aendert nichts
 * daran. Deshalb wird er nur auf eine vernuenftige Form geprueft und nicht
 * verschluesselt; er steht als gewoehnliches Cookie da, damit die Oberflaeche
 * ihn anzeigen kann.
 */
const MOD_COOKIE = 'streamer_dashboard_mod';

const AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || process.env.DISCORD_CLIENT_SECRET || process.env.TWITCH_CLIENT_SECRET || 'streamer-dashboard-secret';

async function readVipUsers() {
  const content = await fs.readFile(VIP_USERS_FILE, 'utf-8');
  return JSON.parse(content);
}

function signValue(value: string) {
  return crypto.createHmac('sha256', AUTH_COOKIE_SECRET).update(value).digest('hex');
}

function makeSessionCookieValue(username: string) {
  const normalizedLogin = username.trim().toLowerCase();
  const timestamp = String(Date.now());
  const signature = signValue(`${normalizedLogin}:${timestamp}`);
  return `${normalizedLogin}:${timestamp}:${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const { username, accessKey, mod } = await request.json();

    if (!username || !accessKey) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const data = await readVipUsers();
    const normalizedUsername = String(username).trim().toLowerCase();
    const user = data.users.find((u: any) => u.username.toLowerCase() === normalizedUsername);

    if (!user || user.accessKey !== accessKey || user.status !== 'active') {
      return NextResponse.json({ error: 'Invalid username or access key' }, { status: 401 });
    }

    /*
     * Bei einem Manager-Zugang fehlt noch ein Schritt.
     *
     * Name und Schluessel stimmen - aber sie stimmen fuer alle, die sich
     * diesen Zugang teilen. Bevor das Cookie gesetzt wird, sagt die
     * Schnittstelle deshalb: "wer bist du?" Erst mit dem Schild geht es
     * weiter. Absichtlich hier und nicht davor: wer den Schluessel nicht hat,
     * soll auch nicht erfahren, dass es sich um einen Manager-Zugang handelt.
     */
    const verwaltet = String(user.verwaltet ?? '').trim();
    const schild = modName(mod);
    if (verwaltet) {
      /*
       * Der Name muss eingetragen sein.
       *
       * Er ist keine Beschriftung, sondern die eigentliche Sperre: Schluessel
       * und Zugangsname sind fuer alle gleich, verschieden ist nur der Name.
       * Wer nicht in der Liste steht, kommt nicht hinein - "wenn ich den
       * Namen loesche und er trotzdem Access Key und den Zugangsnamen richtig
       * hat, dann geht's nicht".
       *
       * Verglichen wird ohne Ruecksicht auf Gross- und Kleinschreibung: der
       * Name wird getippt, nicht kopiert.
       */
      const erlaubt: string[] = Array.isArray(user.mods) ? user.mods : [];
      const passt = erlaubt.find(
        (m: string) => String(m).trim().toLowerCase() === schild.toLowerCase());

      if (!schild || !passt) {
        return NextResponse.json({
          modNoetig: true,
          fuer: verwaltet,
          /*
           * Zwei verschiedene Antworten, aber dieselbe Form.
           *
           * "unbekannt" heisst: der Name steht nicht in der Liste. Ob der
           * Zugang ueberhaupt Namen hat, verraten wir nicht - sonst liesse
           * sich die Liste durch Ausprobieren abfragen.
           */
          fehlerhaft: Boolean(String(mod ?? '').trim()),
        });
      }
    }

    // Fuer die Liste "wer war wann da" in den Adminwerkzeugen.
    void merkeAnwesenheit(`vip:${user.username.toLowerCase()}`, user.username, 'vip');

    const cookieValue = makeSessionCookieValue(user.username);
    const response = NextResponse.json({ success: true, user: user.username });
    /*
     * "secure" nur ueber HTTPS - nicht am Betriebsmodus festgemacht.
     * Sonst faellt die Anmeldung weg, sobald jemand ueber die LAN-Adresse
     * oder aus dem Fensterprogramm kommt.
     */
    const isProduction = ueberHttps(request);
    response.cookies.set('streamer_dashboard_auth', cookieValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    response.cookies.set('streamer_dashboard_user_login', user.username, {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    /*
     * Das Schild - oder weg damit.
     *
     * Weg auch dann, wenn sich hier gerade ein gewoehnlicher VIP anmeldet:
     * sonst haengt an seiner Sitzung noch der Name des Managers, der vorher
     * an demselben Rechner sass.
     */
    if (schild && verwaltet) {
      response.cookies.set(MOD_COOKIE, schild, {
        httpOnly: false,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    } else {
      response.cookies.delete(MOD_COOKIE);
    }
    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
