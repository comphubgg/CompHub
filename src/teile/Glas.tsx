import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Die Glas-Tafel - Grundbaustein aller Hub-Seiten. */
/** dunkel: dichteres Glas fuer Seiten mit viel Inhalt (Betreiber: Match Finder "das Glas ist noch ein bisschen zu ..." - Hintergrund schien zu stark durch). */
export function Glas({ children, className = '', verzoegerung = 0, dunkel = false }: { children: ReactNode; className?: string; verzoegerung?: number; dunkel?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: verzoegerung, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`rounded-3xl border border-white/10 ${dunkel ? 'bg-[#080b14]/75 backdrop-blur-2xl' : 'bg-white/[0.035] backdrop-blur-xl'} ${className}`}>
      {children}
    </motion.div>
  );
}

export function Titel({ ueber, titel, text }: { ueber: string; titel: string; text?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">{ueber}</p>
      <h1 className="mt-1 text-5xl font-extrabold tracking-tight text-white">{titel}</h1>
      {text && <p className="mt-2 text-white/55">{text}</p>}
    </motion.div>
  );
}

export const SEITE = 'https://www.thecomphub.com';
export const flagge = (l?: string | null) => (l ? `/flags/${l.toLowerCase()}.png` : '');
