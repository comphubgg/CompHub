import { motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { selten } from './waffenDaten';

/*
 * Kleine Teile der Waffen-Seiten (Design 3.0, 28.11.2026): Waffenbild auf dem Schein seiner Seltenheit, Reiter Loot Pool / Compare / Changes,
 * Zahl mit Beschriftung, Info-Tipp. Seltenheitsfarben sind Spiel-Semantik (wie Gold fuer #1) - die Bereichsfarbe kommt nur ueber akz.
 */

/**
 * Waffenbild. Fehlt es (oder laedt nicht), steht dort NICHTS - kein "?", keine Buchstaben (Betreiber 28.11.2026).
 * Nie hochskaliert: hoechstens so gross, wie die Datei ist (die Spiel-Symbole unter /waffen haben 160 px).
 */
export function WaffenBild({ bild, name, className = 'h-24 w-24', schatten = true }: { bild: string | null | undefined; name: string; className?: string; schatten?: boolean }) {
  const [kaputt, setKaputt] = useState<string | null>(null);
  const [gross, setGross] = useState<{ w: number; h: number } | null>(null);
  if (!bild || kaputt === bild) return <span className={`block ${className}`} aria-hidden />;
  return <img src={bild} alt={name} loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setKaputt(bild)}
    onLoad={(e) => setGross({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
    style={gross ? { maxWidth: gross.w, maxHeight: gross.h, marginInline: 'auto' } : undefined}
    className={`${className} object-contain ${schatten ? 'drop-shadow-[0_14px_22px_rgba(0,0,0,0.7)]' : ''}`} />;
}

/** Hintergrund-Schein in der Farbe der Seltenheit (fuer Bildflaechen). */
export const schein = (rarity: string, staerke = 0.45) => {
  const f = selten(rarity).farbe; const a = Math.round(staerke * 255).toString(16).padStart(2, '0');
  return { background: `radial-gradient(90% 85% at 50% 30%, ${f}${a}, ${f}12 62%, transparent 80%)` };
};

/** Reiter der Waffen-Seiten - immer alle drei sichtbar. */
export function WaffenReiter({ ids }: { ids: string[] }) {
  const t = ({ isActive }: { isActive: boolean }) => `relative rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${isActive ? 'bg-akz text-[#04050a] shadow-[0_6px_18px_-6px_rgb(var(--akz)/0.9)]' : 'text-white/60 hover:text-white'}`;
  return (
    <nav className="inline-flex rounded-xl border border-white/10 bg-black/40 p-1">
      <NavLink to="/community/weapons" end className={t}>Loot Pool</NavLink>
      <NavLink to={`/community/weapons/compare${ids.length ? `?w=${ids.join(',')}` : ''}`} className={t}>Compare{ids.length ? <span className="zahl ml-1.5 rounded-full bg-black/25 px-1.5 text-[11px]">{ids.length}</span> : null}</NavLink>
      <NavLink to="/community/weapons/changes" className={t}>Changes</NavLink>
    </nav>
  );
}

/** Wert mit kleiner Beschriftung darueber - fuer Zahlenreihen. */
export function Wert({ titel, wert, unter, gross = false, ton }: { titel: string; wert: ReactNode; unter?: ReactNode; gross?: boolean; ton?: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">{titel}</p>
      <p className={`titel zahl mt-0.5 ${gross ? 'text-5xl lg:text-6xl' : 'text-3xl'} ${ton ?? ''}`}>{wert}</p>
      {unter && <p className="truncate text-[11px] text-white/45">{unter}</p>}
    </div>
  );
}

/** Kleiner Info-Punkt: Erklaerung beim Ueberfahren/Antippen (z. B. die TTK-Formel). */
export function Tipp({ children }: { children: ReactNode }) {
  const [offen, setOffen] = useState(false);
  return (
    <span className="relative inline-flex align-middle">
      <button type="button" onClick={() => setOffen((o) => !o)} onMouseEnter={() => setOffen(true)} onMouseLeave={() => setOffen(false)} aria-label="How it's calculated"
        className="grid h-4 w-4 place-items-center rounded-full border border-white/20 text-[9px] font-bold text-white/55 hover:border-akz/60 hover:text-white">i</button>
      {offen && (
        <motion.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="absolute right-0 top-6 z-30 w-72 rounded-xl border border-white/10 bg-[#07090f] p-3 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-white/70 shadow-2xl">
          {children}
        </motion.span>
      )}
    </span>
  );
}

/** Duenner Balken, waechst beim Erscheinen. */
export function Linie({ anteil, ton = 'bg-akz' }: { anteil: number; ton?: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
      <motion.div className={`h-full rounded-full ${ton}`} initial={{ width: 0 }} whileInView={{ width: `${Math.max(0, Math.min(100, anteil))}%` }} viewport={{ once: true }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
    </div>
  );
}
