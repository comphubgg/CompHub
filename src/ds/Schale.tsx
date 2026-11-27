import { motion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Kopf from '../teile/Kopf';
import { BEREICHE, aktiveSeite, type BereichInfo } from './seiten';

/*
 * Die Schale eines Bereichs (Design-System 3.0): Kopfzeile (Logo zurueck zum Start, Bereichsname, Schnellsuche, Konto) und darunter EINE Leiste
 * mit allen Seiten des Bereichs - Gruppen nur durch einen feinen Strich getrennt, kein Ausklappen, kein Umschalten (Betreiber, 27.11.2026).
 * Passt die Leiste nicht in die Breite, rollt sie: mit dem Mausrad, mit den Pfeilen am Rand oder durch Wischen; die aktive Seite rollt ins Bild.
 * Setzt data-bereich - daraus kommt die Akzentfarbe (text-akz, bg-akz ...) aller Seiten darin.
 */
export function Leiste({ bereich }: { bereich: BereichInfo }) {
  const ort = useLocation();
  const aktiv = aktiveSeite(bereich, ort.pathname);
  const reihe = useRef<HTMLDivElement>(null);
  const [rand, setRand] = useState({ l: false, r: false });
  const messen = () => { const el = reihe.current; if (el) setRand({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }); };
  useEffect(() => {
    const el = reihe.current; if (!el) return undefined;
    // Mausrad rollt die Leiste seitlich (sonst kaeme man mit der Maus nicht an die hinteren Seiten)
    const rad = (e: WheelEvent) => { if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return; e.preventDefault(); el.scrollLeft += e.deltaY; };
    el.addEventListener('wheel', rad, { passive: false }); el.addEventListener('scroll', messen, { passive: true }); window.addEventListener('resize', messen); messen();
    return () => { el.removeEventListener('wheel', rad); el.removeEventListener('scroll', messen); window.removeEventListener('resize', messen); };
  }, []);
  useEffect(() => { reihe.current?.querySelector('[data-an="1"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); setTimeout(messen, 350); }, [ort.pathname]);
  const rollen = (r: number) => reihe.current?.scrollBy({ left: r * reihe.current.clientWidth * 0.7, behavior: 'smooth' });
  const pfeil = (r: number) => (
    <button type="button" aria-label={r < 0 ? 'Scroll left' : 'Scroll right'} onClick={() => rollen(r)}
      className={`absolute top-0 z-10 flex h-full w-14 items-center ${r < 0 ? 'left-0 justify-start bg-gradient-to-r pl-2' : 'right-0 justify-end bg-gradient-to-l pr-2'} from-grund via-grund/90 to-transparent text-white/60 hover:text-white`}>
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={r < 0 ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'} /></svg>
    </button>
  );
  return (
    <div className="sticky top-14 z-30 border-b border-white/[0.07] bg-grund/90 backdrop-blur-xl">
      <div className="relative">
        {rand.l && pfeil(-1)}
        <nav ref={reihe} className="ohne-leiste flex items-stretch overflow-x-auto px-4 lg:px-8">
          {bereich.gruppen.map((g, gi) => (
            <div key={g.titel} className="flex shrink-0 items-stretch">
              {gi > 0 && <span aria-hidden className="mx-2 my-3 w-px bg-white/10" />}
              {g.seiten.map((s) => {
                const an = aktiv === s;
                return (
                  <Link key={s.pfad} to={`${bereich.basis}${s.pfad ? `/${s.pfad}` : ''}`} data-an={an ? '1' : '0'} title={s.text}
                    className={`relative shrink-0 px-3 py-3 text-[13px] font-semibold transition-colors ${an ? 'text-white' : 'text-white/45 hover:text-white/90'}`}>
                    {s.titel}
                    {an && <motion.span layoutId={`leiste-${bereich.id}`} className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-akz shadow-[0_0_16px_rgb(var(--akz)/0.9)]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {rand.r && pfeil(1)}
      </div>
    </div>
  );
}

/** Rahmen eines Bereichs: Kopf, Leiste, Inhalt ueber die volle Breite. `ohneRand`: Inhalt ohne Innenabstand (z. B. Karten ueber den ganzen Schirm). */
export default function Schale({ bereich, children, ohneRand = false }: { bereich: keyof typeof BEREICHE; children: ReactNode; ohneRand?: boolean }) {
  const b = BEREICHE[bereich];
  return (
    <div data-bereich={bereich} className="min-h-screen">
      <Kopf bereich={bereich} />
      <Leiste bereich={b} />
      <main className={ohneRand ? '' : 'px-4 py-7 lg:px-8'}>{children}</main>
    </div>
  );
}
