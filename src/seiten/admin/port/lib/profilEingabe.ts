import { landAusEingabe } from './laender';

/*
 * Eingaben fuers Spielerprofil pruefen und vereinheitlichen - im Browser (/admin/flaggen zeigt sofort, was gespeichert wuerde) und auf dem Server
 * (lib/spielerProfil.ts, dort ist es die eigentliche Pruefung). Ohne Speicher, ohne Node.
 */

export class EingabeFehler extends Error {}

/** X-Konto aus "@name", "name" oder einer Adresse (x.com, twitter.com, mobile.twitter.com ...). Leer bleibt leer; Unbrauchbares wirft. */
export function xNormal(roh: string): string {
  let s = roh.trim();
  if (!s) return '';
  const adresse = s.match(/^(?:https?:\/\/)?(?:www\.|mobile\.|m\.)?(?:x|twitter)\.com\/(?:#!\/)?@?([^/?#\s]+)/i);
  if (adresse) s = adresse[1];
  s = s.replace(/^@+/, '').trim();
  if (!/^[A-Za-z0-9_]{1,15}$/.test(s) || /^(home|i|intent|search|explore|share|hashtag)$/i.test(s)) {
    throw new EingabeFehler(`Kein gültiges X-Konto: "${roh.trim()}"`);
  }
  return s;
}

/** Twitch-Kanal aus Name oder Adresse. */
export function twitchNormal(roh: string): string {
  const s = roh.trim().replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '');
  if (!s) return '';
  if (!/^[A-Za-z0-9_]{1,25}$/.test(s)) throw new EingabeFehler(`Kein gültiger Twitch-Kanal: "${roh.trim()}"`);
  return s;
}

/** Land aus Name (englisch/deutsch), ISO-2 oder ISO-3 - als zweistelliges Kuerzel. */
export function landNormal(roh: string): string {
  const s = roh.trim();
  if (!s) return '';
  const l = landAusEingabe(s);
  if (!l) throw new EingabeFehler(`Unbekanntes Land: "${s}"`);
  return l.code;
}

