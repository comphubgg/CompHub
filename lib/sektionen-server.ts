import { cookies, headers } from 'next/headers';
import { kontoAus, nachId } from '@/lib/konten';
import { istBetreiber, vipAus } from '@/lib/vipCookie';
import { zugangNach, rechteVon } from '@/lib/vipZugaenge';
import { SEKTIONEN, sektionVonPfad } from '@/lib/sektionen';
import { liesStaende } from '@/lib/sektionen-ablage';
import type { SperrAngaben } from '@/app/components/SperrSeite';

/*
 * Die Sperre auf dem Server.
 *
 * Sie entscheidet, bevor irgendetwas ausgeliefert wird. Das ist der
 * Unterschied zwischen "verborgen" und "nicht da": eine Sperre, die erst im
 * Browser greift, laesst den Inhalt trotzdem im Quelltext der Seite stehen -
 * wer die Adresse kennt und hineinsieht, liest ihn. Der Betreiber wollte,
 * dass "direkte Aufrufe der URL ebenfalls entsprechend abgefangen" werden.
 *
 * Den Pfad liefert die Middleware im Kopf "x-comphub-pfad"; Next reicht ihn
 * einem Rahmen sonst nicht hinein.
 */

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

async function istAdmin(): Promise<boolean> {
  const laden = await cookies();

  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (id) {
    const k = await nachId(id);
    if (k && !k.gesperrt && k.rolle === 'admin') return true;
  }

  const wert = laden.get(VIP_COOKIE)?.value;
  if (istBetreiber(wert)) return true;

  const name = vipAus(wert);
  if (name) return rechteVon(await zugangNach(name)).rolle === 'admin';
  return false;
}

/** Der Stand aller Bereiche, samt der Frage, ob der Aufrufer Admin ist. */
export async function sektionsLage(): Promise<{
  admin: boolean; staende: Awaited<ReturnType<typeof liesStaende>>;
}> {
  /*
   * Der Stand, wie ihn schon die erste Zeichnung braucht.
   *
   * Die Kopfzeile blendet abgeschaltete Bereiche aus. Holte sie sich den
   * Stand erst im Browser, stuende ein "offline" geschalteter Bereich fuer
   * einen Wimpernschlag doch in der Leiste - und bei jemandem, dessen
   * Browser gerade kein Javascript ausfuehrt, sogar dauerhaft.
   */
  const [staende, admin] = await Promise.all([liesStaende(), istAdmin()]);
  return { admin, staende };
}

/**
 * Ist dieser Aufruf gesperrt - und wenn ja, was steht dann da?
 *
 * Gibt nichts zurueck, wenn alles offen ist oder der Aufruf gar keinen
 * Hauptbereich betrifft (etwa die Verwaltung oder das eigene Konto).
 */
export async function sperreFuerAufruf(): Promise<SperrAngaben | null> {
  const pfad = (await headers()).get('x-comphub-pfad') ?? '';
  const sektion = sektionVonPfad(pfad);
  if (!sektion) return null;

  const staende = await liesStaende();
  const eintrag = staende[sektion.schluessel];
  if (!eintrag || eintrag.zustand === 'online') return null;

  // Der Admin kommt ueberall hin - das ist der Zweck der Sache.
  if (await istAdmin()) return null;

  return {
    zustand: eintrag.zustand,
    name: sektion.titel,
    hinweis: eintrag.hinweis,
    eigenerTitel: eintrag.eigenerTitel,
    eigenerText: eintrag.eigenerText,
    andere: SEKTIONEN
      .filter((s) => s.schluessel !== sektion.schluessel
                  && (staende[s.schluessel]?.zustand ?? 'online') === 'online')
      .map((s) => ({ schluessel: s.schluessel, pfad: s.pfad, titel: s.titel })),
  };
}
