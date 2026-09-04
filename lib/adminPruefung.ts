import crypto from 'crypto';
import { cookies } from 'next/headers';

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

/** Darf diese Anfrage aendern? */
export async function istAdminAnfrage(_request?: Request): Promise<boolean> {
  try {
    const laden = await cookies();
    const login = anmeldungAus(laden.get('streamer_dashboard_auth')?.value);
    return (login?.trim().toLowerCase() ?? '') === ADMIN;
  } catch {
    return false;
  }
}
