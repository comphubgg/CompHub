import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { alleKonten, kontoAus, nachId } from '@/lib/konten';
import { alleZugaenge } from '@/lib/vipZugaenge';
import { vipAus } from '@/lib/vipCookie';
import { besucheJeTag, zaehltSeit, tagVon } from '@/lib/besuche';

/*
 * Die Nutzungszahlen fuer das Dashboard.
 *
 * Der Betreiber wollte "ein Diagramm - wie viele Leute sich an diesen und
 * diesen Tagen einen Account erstellt haben, wie viele VIP bekommen haben,
 * wie viele das Werkzeug ueberhaupt besucht haben. Aber echte, wenn das
 * geht."
 *
 * Was geht, und was nicht:
 *
 *   Konten je Tag  - geht rueckwirkend. Jedes Konto traegt sein Anlegedatum
 *                    (`angelegt`), das steht seit dem ersten Tag drin.
 *   VIP je Tag     - geht rueckwirkend nur fuer die alten Zugangsschluessel
 *                    (`createdAt` in vip-users.json). Bei den Konten stand
 *                    bisher nur, BIS wann VIP gilt, nie SEIT wann. Deshalb
 *                    faengt diese Reihe bei den Konten mit der naechsten
 *                    Vergabe an; ein frueherer Wert waere geraten.
 *   Besuche je Tag - geht ueberhaupt nicht rueckwirkend. Gezaehlt wurde nie
 *                    etwas. Die Reihe beginnt am Tag der Einrichtung.
 *
 * Genau diese Grenzen kommen als `seit` mit heraus, damit die Oberflaeche
 * eine Null von einem "wurde da noch nicht gezaehlt" unterscheiden kann.
 * Ein leerer Balken, der wie "niemand war da" aussieht, waere die Art von
 * falscher Zahl, die spaeter in einem Beitrag landet.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const KONTO_COOKIE = 'streamer_dashboard_konto';
const VIP_COOKIE = 'streamer_dashboard_auth';

/** Die Zahlen sind Betriebsangaben - sie gehen nur den Betreiber etwas an. */
async function darfSehen(): Promise<boolean> {
  const laden = await cookies();
  if (vipAus(laden.get(VIP_COOKIE)?.value)?.trim().toLowerCase() === 'admin-juanito') {
    return true;
  }
  const id = kontoAus(laden.get(KONTO_COOKIE)?.value);
  if (!id) return false;
  return (await nachId(id))?.rolle === 'admin';
}

/** Der Tag eines Zeitstempels in Ortszeit - oder null, wenn er unbrauchbar ist. */
function tagAus(wert: string | number | undefined | null): string | null {
  if (wert === undefined || wert === null || wert === '') return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : tagVon(d);
}

export async function GET(request: NextRequest) {
  if (!await darfSehen()) {
    return NextResponse.json({ fehler: 'Nicht erlaubt.' }, { status: 403 });
  }

  // Wie weit zurueck. Voreingestellt dreissig Tage, hoechstens ein Jahr.
  const gewuenscht = Number(request.nextUrl.searchParams.get('tage'));
  const spanne = Math.min(Math.max(Number.isFinite(gewuenscht) ? gewuenscht : 30, 7), 365);

  const [konten, zugaenge, besuche, besuchSeit] = await Promise.all([
    alleKonten(), alleZugaenge(), besucheJeTag(), zaehltSeit(),
  ]);

  // ------------------------------------------------------- Konten je Tag

  const kontenJeTag = new Map<string, number>();
  for (const k of konten) {
    const tag = tagAus(k.angelegt);
    if (tag) kontenJeTag.set(tag, (kontenJeTag.get(tag) ?? 0) + 1);
  }

  // ---------------------------------------------------------- VIP je Tag

  const vipJeTag = new Map<string, number>();
  for (const z of zugaenge) {
    const tag = tagAus(z.createdAt);
    if (tag) vipJeTag.set(tag, (vipJeTag.get(tag) ?? 0) + 1);
  }
  for (const k of konten) {
    for (const zeit of k.vipVergaben ?? []) {
      const tag = tagAus(zeit);
      if (tag) vipJeTag.set(tag, (vipJeTag.get(tag) ?? 0) + 1);
    }
  }

  // ------------------------------------------------------ Besuche je Tag

  const besuchJeTag = new Map(besuche.map((b) => [b.tag, b]));

  // ------------------------------------------------------------ Die Reihe

  const heute = new Date();
  const tage: Array<{
    tag: string; konten: number; vips: number;
    aufrufe: number; besucher: number; neu: number;
  }> = [];
  for (let i = spanne - 1; i >= 0; i--) {
    const d = new Date(heute);
    d.setDate(d.getDate() - i);
    const tag = tagVon(d);
    const b = besuchJeTag.get(tag);
    tage.push({
      tag,
      konten: kontenJeTag.get(tag) ?? 0,
      vips: vipJeTag.get(tag) ?? 0,
      aufrufe: b?.aufrufe ?? 0,
      besucher: b?.besucher ?? 0,
      neu: b?.neu ?? 0,
    });
  }

  /*
   * Ab wann die jeweilige Reihe ueberhaupt etwas weiss.
   *
   * Bei den Konten ist das der aelteste Eintrag, bei den VIP-Vergaben der
   * aelteste Zugang - beide reichen weit zurueck. Bei den Besuchen ist es
   * der Tag, an dem gezaehlt wurde; davor gibt es schlicht nichts.
   */
  const alleTage = (m: Map<string, unknown>) => [...m.keys()].sort();
  const seit = {
    konten: alleTage(kontenJeTag)[0] ?? null,
    vips: alleTage(vipJeTag)[0] ?? null,
    besuche: besuchSeit,
  };

  return NextResponse.json({
    tage,
    seit,
    /*
     * Die Gegenwart, nicht der Verlauf: wie viele Konten es jetzt gibt und
     * wie viele davon gerade VIP sind. Beides ist direkt abzaehlbar und
     * braucht keine Aufzeichnung.
     */
    jetzt: {
      konten: konten.length,
      bestaetigt: konten.filter((k) => k.bestaetigt).length,
      /*
       * Die beiden VIP-Wege getrennt, nicht addiert.
       *
       * Wer frueher einen Zugangsschluessel bekam und sich spaeter ein Konto
       * angelegt hat, steckt in beiden Listen. Eine Summe wuerde ihn doppelt
       * zaehlen, und zusammenfuehren liesse er sich nur ueber den Namen -
       * also ueber eine Vermutung.
       */
      vipKonten: konten.filter((k) => k.vip).length,
      vipSchluessel: zugaenge.filter((z) => z.status === 'active').length,
    },
  });
}
