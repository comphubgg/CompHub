'use client';

import FehlerSeite from '@/app/components/FehlerSeite';

/*
 * 500: ein Fehler beim Zeichnen einer Seite - die eigene Fehlerseite mit "Noch einmal versuchen". Der Fehlerfaenger im Rahmen meldet den Absturz
 * von selbst an den Admin; hier muss nur der Besucher weiterkommen.
 */
export default function Fehler({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <FehlerSeite code={500} wiederholen={reset} />;
}
