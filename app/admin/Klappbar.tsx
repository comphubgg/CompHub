'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';

/*
 * Ein Balken, der etwas auf- und zuklappt.
 *
 * Der Betreiber (11.10.2026): "Usage und Admin Center eher unten, als eine Linie;
 * wenn ich auf den Balken druecke, oeffnet es das, dann kann ich wieder zuklappen
 * und oeffnen - eine Klappfunktion." Der Inhalt bleibt geladen, auch wenn er
 * zu ist (er wird nur verborgen), damit sich beim Aufklappen nichts erst noch
 * laedt. Ob offen oder zu, merkt sich der Browser je Balken.
 */
export default function Klappbar({ titel, kennung, hinweis, children }: {
  titel: string;
  /** Unter diesem Namen merkt sich der Browser den Zustand. */
  kennung: string;
  /** Eine kurze Zeile rechts im Balken, zum Beispiel was darin steht. */
  hinweis?: string;
  children: React.ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  const schluessel = `comphub-klapp:${kennung}`;

  // Erst nach dem ersten Zeichnen lesen, damit Server und Browser dasselbe sehen.
  useEffect(() => {
    try { setOffen(window.localStorage.getItem(schluessel) === '1'); } catch { /* ohne Speicher bleibt es zu */ }
  }, [schluessel]);

  const umschalten = () => {
    setOffen((o) => {
      try { window.localStorage.setItem(schluessel, o ? '0' : '1'); } catch { /* egal */ }
      return !o;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60">
      <button type="button" onClick={umschalten} aria-expanded={offen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-900/60">
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${offen ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-semibold text-slate-100"><T>{titel}</T></span>
        {hinweis && <span className="truncate text-xs text-slate-500"><T>{hinweis}</T></span>}
        <span className="ml-auto text-[11px] text-slate-500">{offen ? <T>zuklappen</T> : <T>öffnen</T>}</span>
      </button>
      <div hidden={!offen} className="border-t border-zinc-800 p-3 sm:p-4">
        {children}
      </div>
    </div>
  );
}
