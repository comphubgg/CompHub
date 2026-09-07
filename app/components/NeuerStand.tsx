'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';

/*
 * Der Hinweis, dass eine neue Fassung bereitsteht.
 *
 * An einem Turniertag bleibt ein Tab stundenlang offen - im Stream, auf dem
 * zweiten Bildschirm, neben OBS. Wird in der Zwischenzeit etwas aufgespielt,
 * merkt davon niemand etwas: die alte Fassung laeuft weiter, holt sich zwar
 * neue Zahlen, aber eben mit dem alten Verhalten. Der Betreiber wollte dafuer
 * einen Balken: "unten rechts kommt ein Balken: This page got updated. Please
 * reload."
 *
 * Absichtlich nur ein Hinweis, kein Neuladen von selbst. Wer gerade eine
 * Karte einteilt oder ein Overlay einstellt, wuerde durch ein erzwungenes
 * Neuladen seine Arbeit verlieren - der Zeitpunkt gehoert ihm.
 *
 * Die Kennung kommt von /api/stand und stammt von Next selbst. Im
 * Entwicklungsbetrieb ist sie leer; dann zeigt sich hier nie etwas.
 */

/** Wie oft nachgesehen wird. Zwei Minuten reichen fuer einen Hinweis. */
const TAKT_MS = 120_000;

export default function NeuerStand() {
  const [neu, setNeu] = useState(false);

  useEffect(() => {
    let weg = false;
    /** Der Stand, mit dem dieser Tab geladen wurde. */
    let erster: string | null = null;

    const nachsehen = async () => {
      try {
        const r = await fetch('/api/stand', { cache: 'no-store' });
        if (!r.ok) return;
        const { stand } = await r.json() as { stand?: string };
        if (weg || !stand) return;
        if (erster === null) { erster = stand; return; }
        if (stand !== erster) setNeu(true);
      } catch {
        /* Netz weg - beim naechsten Mal wieder. Ein Fehler beim Nachsehen
           ist kein Grund, dem Besucher etwas anzuzeigen. */
      }
    };

    void nachsehen();
    const uhr = setInterval(() => { void nachsehen(); }, TAKT_MS);
    return () => { weg = true; clearInterval(uhr); };
  }, []);

  if (!neu) return null;

  return (
    /*
     * Unten rechts, aber ueber dem Sprachschalter - der sitzt dort schon.
     * Deshalb der groessere Abstand nach unten und dieselbe Ebene, damit
     * beide nebeneinander bestehen statt uebereinander.
     */
    <div className="fixed bottom-16 right-4 z-[100] flex items-center gap-3
                    rounded-lg border border-sky-500/40 bg-zinc-900/95 px-4 py-2.5
                    text-sm text-slate-200 shadow-lg shadow-black/40
                    backdrop-blur">
      <span><T>Diese Seite wurde aktualisiert. Bitte neu laden.</T></span>
      <button onClick={() => window.location.reload()}
        className="shrink-0 rounded-md bg-sky-500 px-3 py-1 text-xs font-semibold
                   text-white transition hover:bg-sky-400">
        <T>Neu laden</T>
      </button>
      <button onClick={() => setNeu(false)}
        aria-label="close"
        className="shrink-0 text-slate-500 transition hover:text-slate-300">
        ✕
      </button>
    </div>
  );
}
