import crypto from 'crypto';
import { cookies } from 'next/headers';
import { istVip, kontoAus, nachId } from '@/lib/konten';
import { darf, wirksameRechte, type Bereich } from '@/lib/rechte';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';

// Ist die Anfrage vom Admin?
//
// Dieselbe Pruefung wie in /api/auth/check-admin, nur als Baustein: Wer
// etwas veraendern darf, muss serverseitig geprueft werden. Ein Knopf, der
// im Browser nur ausgeblendet ist, schuetzt nichts - die Anfrage laesst sich
// von Hand schicken.

const GEHEIMNIS = process.env.AUTH_COOKIE_SECRET
  || process.env.DISCORD_CLIENT_SECRET
  || process.env.TWITCH_CLIENT_SECRET
  || 'streamer-dashboard-secret';

const ADMIN = 'admin-juanito';

function unterschrift(wert: string) {
  return crypto.createHmac('sha256', GEHEIMNIS).update(wert).digest('hex');
}

/** Den Anmeldenamen aus dem Cookie lesen - oder null, wenn es nicht stimmt. */
export function anmeldungAus(cookieWert: string | undefined): string | null {
  if (!cookieWert) return null;
  const teile = cookieWert.split(':');
  if (teile.length !== 3) return null;

  const [login, zeit, signatur] = teile;
  if (unterschrift(`${login}:${zeit}`) !== signatur) return null;

  const erstellt = Number(zeit);
  if (Number.isNaN(erstellt)) return null;
  if (Date.now() - erstellt > 30 * 24 * 3600 * 1000) return null;

  return login;
}

/**
 * Darf diese Anfrage aendern?
 *
 * Dieselben Wege wie /api/auth/check-admin: das CompHub-Konto mit der Rolle
 * "admin", der alte Betreiber-Schluessel und ein Zugang mit Admin-Rolle.
 *
 * Bis zum 30.9.2026 kannte diese Pruefung nur den alten Schluessel. Der
 * Betreiber meldet sich aber laengst ueber sein Konto an - die Seite zeigte
 * ihm deshalb alle Admin-Schalter, der Server lehnte jedes Speichern mit 403
 * ab, und die Seite verschwieg es. So sprangen die Schloesser der Statistik
 * nach dem Neuladen zurueck ("das soll dann gespeichert werden fuer jeden,
 * fuer immer"), und die Listen der versteckten Spieler und der fuer alle
 * entfernten Tierlist-Eintraege entstanden nie.
 */
export async function istAdminAnfrage(_request?: Request): Promise<boolean> {
  try {
    const laden = await cookies();
    const wert = laden.get('streamer_dashboard_auth')?.value;
    const login = anmeldungAus(wert);
    if ((login?.trim().toLowerCase() ?? '') === ADMIN) return true;

    const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
    if (id) {
      const k = await nachId(id);
      if (k && !k.gesperrt && k.rolle === 'admin') return true;
    }
    if (istBetreiber(wert)) return true;
    const name = vipAus(wert);
    if (name) return rechteVon(await zugangNach(name)).rolle === 'admin';
    return false;
  } catch {
    return false;
  }
}

/**
 * Engerer Kreis: nur der Betreiber-Schluessel oder ein CompHub-Konto mit Rolle "admin", das nicht gesperrt ist.
 * Ein Zugang mit Admin-Rolle zaehlt hier nicht (anders als bei istAdminAnfrage). Fuer die Betriebszahlen
 * (Statistik-Nutzung, Anwesenheit, Besuche, Kontakt-Bilder), die bisher genau diesen Kreis hatten.
 * Ein gesperrtes Konto wird immer abgewiesen.
 */
export async function istBetreiberOderAdminKonto(): Promise<boolean> {
  try {
    const laden = await cookies();
    if (istBetreiber(laden.get('streamer_dashboard_auth')?.value)) return true;
    const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
    if (!id) return false;
    const k = await nachId(id);
    return !!k && !k.gesperrt && k.rolle === 'admin';
  } catch {
    return false;
  }
}

/**
 * Darf diese Anfrage in einem der Bereiche aendern? Der Admin immer, ein Manager mit dem Recht fuer einen der Bereiche
 * (dieselbe Regel wie darf() in lib/rechte und wie die Oberflaeche ueber /api/auth/check-admin).
 *
 * Seit 31.10.2026 in den Schreib-Routen, die vorher niemanden prueften (Player Center, Formvorlage der Turnierkarte) - die Knoepfe
 * waren nur im Browser ausgeblendet, eine von Hand geschickte Anfrage kam durch.
 */
export async function darfBereichAnfrage(...bereiche: Bereich[]): Promise<boolean> {
  if (await istAdminAnfrage()) return true;
  try {
    const laden = await cookies();
    const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
    if (id) {
      const k = await nachId(id);
      if (k && !k.gesperrt && bereiche.some((b) => darf(k.rolle ?? null, wirksameRechte(k.rolle, k.rechte, istVip(k)), b))) return true;
    }
    const name = vipAus(laden.get('streamer_dashboard_auth')?.value);
    if (name) {
      const r = rechteVon(await zugangNach(name));
      if (r.gueltig && bereiche.some((b) => darf(r.rolle, r.rechte, b))) return true;
    }
  } catch { /* ohne Pruefung kein Recht */ }
  return false;
}

/** Ist ueberhaupt jemand angemeldet (CompHub-Konto oder gueltiger Zugang)? Fuer Eintraege, die jedes Konto anlegen darf. */
export async function angemeldetAnfrage(): Promise<boolean> {
  if (await istAdminAnfrage()) return true;
  try {
    const laden = await cookies();
    const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
    if (id) { const k = await nachId(id); if (k && !k.gesperrt) return true; }
    const name = vipAus(laden.get('streamer_dashboard_auth')?.value);
    if (name && rechteVon(await zugangNach(name)).gueltig) return true;
  } catch { /* ohne Pruefung nicht angemeldet */ }
  return false;
}
