import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/* Kleine Bausteine fuer Statistics, Deep Stats und Replays. */

export const zahl = (n: number | null | undefined, nachkomma = 0) =>
  typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: nachkomma, maximumFractionDigits: nachkomma }) : '–';
export const prozent = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '–');

/** Ein Schalter in einer Pillenreihe. */
export function Chip({ an, onClick, children, farbe }: { an: boolean; onClick: () => void; children: ReactNode; farbe?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-sky-400 text-[#06080f] shadow-[0_0_20px_rgba(56,189,248,.35)]' : 'border border-white/10 bg-white/[0.03] text-white/55 hover:border-white/25 hover:text-white'}`}>
      {farbe && <span className="h-2 w-2 rounded-full" style={{ background: farbe }} />}
      {children}
    </button>
  );
}

/** Ein Balken, der beim Erscheinen hineinwaechst. */
export function Balken({ wert, max, farbe = '#38bdf8', hoehe = 'h-1.5', verzoegerung = 0 }: { wert: number; max: number; farbe?: string; hoehe?: string; verzoegerung?: number }) {
  return (
    <span className={`block w-full overflow-hidden rounded-full bg-white/[0.07] ${hoehe}`}>
      <motion.span className="block h-full rounded-full" style={{ background: farbe }} initial={{ width: 0 }}
        animate={{ width: `${Math.max(1.5, (wert / Math.max(1, max)) * 100)}%` }} transition={{ duration: 0.8, delay: verzoegerung, ease: [0.22, 1, 0.36, 1] }} />
    </span>
  );
}

/** Kopf eines Abschnitts: kleine Nummer, Titel, Erklaerung, rechts Platz fuer Zahlen. */
export function Kopfzeile({ nr, titel, text, rechts }: { nr?: string; titel: string; text?: ReactNode; rechts?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-4xl">
        {nr && <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-sky-400">{nr}</p>}
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">{titel}</h2>
        {text && <p className="mt-1.5 text-sm leading-relaxed text-white/50">{text}</p>}
      </div>
      {rechts}
    </div>
  );
}

/** Ladeanzeige: drei pulsierende Punkte. */
export function Laedt({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-white/40">
      {[0, 1, 2].map((i) => <motion.span key={i} className="h-2 w-2 rounded-full bg-sky-400" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />)}
      <span>{text}</span>
    </div>
  );
}

/** Rundes Spielerbild - nur echte Fotos, sonst die Anfangsbuchstaben (keine gleichen Platzhalter mehrfach auf einer Seite). */
export function Rund({ bild, name, gross = 32 }: { bild?: string | null; name: string; gross?: number }) {
  if (bild) return <img src={bild} alt="" loading="lazy" className="shrink-0 rounded-full object-cover object-top ring-1 ring-white/10" style={{ width: gross, height: gross }} />;
  const k = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
  return <span className="grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-white/10 to-white/[0.02] text-[10px] font-bold text-white/45 ring-1 ring-white/10" style={{ width: gross, height: gross }}>{k}</span>;
}
