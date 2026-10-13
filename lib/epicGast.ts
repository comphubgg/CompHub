import crypto from 'crypto';

/*
 * Die Epic-Verifizierung ohne CompHub-Konto.
 *
 * Der Betreiber (13.10.2026): "wenn ich auf Verify with Epic Games gehe, soll ich nicht auf die Login-Seite kommen, sondern auf die Seite,
 * um mich mit Epic Games zu verifizieren" - wie bei Osirion: wer sich bei Epic anmeldet und zustimmt, sieht seine Werte, ein Konto bei uns
 * braucht es dafuer nicht. Epic nennt dem Rueckweg die Konto-Id; sie wird hier signiert in einen Cookie gelegt (ein Jahr). Wer spaeter
 * ein CompHub-Konto anlegt und sich bei Epic verbindet, ist ohnehin mit seinem Konto verknuepft - der Cookie gilt nur fuer Gaeste.
 *
 * Signiert, damit niemand die Id eines anderen in seinen Cookie schreiben und sich als dieser Spieler ausgeben kann. Das Geheimnis ist
 * dasselbe wie bei den uebrigen Sitzungs-Cookies (lib/vipCookie).
 */

export const GAST_COOKIE = 'comphub_epic';
const GEHEIMNIS = process.env.AUTH_COOKIE_SECRET
  || process.env.DISCORD_CLIENT_SECRET
  || process.env.TWITCH_CLIENT_SECRET
  || 'streamer-dashboard-secret';

const signatur = (id: string) => crypto.createHmac('sha256', `${GEHEIMNIS}|epic-gast`).update(id).digest('hex').slice(0, 40);

/** Der Wert fuer den Cookie: "<Konto-Id>.<Signatur>". */
export const gastWert = (epicId: string) => `${epicId}.${signatur(epicId)}`;

/** Die Konto-Id aus einem Cookie-Wert - leer, wenn er fehlt oder nicht stimmt. */
export function gastAus(wert?: string | null): string {
  if (!wert) return '';
  const [id, sig] = wert.split('.');
  if (!id || !sig || !/^[0-9a-f]{32}$/.test(id)) return '';
  const soll = Buffer.from(signatur(id)); const ist = Buffer.from(sig);
  return soll.length === ist.length && crypto.timingSafeEqual(soll, ist) ? id : '';
}
