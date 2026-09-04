import crypto from 'crypto';

// Den alten VIP-Zugang pruefen.
//
// Bisher stand diese Pruefung zweimal fast gleich in zwei Routen, und an
// einer dritten Stelle hatte ich sie durch einen blossen Textvergleich
// ersetzt - was ein Loch gewesen waere: der Wert steht im Cookie, jeder
// haette sich "admin-juanito" hineinschreiben koennen. Massgeblich ist
// allein die Unterschrift.
//
// Aufbau des Werts:  <name>:<zeitstempel>:<unterschrift>

const GEHEIMNIS = process.env.AUTH_COOKIE_SECRET
  || process.env.DISCORD_CLIENT_SECRET
  || process.env.TWITCH_CLIENT_SECRET
  || 'streamer-dashboard-secret';

const GUELTIG_TAGE = 30;

function unterschreibe(wert: string) {
  return crypto.createHmac('sha256', GEHEIMNIS).update(wert).digest('hex');
}

/**
 * Der Name aus dem Cookie - oder null, wenn etwas nicht stimmt.
 *
 * Geprueft wird zeitkonstant: ein Vergleich, der beim ersten falschen
 * Zeichen abbricht, verraet ueber die Laufzeit, wie weit ein Rateversuch
 * gekommen ist.
 */
export function vipAus(cookieWert: string | undefined): string | null {
  if (!cookieWert) return null;

  const teile = cookieWert.split(':');
  if (teile.length !== 3) return null;

  const [name, zeit, unterschrift] = teile;
  const erwartet = unterschreibe(`${name}:${zeit}`);
  if (erwartet.length !== unterschrift.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(erwartet), Buffer.from(unterschrift))) {
    return null;
  }

  const angelegt = Number(zeit);
  if (Number.isNaN(angelegt)) return null;
  if (Date.now() - angelegt > GUELTIG_TAGE * 24 * 3600 * 1000) return null;

  return name;
}

/** Ist das der Betreiber? */
export function istBetreiber(cookieWert: string | undefined): boolean {
  return vipAus(cookieWert)?.toLowerCase() === 'admin-juanito';
}

/**
 * Laeuft diese Anfrage ueber HTTPS?
 *
 * Nur dann darf das Cookie "secure" tragen. Frueher hing das an NODE_ENV -
 * und damit verschwand die Anmeldung, sobald jemand ueber die LAN-Adresse
 * oder aus dem Fensterprogramm kam, denn dort laeuft es ueber http.
 */
export function ueberHttps(request: Request): boolean {
  const kopf = request.headers.get('x-forwarded-proto');
  if (kopf) return kopf.split(',')[0].trim() === 'https';
  try {
    return new URL(request.url).protocol === 'https:';
  } catch {
    return false;
  }
}
