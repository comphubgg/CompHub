import type { ReactNode } from 'react';

/*
 * Der gemeinsame Kopf der Dashboard-Seiten (Betreiber, 14.10.2026: Overlays, Globals Solos, POV, Kontakt, Prognosen "komplett anders"): eine Flaeche mit
 * Leuchten, darauf ueber der Ueberschrift eine kleine blaue Zeile (was fuer ein Bereich das ist), darunter der Erklaertext. Rechts ist Platz fuer
 * Knoepfe oder Auswahl. Dieselbe Sprache wie der Kopf des Dashboards und der Statistik: rund, mit Schatten, ein Blau.
 */
export default function SeitenKopf({ marke, titel, text, rechts, className = '' }: {
  /** Die kleine Zeile ueber der Ueberschrift - bereits uebersetzt. */
  marke?: ReactNode;
  titel: ReactNode;
  text?: ReactNode;
  rechts?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-6 shadow-[0_10px_30px_rgba(15,23,42,.18)] sm:p-8 ${className}`}>
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-500/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          {marke && <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500">{marke}</p>}
          <h1 className="mt-1 text-3xl font-extrabold text-white sm:text-4xl">{titel}</h1>
          {text && <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>}
        </div>
        {rechts && <div className="flex flex-wrap items-center gap-2">{rechts}</div>}
      </div>
    </section>
  );
}
