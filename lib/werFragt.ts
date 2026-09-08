/*
 * Wer stellt gerade die Anfrage?
 *
 * Diese Frage wurde im Werkzeug an mehreren Stellen verschieden beantwortet,
 * und daraus sind Fehler entstanden. Die Overlay-Seite liess den Betreiber
 * herein, die Schnittstelle dahinter bestritt, dass er angemeldet sei - weil
 * die eine beide Anmeldewege kannte und die andere nur einen. Deshalb steht
 * die Antwort jetzt an einer Stelle.
 *
 * Es gibt zwei Wege in dieses Werkzeug:
 *
 *   1. Das gewoehnliche CompHub-Konto mit Cookie und Kontoeintrag.
 *   2. Der aeltere VIP-Zugang, ein unterschriebenes Cookie mit einem Namen.
 *      Der Betreiber selbst kommt so herein.
 *
 * Zurueck kommt eine bestaendige Kennung. Bestaendig ist wichtig: an ihr
 * haengen gespeicherte Sachen - Overlays, Tierlisten -, und wechselte sie bei
 * jeder Anmeldung, gehoerten sie beim naechsten Mal niemandem mehr.
 */

import { cookies } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach } from '@/lib/vipZugaenge';

/** Die Kennung des Anfragenden - oder null, wenn niemand angemeldet ist. */
export async function werFragt(): Promise<string | null> {
  const laden = await cookies();

  // 1. Das gewoehnliche CompHub-Konto.
  const id = kontoAus(laden.get('streamer_dashboard_konto')?.value);
  if (id) {
    const konto = await nachId(id);
    if (konto && !konto.gesperrt) return id;
  }

  // 2. Der aeltere VIP-Zugang.
  const vipWert = laden.get('streamer_dashboard_auth')?.value;
  if (vipWert) {
    if (istBetreiber(vipWert)) return 'betreiber';
    const name = vipAus(vipWert);
    if (name && await zugangNach(name)) return `vip:${name}`;
  }

  return null;
}

/**
 * Ein Name in der Ablage, der zu genau diesem Konto gehoert.
 *
 * Aus "vip:admin-juanito" wird "vip_admin-juanito" - Doppelpunkte und
 * Schraegstriche haben in einem Dateinamen nichts zu suchen.
 */
export function kennungFuerAblage(wer: string): string {
  return wer.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}
