'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

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
export default function Besuchszaehler() {
  const pfad = usePathname();
  const gemeldet = useRef<string | null>(null);

  useEffect(() => {
    if (!pfad || gemeldet.current === pfad) return;
    gemeldet.current = pfad;

    /*
     * keepalive, damit die Meldung auch dann noch rausgeht, wenn jemand
     * sofort weiterklickt oder den Reiter schliesst. Ohne das verschwinden
     * genau die kurzen Besuche, die man am ehesten zaehlen will.
     */
    void fetch('/api/besuch', { method: 'POST', keepalive: true })
      .catch(() => { /* dann wird dieser Aufruf eben nicht gezaehlt */ });
  }, [pfad]);

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
    const uhr = setInterval(schlag, 60_000);
    // Wer den Reiter wieder nach vorn holt, ist sofort wieder da - und muss
    // nicht bis zum naechsten Takt warten.
    const beiSichtbar = () => { if (!document.hidden) schlag(); };
    document.addEventListener('visibilitychange', beiSichtbar);
    return () => {
      clearInterval(uhr);
      document.removeEventListener('visibilitychange', beiSichtbar);
    };
  }, []);

  return null;
}
