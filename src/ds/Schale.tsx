import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Kopf from '../teile/Kopf';
import { BEREICHE, aktiveSeite, type BereichInfo, type Seite } from './seiten';

/*
 * Die Schale eines Bereichs (Design-System 3.0). Kopfzeile (Logo zurueck zum Start, Bereichsname, Schnellsuche, Konto) und darunter die Leiste:
 *
 *   [ Menu ]  Hauptseiten des Bereichs ...                                   (Betreiber, 27.11.2026: "am liebsten wie bei fortnite.gg ...
 *                                                                              ein Pop-up-Fenster, wo alles drin ist")
 * "Menu" oeffnet per KLICK ein Fenster mit ALLEN Seiten des Bereichs, nach Gruppen sortiert, mit Filterfeld - es schliesst beim Klick daneben,
 * mit Escape und nach der Wahl. Die Leiste daneben zeigt nur die Hauptseiten (seiten.ts: haupt) und, wenn man auf einer anderen Seite steht,
 * diese dazu. Passt sie nicht in die Breite, rollt sie mit dem Mausrad oder den Pfeilen am Rand. Kein Ausklappen beim Ueberfahren.
 * Setzt data-bereich - daraus kommt die Akzentfarbe (text-akz, bg-akz ...) aller Seiten darin.
 */
const zu = (b: BereichInfo, s: Seite) => `${b.basis}${s.pfad ? `/${s.pfad}` : ''}`;

function MenueFenster({ bereich, aktiv, zuMachen }: { bereich: BereichInfo; aktiv: Seite | null; zuMachen: () => void }) {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const s = q.trim().toLowerCase();
  const gruppen = useMemo(() => bereich.gruppen.map((g) => ({ ...g, seiten: g.seiten.filter((x) => !s || x.titel.toLowerCase().includes(s) || (x.text ?? '').toLowerCase().includes(s)) })).filter((g) => g.seiten.length), [bereich, s]);
  const alle = gruppen.flatMap((g) => g.seiten);
  return (
    <motion.div initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="fl-fest absolute left-4 right-4 top-full z-40 mt-2 origin-top-left overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.85)] lg:left-8 lg:right-auto lg:w-[min(1100px,calc(100vw-4rem))]">
      <span aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-akz/15 blur-3xl" />
      <div className="relative flex items-center gap-3 border-b border-white/[0.07] px-5 py-3">
        <p className="titel text-2xl">{bereich.titel}</p>
        <span className="text-xs text-white/40">{bereich.gruppen.reduce((n, g) => n + g.seiten.length, 0)} pages</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter pages …" spellCheck={false}
          onKeyDown={(e) => { if (e.key === 'Enter' && alle[0]) { zuMachen(); nav(zu(bereich, alle[0])); } }}
          className="eingabe ml-auto w-56 !py-1.5" />
      </div>
      <div className="relative max-h-[70vh] overflow-y-auto p-4">
        <div className="gap-6 [column-fill:balance] sm:columns-2 lg:columns-3 xl:columns-4">
          {gruppen.map((g, gi) => (
            <div key={g.titel} className="mb-5 break-inside-avoid">
              <p className="mb-1.5 flex items-center gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-akz"><span className="h-px w-4 bg-akz" />{g.titel}</p>
              {g.seiten.map((x, i) => (
                <motion.div key={x.pfad} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(0.25, gi * 0.03 + i * 0.02) }}>
                  <Link to={zu(bereich, x)} onClick={zuMachen}
                    className={`group flex items-baseline gap-2 rounded-xl px-2.5 py-2 transition ${aktiv === x ? 'bg-akz/15 ring-1 ring-akz/40' : 'hover:bg-white/[0.06]'}`}>
                    <span className="shrink-0 text-sm font-bold text-white group-hover:text-akz">{x.titel}</span>
                    {x.text && <span className="truncate text-xs text-white/40">{x.text}</span>}
                  </Link>
                </motion.div>
              ))}
            </div>
          ))}
        </div>
        {!gruppen.length && <p className="py-8 text-center text-sm text-white/45">No page matches “{q}”.</p>}
      </div>
    </motion.div>
  );
}

