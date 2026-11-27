import { useEffect, useState } from 'react';
import T from '../port/app/components/T';

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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
      <button type="button" onClick={umschalten} aria-expanded={offen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.06]">
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-white/55 transition-transform ${offen ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-sm font-semibold text-white"><T>{titel}</T></span>
        {hinweis && <span className="truncate text-xs text-white/40"><T>{hinweis}</T></span>}
        <span className="ml-auto text-[11px] text-white/40">{offen ? <T>zuklappen</T> : <T>öffnen</T>}</span>
      </button>
      <div hidden={!offen} className="border-t border-white/10 p-3 sm:p-4">
        {children}
      </div>
    </div>
  );
}
