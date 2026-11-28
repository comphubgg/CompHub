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
/*
 * Flaggen liegen nur fuer diese Laender als Datei vor (public/flags auf thecomphub.com, wie VORHANDEN in comp/mehr/teile.tsx). Epic liefert fuer
 * England/Wales/Schottland eigene Kuerzel (EN, WAL, SC) - die zeigen die britische Flagge; alles andere ohne Datei den Globus statt eines
 * kaputten Bildes (vorher 404 bei en.png, wal.png, uy.png ... in Rankings, Tierlist, FNCS).
 */
const FLAGGEN = new Set(('ae al ar at au ba be bg bh br by ca ch cn co cz de dk ee eg es fi fr gb gr hr hu ie il in ir is it jp kr kw lb lt lv '
  + 'mc md mk mx ng nl no nz om pe pl pt ro rs ru sa se si sk sy tr ua us ve ye').split(' '));
const FLAGGE_ALIAS: Record<string, string> = { en: 'gb', eng: 'gb', wal: 'gb', wls: 'gb', sc: 'gb', sco: 'gb', sct: 'gb', nir: 'gb', uk: 'gb' };
export const flagge = (l?: string | null) => {
  if (!l) return '';
  const k = l.toLowerCase();
  const d = FLAGGE_ALIAS[k] ?? k;
  return FLAGGEN.has(d) ? `/flags/${d}.png` : '/flags/flag-GLOBE.png';
};
