import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

/*
 * Gemeinsame Bausteine von Community und Streamer: die Unter-Navigation in der Farbe des Bereichs (wie src/teile/CompNav.tsx) und die
 * Seitenueberschrift mit farbiger Oberzeile. Farbe als RGB-Dreier, damit Rand, Schein und Hintergrund dieselbe Farbe in verschiedener Deckkraft tragen.
 */
export const TEAL = '45,212,191';
export const VIOLETT = '167,139,250';

export function BereichNav({ basis, seiten, farbe, rechts }: { basis: string; seiten: Array<{ pfad: string; titel: string; zeichen?: string }>; farbe: string; rechts?: ReactNode }) {
  return (
    <div className="sticky top-[57px] z-20 border-b border-white/5 bg-[#06080f]/60 backdrop-blur-xl">
      <nav className="flex items-center gap-1 overflow-x-auto px-6 py-2 [scrollbar-width:none] lg:px-10 [&::-webkit-scrollbar]:hidden">
        {seiten.map((s) => (
          <NavLink key={s.pfad} to={`${basis}${s.pfad ? `/${s.pfad}` : ''}`} end
            className={({ isActive }) => `relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${isActive ? 'text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}
            style={({ isActive }) => (isActive ? { background: `rgba(${farbe},0.16)`, boxShadow: `inset 0 0 0 1px rgba(${farbe},0.35)` } : undefined)}>
            {s.zeichen && <span className="mr-1.5 opacity-70">{s.zeichen}</span>}{s.titel}
          </NavLink>
        ))}
        {rechts && <div className="ml-auto shrink-0">{rechts}</div>}
      </nav>
    </div>
  );
}

export function Ueberschrift({ ueber, titel, text, farbe, rechts }: { ueber: string; titel: string; text?: ReactNode; farbe: string; rechts?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${farbe})` }}>{ueber}</p>
        <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white">{titel}</h1>
        {text && <p className="mt-2 max-w-3xl text-white/55">{text}</p>}
      </div>
      {rechts}
    </motion.div>
  );
}

/** Kleine Kennzeichnung "kommt bald" - wo eine Zahl noch fehlt, steht das statt einer erfundenen. */
export function Bald({ text = 'coming soon' }: { text?: string }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">{text}</span>;
}

/** Ladepunkt im Bereichston. */
export function Laedt({ farbe, text = 'Loading …' }: { farbe: string; text?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-white/50">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/10" style={{ borderTopColor: `rgb(${farbe})` }} />{text}
    </div>
  );
}
