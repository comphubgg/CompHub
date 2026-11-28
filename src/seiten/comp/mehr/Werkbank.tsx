import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';

/*
 * Die Werkbank der Karten-Seiten (Design-System 3.0, 27.11.2026): die Karte fuellt die Hoehe des Bildschirms, links und rechts haengen
 * angedockte Tafeln, die in sich rollen - die Seite selbst rollt auf dem Rechner nicht mehr (Betreiber: "a map/tool page fills the viewport").
 *   useRestHoehe()  misst, wie viel Hoehe unter einem Element bis zum unteren Bildschirmrand bleibt
 *   <Werkbank>      drei Zonen: Tafel links, Karte (quadratisch, so hoch wie der Bildschirm), Tafel rechts; auf dem Handy untereinander, Karte zuerst
 *   <Dock>          eine angedockte Tafel: Kopfzeile, rollender Inhalt, optional ein fester Fuss
 *   <KopfBand>      das niedrige Kopfband darueber (zurueck, Bild, Titel, Marken, Aktionen)
 */

/** Die Hoehe vom oberen Rand des Elements bis zum unteren Bildschirmrand (bei Seitenanfang) - folgt Fenstergroesse und allem, was darueber waechst. */
export function useRestHoehe(min = 480, unten = 20): [RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(640);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const messen = () => {
      const oben = el.getBoundingClientRect().top + window.scrollY;
      const neu = Math.max(min, Math.round(window.innerHeight - oben - unten));
      setH((alt) => (Math.abs(alt - neu) > 1 ? neu : alt));
    };
    messen();
    window.addEventListener('resize', messen);
    // Waechst etwas ueber der Werkbank (Spieltage, Hinweise), rueckt sie nach unten - dann neu messen.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(messen) : null;
    if (ro && el.parentElement) ro.observe(el.parentElement);
    return () => { window.removeEventListener('resize', messen); ro?.disconnect(); };
  }, [min, unten]);
  return [ref, h];
}

/**
 * Drei Zonen nebeneinander (ab 1280 px): die Karte in der Mitte ist so breit wie die Werkbank hoch ist, die Tafeln teilen sich den Rest.
 * Darunter (Handy, schmale Fenster): Karte zuerst, dann die Tafeln mit begrenzter Hoehe.
 */
export function Werkbank({ links, rechts, children, min, className = '' }: { links?: ReactNode; rechts?: ReactNode; children: ReactNode; min?: number; className?: string }) {
  const [ref, h] = useRestHoehe(min);
  const spalten = links && rechts ? 'xl:grid-cols-[minmax(270px,1fr)_minmax(0,var(--wb))_minmax(270px,1fr)]'
    : links ? 'xl:grid-cols-[minmax(300px,1fr)_minmax(0,var(--wb))]' : rechts ? 'xl:grid-cols-[minmax(0,var(--wb))_minmax(300px,1fr)]' : '';
  return (
    <div ref={ref} style={{ '--wb': `${h}px` } as CSSProperties} className={`grid gap-3 xl:h-[var(--wb)] ${spalten} ${className}`}>
      {links && <div className="order-2 flex max-h-[75vh] min-h-0 min-w-0 flex-col gap-3 xl:order-none xl:max-h-none">{links}</div>}
      <div className="order-1 flex min-h-0 min-w-0 items-start justify-center xl:order-none">{children}</div>
      {rechts && <div className="order-3 flex max-h-[75vh] min-h-0 min-w-0 flex-col gap-3 xl:order-none xl:max-h-none">{rechts}</div>}
    </div>
  );
}

/** Eine angedockte Tafel: feste Kopfzeile, Inhalt rollt in sich. `fest`: Inhalt ohne eigenes Rollen (der Inhalt regelt es selbst). */
export function Dock({ titel, zahl, rechts, kopf, children, fuss, className = '', fest = false, eng = false }: {
  titel?: ReactNode; zahl?: ReactNode; rechts?: ReactNode; kopf?: ReactNode; children: ReactNode; fuss?: ReactNode; className?: string; fest?: boolean; eng?: boolean;
}) {
  return (
    <section className={`fl-fest flex min-h-0 flex-col overflow-hidden ${eng ? 'shrink-0' : 'flex-1'} ${className}`}>
      {(titel || rechts) && (
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-4 py-3">
          <span className="h-4 w-1 shrink-0 rounded-full bg-akz" />
          <h2 className="titel min-w-0 truncate text-xl">{titel}{zahl != null && <span className="zahl ml-2 font-text text-xs font-semibold normal-case tracking-normal text-white/40">{zahl}</span>}</h2>
          {rechts && <div className="ml-auto flex shrink-0 items-center gap-2">{rechts}</div>}
        </header>
      )}
      {kopf && <div className="shrink-0 border-b border-white/[0.06] px-3 py-2.5">{kopf}</div>}
      <div className={fest ? 'flex min-h-0 flex-1 flex-col' : 'min-h-0 flex-1 overflow-y-auto'}>{children}</div>
      {fuss && <footer className="shrink-0 border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-white/40">{fuss}</footer>}
    </section>
  );
}

/**
 * Das schmale Kopfband ueber einer Werkbank: Zurueck-Knopf, optional ein 16:9-Bild, Zeile darueber, Titel, Marken - rechts Umschalter und Knoepfe.
 * Bewusst niedrig, damit die Karte darunter die Hoehe bekommt.
 */
export function KopfBand({ zurueck, zurueckTitel = 'Back', bild, ueber, titel, marken, rechts }: {
  zurueck?: string; zurueckTitel?: string; bild?: ReactNode; ueber?: ReactNode; titel: ReactNode; marken?: ReactNode; rechts?: ReactNode;
}) {
  return (
    <header className="fl-fest flex flex-wrap items-center gap-x-4 gap-y-3 p-2.5 pr-4">
      {zurueck && (
        <Link to={zurueck} title={zurueckTitel} aria-label={zurueckTitel}
          className="grid h-[72px] w-10 shrink-0 place-items-center rounded-2xl border border-white/[0.07] bg-black/40 text-white/60 transition hover:border-akz/50 hover:text-white">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5l-5 5 5 5" /></svg>
        </Link>
      )}
      {bild}
      <div className="min-w-0 flex-1 basis-[260px]">
        {ueber && <p className="ueber truncate !tracking-[0.25em]">{ueber}</p>}
        <h1 className="titel mt-0.5 truncate text-3xl sm:text-4xl">{titel}</h1>
        {marken && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{marken}</div>}
      </div>
      {rechts && <div className="flex max-w-full flex-wrap items-center justify-end gap-2">{rechts}</div>}
    </header>
  );
}
