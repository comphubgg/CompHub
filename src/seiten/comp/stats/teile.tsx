import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/*
 * Kleine Bausteine fuer Statistics, Deep Stats und Replays (Design-System 3.0): alles in der Akzentfarbe des Bereichs (akz), Flaechen kommen
 * aus src/ds/Bausteine.tsx. Hier nur, was diese drei Seiten zusaetzlich brauchen: Zahlen formatieren, Pillen, Balken, Hochkant-Portraet.
 */

export const zahl = (n: number | null | undefined, nachkomma = 0) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma }) : '–';
export const prozent = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–');

/** Ein Schalter in einer Pillenreihe (.chip / .chip-an). `farbe`: kleiner Punkt davor (z. B. Waffenklasse). */
export function Chip({ an, onClick, children, farbe, className = '' }: { an: boolean; onClick: () => void; children: ReactNode; farbe?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`chip whitespace-nowrap ${an ? 'chip-an' : ''} ${className}`}>
      {farbe && <span className="h-2 w-2 rounded-full" style={{ background: farbe }} />}
      {children}
    </button>
  );
}

/** Ein Balken, der beim Erscheinen hineinwaechst. Ohne `farbe` in der Akzentfarbe des Bereichs. */
export function Balken({ wert, max, farbe = 'rgb(var(--akz))', hoehe = 'h-1.5', verzoegerung = 0 }: { wert: number; max: number; farbe?: string; hoehe?: string; verzoegerung?: number }) {
  return (
    <span className={`block w-full overflow-hidden rounded-full bg-white/[0.07] ${hoehe}`}>
      <motion.span className="block h-full rounded-full" style={{ background: farbe }} initial={{ width: 0 }}
        animate={{ width: `${Math.max(1.5, (wert / Math.max(1, max)) * 100)}%` }} transition={{ duration: 0.8, delay: verzoegerung, ease: [0.22, 1, 0.36, 1] }} />
    </span>
  );
}

/** Kleine Beschriftung ueber einem Block (gesperrt, grau). */
export function Klein({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40 ${className}`}>{children}</p>;
}

/**
 * Spielerbild als Hochformat (Betreiber: Portraet-Rechtecke, keine runden Kreise). Ohne Foto steht dort NICHTS (Betreiber: "Profilbild oder gar
 * nichts" - keine Buchstaben-Kaesten); mit `platz` bleibt die Breite frei, damit Spalten einer Liste untereinander stehen. `gross` = Hoehe in px.
 */
export function Portraet({ bild, gross = 48, platz = false }: { bild?: string | null; gross?: number; platz?: boolean }) {
  const mass = { width: Math.round(gross * 0.75), height: gross };
  if (bild) return <img src={bild} alt="" loading="lazy" draggable={false} className="shrink-0 rounded-lg object-cover object-top ring-1 ring-white/10" style={mass} />;
  return platz ? <span aria-hidden className="shrink-0" style={mass} /> : null;
}
