'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import {
  GLOBALS_EVENT, GLOBALS_TAGE, tagTitel, type GlobalsTag,
} from '@/lib/globalsCup';

/*
 * Die Spieltagswahl der Globals - statt einer Cup-Auswahl.
 *
 * Der Betreiber: "bei Overlay gibt es keine Funktion, verschiedene Cups zu
 * benutzen, sondern nur die Globals Cups, also am 26.9 + 27.9." Also keine
 * Suche, keine Regionen, keine Liste - zwei Knoepfe.
 *
 * Und dazu, wo es passt, der Gesamtstand: "da kann er entweder ein
 * Leaderboard nur von dem heutigen Tag oder ein Leaderboard vom ganzen
 * Tournament auswaehlen."
 */

export function useGlobalsTage(): GlobalsTag[] {
  const [tage, setTage] = useState<GlobalsTag[]>(GLOBALS_TAGE);

  useEffect(() => {
    let weg = false;
    fetch('/api/cup-catalog?modus=alle')
      .then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const gefunden: GlobalsTag[] = [];
        for (const c of j.cups ?? []) {
          for (const liste of Object.values(c.regionen ?? {})) {
            for (const w of liste as Array<{ eventId: string; windowId: string; begin: number }>) {
              if (w.eventId !== GLOBALS_EVENT) continue;
              gefunden.push({
                windowId: w.windowId, titel: tagTitel(w.windowId), begin: w.begin,
              });
            }
          }
        }
        // Nur uebernehmen, wenn wirklich etwas kam - sonst bleibt es bei den
        // beiden bekannten Tagen, statt hier eine leere Wahl zu zeigen.
        if (gefunden.length) {
          gefunden.sort((a, b) => a.begin - b.begin);
          setTage(gefunden);
        }
      })
      .catch(() => { /* dann gelten die beiden bekannten Tage */ });
    return () => { weg = true; };
  }, []);

  return tage;
}

export default function GlobalsTagWahl({
  fenster, alle, onTag, onAlle,
}: {
  /** Der gewaehlte Spieltag. */
  fenster: string;
  /**
   * Die Tage, die zusammengezaehlt werden - leer oder einer heisst: nur der
   * gewaehlte Tag. Fehlt die Angabe, gibt es den Gesamtstand hier nicht.
   */
  alle?: string[];
  onTag: (windowId: string) => void;
  onAlle?: (fenster: string[]) => void;
}) {
  const tage = useGlobalsTage();
  const gesamt = (alle?.length ?? 0) > 1;

  return (
    <div className="text-xs text-slate-400">
      <T>Spieltag</T>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {tage.map((tag) => {
          const an = fenster === tag.windowId;
          return (
            <button key={tag.windowId} type="button"
              onClick={() => onTag(tag.windowId)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                an
                  ? 'border-amber-400/60 bg-amber-400/15 font-semibold text-amber-200'
                  : 'border-zinc-800 text-slate-300 hover:border-zinc-700'}`}>
              {tag.titel}
              <span className="ml-2 text-[11px] text-slate-500">
                {new Intl.DateTimeFormat('de-DE', {
                  day: '2-digit', month: '2-digit', timeZone: 'Europe/Brussels',
                }).format(new Date(tag.begin))}
              </span>
            </button>
          );
        })}
      </div>

      {onAlle && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={gesamt}
            onChange={(e) => onAlle(
              e.target.checked ? tage.map((x) => x.windowId) : [])}
            className="accent-amber-400" />
          <T>Gesamtstand über alle Tage</T>
        </label>
      )}
    </div>
  );
}
