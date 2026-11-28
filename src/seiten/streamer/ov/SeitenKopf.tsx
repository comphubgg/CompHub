import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

/* Der Kopf der Werkzeug-Seiten (main: app/components/SeitenKopf) - im Hub eine Glastafel mit violettem Schein. */
export default function SeitenKopf({ marke, titel, text, rechts, className = '' }: { marke?: ReactNode; titel: ReactNode; text?: ReactNode; rechts?: ReactNode; className?: string }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-fl p-6 backdrop-blur-xl sm:p-8 ${className}`}>
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-akz/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          {marke && <p className="text-xs font-semibold uppercase tracking-[0.3em] text-akz">{marke}</p>}
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{titel}</h1>
          {text && <p className="mt-2 text-sm leading-relaxed text-white/55">{text}</p>}
        </div>
        {rechts && <div className="flex flex-wrap items-center gap-2">{rechts}</div>}
      </div>
    </motion.section>
  );
}
