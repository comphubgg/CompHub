'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { sichtbarerTakt } from '@/app/lib/takt';

/*
 * Meldet dem Server, dass eine Seite geoeffnet wurde.
 *
 * Sichtbar ist hier nichts - der Baustein gibt nichts aus und steht nur im
 * Rahmen, damit er jede Seite erwischt, auch die, die man ohne Neuladen
 * ansteuert.
 *
 * Warum ein Verweis statt eines Zaehlerstands im Zustand: bei React laufen
 * Effekte im Entwicklungsbetrieb absichtlich doppelt. Ohne diese Sperre
 * zaehlte jeder Aufruf zweimal, und das faellt erst auf, wenn die Zahlen
 * schon in einem Beitrag stehen.
 */
/*
 * Ob diese Sitzung (dieser Reiter) ihre Herkunft schon gemeldet hat.
 *
 * document.referrer bleibt bei Seitenwechseln ohne Neuladen dieselbe Adresse - die Quelle gehoert deshalb nur zum ersten
 * Aufruf einer Sitzung (lib/besuchDetails zaehlt Sitzungen je Quelle). sessionStorage gilt je Reiter und ueberlebt ein
 * Neuladen; ist er gesperrt, gilt wenigstens dieses Laden der Seite.
 */
let herkunftGemeldet = false;
function ersterAufrufDerSitzung(): boolean {
  if (herkunftGemeldet) return false;
  herkunftGemeldet = true;
  try {
    if (sessionStorage.getItem('comphub_sitzung')) return false;
    sessionStorage.setItem('comphub_sitzung', '1');
  } catch { /* dann eben je Laden */ }
  return true;
}

export default function Besuchszaehler() {
  const pfad = usePathname();
  // Ein Spielerprofil ist /statistics?spieler=<Id> - der Wechsel zu einem anderen Spieler ist ein neuer Aufruf.
  const spieler = useSearchParams()?.get('spieler') ?? '';
  const gemeldet = useRef<string | null>(null);

  useEffect(() => {
    const schluessel = `${pfad}|${pfad === '/statistics' ? spieler : ''}`;
    if (!pfad || gemeldet.current === schluessel) return;
    gemeldet.current = schluessel;

    /*
     * Was mitgeht, nur fuer die Summen je Tag (lib/besuchDetails): die Seite, bei einem Profil die Spieler-Id und beim ersten
     * Aufruf der Sitzung, woher sie kam (Verweis und ?utm_source=). Nichts davon wird einzeln aufbewahrt.
     */
    const koerper: { p: string; s?: string; q?: { r: string; u?: string } } = { p: pfad };
    if (pfad === '/statistics' && spieler) koerper.s = spieler.slice(0, 64);
    try {
      if (ersterAufrufDerSitzung()) {
        const utm = new URLSearchParams(window.location.search).get('utm_source') ?? '';
        koerper.q = { r: (document.referrer || '').slice(0, 500), ...(utm ? { u: utm.slice(0, 40) } : {}) };
      }
    } catch { /* ohne Herkunft */ }

    /*
     * keepalive, damit die Meldung auch dann noch rausgeht, wenn jemand
     * sofort weiterklickt oder den Reiter schliesst. Ohne das verschwinden
     * genau die kurzen Besuche, die man am ehesten zaehlen will.
     */
    void fetch('/api/besuch', {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(koerper),
    }).catch(() => { /* dann wird dieser Aufruf eben nicht gezaehlt */ });
  }, [pfad, spieler]);

  /*
   * Ein Lebenszeichen, solange die Seite offen ist.
   *
   * Ohne das war die Anzeige "gerade da" eine Luege in beide Richtungen: wer
   * das Werkzeug seit einer Stunde offen hatte, galt als weg, und wer sich
   * gerade abgemeldet und den Browser geschlossen hatte, stand noch fuenf
   * Minuten lang gruen da. Der Betreiber hat genau das gesehen.
   *
   * Jetzt meldet sich jeder offene Reiter jede Minute. Wer schliesst, meldet
   * sich nicht mehr - und faellt nach zwei Minuten von selbst heraus. Das
   * ist die einzige ehrliche Art, das zu wissen: ein geschlossenes Fenster
   * sagt niemandem Bescheid.
   *
   * "puls=1" zaehlt bewusst keinen Besuch mit. Sonst haette jede offene
   * Seite die Besuchszahlen im Minutentakt aufgeblasen.
   */
  useEffect(() => {
    const schlag = () => {
      void fetch('/api/besuch?puls=1', { method: 'POST', keepalive: true })
        .catch(() => { /* ein verpasster Schlag faellt beim naechsten auf */ });
    };
    // Nur bei sichtbarem Tab; wer ihn wieder nach vorn holt, meldet sich
    // sofort (siehe app/lib/takt).
    return sichtbarerTakt(schlag, 120_000);
  }, []);

  return null;
}
