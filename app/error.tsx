'use client';

import { useEffect } from 'react';
import FehlerSeite from '@/app/components/FehlerSeite';

/*
 * 500: ein Fehler beim Zeichnen einer Seite - die eigene Fehlerseite mit "Noch einmal versuchen". Der Fehlerfaenger im Rahmen meldet den Absturz
 * von selbst an den Admin; hier muss nur der Besucher weiterkommen.
 */
/*
 * Nach einem Update auf dem Server fehlen die Programmteile der alten Version (ChunkLoadError) - die Seite war dann "kaputt", bis man neu lud
 * (Betreiber, 14.11.2026: "auf einmal ... wenn ich die Seite neu lade, geht es"). Dann einmal selbst neu laden statt den Fehler zu zeigen.
 */
const NEU_GELADEN = 'comphub-neu-geladen';
export default function Fehler({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const veraltet = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Failed to load chunk|server action/i.test(`${error?.name} ${error?.message}`);
  useEffect(() => {
    if (!veraltet) return;
    try {
      const zuletzt = Number(sessionStorage.getItem(NEU_GELADEN) ?? 0);
      if (Date.now() - zuletzt < 30_000) return;
      sessionStorage.setItem(NEU_GELADEN, String(Date.now()));
    } catch { /* ohne Speicher trotzdem einmal */ }
    window.location.reload();
  }, [veraltet]);
  return <FehlerSeite code={500} wiederholen={reset} />;
}
