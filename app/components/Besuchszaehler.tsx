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

  return null;
}
