'use client';

import { usePathname } from 'next/navigation';
import { sektionVonPfad } from '@/lib/sektionen';
import { useSektionen, zustandFuer } from '@/app/lib/sektionen-stand';
import SperrSeite from '@/app/components/SperrSeite';

/*
 * Die Sperre im Browser.
 *
 * Der Rahmen auf dem Server entscheidet schon beim Ausliefern, ob ein
 * Bereich gezeigt wird - das ist die eigentliche Absperrung, und sie greift
 * auch bei einem direkten Aufruf der Adresse.
 *
 * Diese hier kommt oben drauf und sorgt fuer das, was der Betreiber
 * ausdruecklich wollte: "die Änderung [wird] sofort für alle User wirksam".
 * Wer die Seite offen hat, waehrend der Admin umschaltet, sieht binnen zehn
 * Sekunden den neuen Stand, ohne etwas zu tun. Umgekehrt verschwindet die
 * Sperrseite genauso von selbst, sobald wieder aufgemacht wird.
 *
 * Fuer den Admin greift beides nie - er kommt ueberall hin.
 */

export default function SektionSperre({ children }: { children: React.ReactNode }) {
  const pfad = usePathname() ?? '/';
  const stand = useSektionen();

  const sektion = sektionVonPfad(pfad);

  /*
   * Solange keine Antwort da ist, wird nichts gesperrt.
   *
   * Andernfalls blitzte bei jedem Seitenwechsel kurz eine Sperrseite auf,
   * auch wenn alles offen ist - und das saehe schlimmer aus als der Fall,
   * den es abfangen soll. Ausgeliefert wurde die Seite ohnehin nur, wenn
   * der Server sie durchgelassen hat.
   */
  if (!sektion || stand.laedt) return <>{children}</>;

  const zustand = zustandFuer(stand, sektion.schluessel);
  if (zustand === 'online') return <>{children}</>;

  const eintrag = stand.staende[sektion.schluessel];

  return (
    <SperrSeite angaben={{
      zustand,
      name: sektion.titel,
      hinweis: eintrag?.hinweis ?? 'ueberarbeitung',
      eigenerTitel: eintrag?.eigenerTitel,
      eigenerText: eintrag?.eigenerText,
      andere: stand.sektionen
        .filter((s) => s.schluessel !== sektion.schluessel
                    && zustandFuer(stand, s.schluessel) === 'online')
        .map((s) => ({ schluessel: s.schluessel, pfad: s.pfad, titel: s.titel })),
    }} />
  );
}