export function Leiste({ bereich }: { bereich: BereichInfo }) {
  const ort = useLocation();
  const aktiv = aktiveSeite(bereich, ort.pathname);
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);
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
  useEffect(() => { setOffen(false); reihe.current?.querySelector('[data-an="1"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); setTimeout(messen, 350); }, [ort.pathname]);
  useEffect(() => {
    if (!offen) return undefined;
    const daneben = (e: PointerEvent) => { if (!huelle.current?.contains(e.target as Node)) setOffen(false); };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('pointerdown', daneben); document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('pointerdown', daneben); document.removeEventListener('keydown', taste); };
  }, [offen]);

  // Hauptseiten, und die offene Seite dazu, wenn sie keine Hauptseite ist
  const haupt = bereich.gruppen.flatMap((g) => g.seiten).filter((s) => s.haupt);
  const zeigen = aktiv && !haupt.includes(aktiv) ? [...haupt, aktiv] : haupt;
  const rollen = (r: number) => reihe.current?.scrollBy({ left: r * reihe.current.clientWidth * 0.7, behavior: 'smooth' });
  const pfeil = (r: number) => (
    <button type="button" aria-label={r < 0 ? 'Scroll left' : 'Scroll right'} onClick={() => rollen(r)}
      className={`absolute top-0 z-10 flex h-full w-12 items-center ${r < 0 ? 'left-0 justify-start bg-gradient-to-r pl-1' : 'right-0 justify-end bg-gradient-to-l pr-1'} from-grund via-grund/90 to-transparent text-white/70 hover:text-white`}>
      <span className="grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-fl"><svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={r < 0 ? 'M12 5l-5 5 5 5' : 'M8 5l5 5-5 5'} /></svg></span>
    </button>
  );
  return (
    <div ref={huelle} className="sticky top-14 z-30 border-b border-white/[0.07] bg-grund/90 backdrop-blur-xl">
      <div className="flex items-stretch gap-2 px-4 lg:px-8">
        <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen}
          className={`my-1.5 flex shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[13px] font-bold transition ${offen ? 'border-akz/60 bg-akz/15 text-white' : 'border-white/10 bg-white/[0.05] text-white hover:border-akz/40'}`}>
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-akz" fill="currentColor"><rect x="2" y="2" width="6.5" height="6.5" rx="1.5" /><rect x="11.5" y="2" width="6.5" height="6.5" rx="1.5" /><rect x="2" y="11.5" width="6.5" height="6.5" rx="1.5" /><rect x="11.5" y="11.5" width="6.5" height="6.5" rx="1.5" /></svg>
          Menu
          <motion.svg animate={{ rotate: offen ? 180 : 0 }} viewBox="0 0 20 20" className="h-3.5 w-3.5 text-white/50" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></motion.svg>
        </button>
        <div className="relative min-w-0 flex-1">
          {rand.l && pfeil(-1)}
          <nav ref={reihe} className="ohne-leiste flex items-stretch overflow-x-auto">
            {zeigen.map((s) => {
              const an = aktiv === s;
              return (
                <Link key={s.pfad} to={zu(bereich, s)} data-an={an ? '1' : '0'} title={s.text}
                  className={`relative shrink-0 px-3.5 py-3 text-[13px] font-semibold transition-colors ${an ? 'text-white' : 'text-white/45 hover:text-white/90'}`}>
                  {s.titel}
                  {an && <motion.span layoutId={`leiste-${bereich.id}`} className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-full bg-akz shadow-[0_0_16px_rgb(var(--akz)/0.9)]" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
                </Link>
              );
            })}
          </nav>
          {rand.r && pfeil(1)}
        </div>
      </div>
      <AnimatePresence>{offen && <MenueFenster bereich={bereich} aktiv={aktiv} zuMachen={() => setOffen(false)} />}</AnimatePresence>
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
