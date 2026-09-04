import { nachId, aendern } from './konten';

/*
 * Was die Anmeldung schon weiss, gleich ins Profil eintragen.
 *
 * Wer sich ueber Twitch oder Discord anmeldet, hat seinen Namen dort bereits
 * stehen - ihn danach von Hand noch einmal unter "Socials" einzutippen ist
 * Arbeit ohne Gegenwert. Dasselbe gilt fuer das Profilbild.
 *
 * Zwei Regeln gelten dabei:
 *
 *   - Nie ueberschreiben. Nur was leer ist, wird gefuellt. Wer seinen
 *     Twitch-Namen selbst anders geschrieben hat oder ein eigenes Bild
 *     hochgeladen hat, behaelt es - auch nach der naechsten Anmeldung.
 *   - Nie den Anmeldevorgang aufhalten. Geht etwas schief, bleibt das Feld
 *     eben leer; niemand soll deshalb vor einer Fehlerseite stehen.
 */

/** Hoechstens so gross wird ein uebernommenes Profilbild abgelegt. */
const BILD_HOECHSTENS = 300 * 1024;

interface Fund {
  netz: 'twitch' | 'discord';
  /** Der Name beim Dienst, ohne fuehrendes @. */
  name?: string;
  /** Adresse des Profilbildes beim Dienst. */
  bildUrl?: string;
}

/**
 * Holt das Profilbild und macht eine data:-Adresse daraus.
 *
 * Bewusst nicht die fremde Adresse speichern: die Seite laedt sonst bei jedem
 * Aufruf beim Dienst nach, und ein Konto, das dort geloescht wird, hinterlaesst
 * ein kaputtes Bild.
 */
async function alsDatenAdresse(url: string): Promise<string | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const art = r.headers.get('content-type') ?? '';
    if (!art.startsWith('image/')) return null;
    const roh = Buffer.from(await r.arrayBuffer());
    if (roh.byteLength > BILD_HOECHSTENS) return null;
    return `data:${art.split(';')[0]};base64,${roh.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function ergaenzeAusDienst(kontoId: string, fund: Fund): Promise<void> {
  try {
    const k = await nachId(kontoId);
    if (!k) return;

    const aenderung: { socials?: Record<string, string>; bild?: string } = {};

    const socials = { ...(k.socials ?? {}) };
    const sauber = fund.name?.trim().replace(/^@/, '').slice(0, 60);
    if (sauber && !socials[fund.netz]) {
      socials[fund.netz] = sauber;
      aenderung.socials = socials;
    }

    if (!k.bild && fund.bildUrl) {
      const bild = await alsDatenAdresse(fund.bildUrl);
      if (bild) aenderung.bild = bild;
    }

    if (Object.keys(aenderung).length) await aendern(kontoId, aenderung);
  } catch {
    // Ein fehlgeschlagenes Nachtragen darf die Anmeldung nicht stoeren.
  }
}
