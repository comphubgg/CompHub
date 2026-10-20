'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { designFuerPfad, hellMoeglich, MODUS_COOKIE, lieseModus } from '@/app/lib/design';

/*
 * Haelt die Design-Angaben am <html>-Element beim Seitenwechsel aktuell.
 *
 * Der Rahmen (app/layout.tsx) setzt data-design und data-modus beim ersten Zeichnen auf dem Server. Wechselt man danach per Klick auf eine
 * andere Seite, wird der Rahmen nicht neu gezeichnet - ohne diesen Waechter bliebe die Streams-Seite im neuen Design stehen (oder
 * umgekehrt). Er sieht nur den Pfad an und stellt die beiden Angaben um; sichtbar ist von ihm sonst nichts.
 */
export default function DesignWaechter() {
  const pfad = usePathname();
  useEffect(() => {
    const html = document.documentElement;
    const design = designFuerPfad(pfad ?? '');
    html.dataset.design = design;
    // Die alte Fassung (Streams) ist dunkel; im neuen Design gilt die Wahl des Besuchers.
    html.dataset.modus = hellMoeglich(pfad ?? '') ? lieseModus(document.cookie) : 'dunkel';
  }, [pfad]);
  return null;
}

export { MODUS_COOKIE };
