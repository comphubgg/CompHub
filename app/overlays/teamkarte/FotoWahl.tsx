'use client';

import { useEffect, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Welches Foto im Banner steht.
 *
 * Der Betreiber zu den Globals-Overlays: "bei den Globals Overlay fuer
 * 1v1/2v2 usw soll man auch Profile Picture auswaehlen koennen." Bisher
 * entschied das allein die Fotozuordnung ueber die Konto-Id - wer dort
 * keines hatte, blieb ohne Bild, und ein anderes liess sich nicht nehmen.
 *
 * Drei Moeglichkeiten, mehr braucht es nicht:
 *
 *   leer  - das gepflegte Foto des Kontos (so war es bisher, und so bleibt
 *           es, solange niemand etwas anderes waehlt)
 *   "-"   - gar kein Foto
 *   Pfad  - ein Foto aus dem Archiv, ueber die Suche gewaehlt
 *
 * Gesucht wird im Spielerverzeichnis, und angeboten wird nur, was wirklich
 * ein Foto hat. Hochgeladen wird hier nichts: die Fotos pflegt der Betreiber
 * an einer Stelle, und zwei Stellen waeren eine zu viel.
 */

export const KEIN_FOTO = '-';

interface Treffer { epicId: string; anzeige: string; bild: string | null }

export default function FotoWahl({ wert, eigenes, onWahl }: {
  /** Was eingestellt ist: leer, "-" oder ein Pfad. */
  wert: string;
  /** Das gepflegte Foto des Kontos - fuer die Vorschau von "automatisch". */
  eigenes?: string | null;
  onWahl: (wert: string) => void;
}) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [laedt, setLaedt] = useState(false);
  const lauf = useRef(0);

  useEffect(() => {
    if (!offen || suche.trim().length < 2) {
      const leeren = setTimeout(() => setTreffer([]), 0);
      return () => clearTimeout(leeren);
    }
    const meiner = lauf.current + 1;
    lauf.current = meiner;
    const stift = setTimeout(async () => {
      setLaedt(true);
      try {
        const j = await (await fetch('/api/szene-stats?ansicht=suche'
          + `&q=${encodeURIComponent(suche.trim())}`)).json();
        if (lauf.current !== meiner) return;
        setTreffer((j?.spieler ?? [])
          .filter((x: Treffer) => x.bild)
          .slice(0, 12));
      } catch {
        if (lauf.current === meiner) setTreffer([]);
      } finally {
        if (lauf.current === meiner) setLaedt(false);
      }
    }, 300);
    return () => clearTimeout(stift);
  }, [suche, offen]);

  /** Was gerade gilt - fuer die kleine Vorschau. */
  const jetzt = wert === KEIN_FOTO ? null : (wert || eigenes || null);

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2">
        {jetzt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={jetzt} alt=""
            className="h-8 w-8 shrink-0 rounded object-cover" />
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded
                           border border-dashed border-zinc-700 text-[9px]
                           text-slate-600">
            <T>kein</T>
          </span>
        )}

        <button type="button" onClick={() => setOffen((v) => !v)}
          className="rounded-lg border border-zinc-800 px-2.5 py-1 text-[11px]
                     text-slate-400 transition hover:border-sky-500/60
                     hover:text-sky-400">
          {wert === KEIN_FOTO
            ? <T>kein Foto</T>
            : wert ? <T>eigenes Foto</T> : <T>Foto automatisch</T>}
        </button>
      </div>

      {offen && (
        <div className="mt-2 rounded-lg border border-zinc-800 p-2">
          <div className="mb-2 flex flex-wrap gap-1">
            <button type="button"
              onClick={() => { onWahl(''); setOffen(false); }}
              className={`rounded border px-2 py-1 text-[11px] transition ${
                wert === ''
                  ? 'border-sky-500 text-sky-400'
                  : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
              <T>Automatisch</T>
            </button>
            <button type="button"
              onClick={() => { onWahl(KEIN_FOTO); setOffen(false); }}
              className={`rounded border px-2 py-1 text-[11px] transition ${
                wert === KEIN_FOTO
                  ? 'border-sky-500 text-sky-400'
                  : 'border-zinc-800 text-slate-400 hover:border-zinc-700'}`}>
              <T>Kein Foto</T>
            </button>
          </div>

          <input value={suche} onChange={(e) => setSuche(e.target.value)}
            placeholder={t('Anderes Foto — Namen eintippen')}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950
                       px-2.5 py-1.5 text-[12px] text-slate-100 outline-none
                       placeholder:text-slate-600 focus:border-sky-500" />

          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {treffer.map((x) => (
              <button key={x.epicId} type="button"
                title={x.anzeige}
                onClick={() => { onWahl(x.bild ?? ''); setOffen(false); }}
                className="overflow-hidden rounded border border-zinc-800
                           transition hover:border-sky-500">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.bild ?? ''} alt={x.anzeige}
                  className="h-12 w-12 object-cover" />
              </button>
            ))}
            {!treffer.length && (
              <p className="py-1 text-[11px] text-slate-600">
                {laedt
                  ? <T>sucht …</T>
                  : suche.trim().length < 2
                    ? <T>Namen eintippen — gezeigt wird, wer ein Foto hat.</T>
                    : <T>Niemand mit Foto gefunden.</T>}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
