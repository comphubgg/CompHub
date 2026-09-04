import { cookies } from 'next/headers';
import { kontoAus, nachId } from './konten';
import { istBetreiber, vipAus } from './vipCookie';
import { zugangNach, rechteVon } from './vipZugaenge';

/*
 * Wer stellt gerade diese Anfrage?
 *
 * Bis hierher fragte das jede Schnittstelle fuer sich - und die Turnierkarten
 * fragten gar nicht: ein POST von irgendwoher konnte jede Karte ueberschreiben.
 * Solange nur der Betreiber die Kartenseite kannte, fiel das nicht auf. Sobald
 * ein Pro sich selbst auf der Karte setzen darf, ist die Karte aber fuer mehr
 * als eine Person offen, und dann muss der Server wissen, wer schreibt.
 *
 * Beide Anmeldewege zaehlen, wie ueberall im Werkzeug: das CompHub-Konto und
 * der alte Zugangsschluessel.
 */

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

export type Rolle = 'admin' | 'manager' | 'pro' | null;

export interface Schreiber {
  rolle: Rolle;
  /** Das verknuepfte Epic-Konto - nur damit ist "ich selbst" bestimmbar. */
  epicId: string | null;
  name: string | null;
}

export async function werSchreibt(): Promise<Schreiber> {
  const laden = await cookies();
  let rolle: Rolle = null;
  let epicId: string | null = null;
  let name: string | null = null;

  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    // Ein gesperrtes Konto zaehlt wie keins.
    if (k && !k.gesperrt) {
      rolle = k.rolle ?? null;
      epicId = k.epicId ?? null;
      name = k.name;
    }
  }

  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return { rolle: 'admin', epicId, name: name ?? 'admin-juanito' };

  const vip = vipAus(wert);
  if (vip) {
    const darf = rechteVon(await zugangNach(vip));
    if (!rolle && darf.rolle) rolle = darf.rolle;
    if (!name) name = vip;
  }
  return { rolle, epicId, name };
}

/** Admin heisst hier: darf die Karte als Ganzes aendern. */
export function darfKarteAendern(s: Schreiber): boolean {
  return s.rolle === 'admin';
}
