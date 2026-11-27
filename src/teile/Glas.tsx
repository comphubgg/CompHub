import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/** Die Glas-Tafel - Grundbaustein aller Hub-Seiten. */
/** dunkel: dichteres Glas fuer Seiten mit viel Inhalt (Betreiber: Match Finder "das Glas ist noch ein bisschen zu ..." - Hintergrund schien zu stark durch). */
export function Glas({ children, className = '', verzoegerung = 0 }: { children: ReactNode; className?: string; verzoegerung?: number; dunkel?: boolean }) {
  // Seit dem Design-System 3.0 (27.11.2026) ist jede Glas-Tafel die dichte, dunkle Flaeche .fl (src/index.css) - `dunkel` gibt es nur noch dem Namen nach.
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: verzoegerung, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`fl ${className}`}>
      {children}
    </motion.div>
  );
}

export function Titel({ ueber, titel, text }: { ueber: string; titel: string; text?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <p className="ueber">{ueber}</p>
      <h1 className="titel mt-1 text-6xl lg:text-7xl">{titel}</h1>
      {text && <p className="mt-2 text-white/55">{text}</p>}
    </motion.div>
  );
}

export const SEITE = 'https://www.thecomphub.com';
export const flagge = (l?: string | null) => (l ? `/flags/${l.toLowerCase()}.png` : '');
