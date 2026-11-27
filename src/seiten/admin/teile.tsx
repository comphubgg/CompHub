import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Glas } from '../../teile/Glas';
import { useWer } from '../../teile/Anmeldung';

/* Gemeinsame Bausteine der Admin-Werkzeuge im Hub. */

export const feld = 'rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-sky-400/60';
export const knopf = 'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
export const knopfLeise = `${knopf} border-white/10 text-white/75 hover:border-white/25 hover:text-white`;
export const knopfHaupt = `${knopf} border-sky-400 bg-sky-400 text-[#06080f] hover:bg-sky-300`;
export const knopfGefahr = `${knopf} border-rose-500/40 text-rose-300 hover:border-rose-400 hover:bg-rose-500/10`;

/** Kopf eines Werkzeugs: Gruppe, Titel, Satz - rechts "Classic view" (die echte Seite im Rahmen). */
export function WerkzeugKopf({ ueber, titel, text, klassisch, rechts }: { ueber: ReactNode; titel: ReactNode; text?: ReactNode; klassisch?: () => void; rechts?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-[min(100%,20rem)] flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">{ueber}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight text-white">{titel}</h1>
        {text && <p className="mt-1.5 max-w-4xl text-sm leading-relaxed text-white/55">{text}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {rechts}
        {klassisch && <button type="button" onClick={klassisch} className={knopfLeise} title="The original page of thecomphub.com, inside the hub">Classic view</button>}
      </div>
    </motion.div>
  );
}

export function Meldung({ text, gut = true }: { text: string; gut?: boolean }) {
  if (!text) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={`mb-4 rounded-2xl border px-4 py-2.5 text-sm ${gut ? 'border-sky-400/30 bg-sky-400/10 text-sky-100' : 'border-amber-400/30 bg-amber-400/10 text-amber-100'}`}>{text}</motion.p>
  );
}

export function Laedt({ text = 'Loading …' }: { text?: string }) {
  return (
    <div className="grid place-items-center py-24 text-sm text-white/50">
      <span className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-sky-400" />{text}
    </div>
  );
}

/** 401/403: freundlich, mit Anmelden. */
export function NurAdmins({ text = 'This tool is for admins only.' }: { text?: string }) {
  const { wer, oeffnen } = useWer();
  return (
    <Glas className="mx-auto mt-10 max-w-xl p-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z" /><path d="M9.5 12.5l2 2 3.5-4" /></svg>
      </div>
      <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-white">Admins only</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/55">{text} {wer?.userName ? `You are signed in as ${wer.userName}, which has no admin rights.` : 'Sign in with your CompHub admin account to use it.'}</p>
      {!wer?.userName && <button type="button" onClick={() => oeffnen('konto')} className="mt-6 rounded-full bg-sky-400 px-6 py-2.5 text-sm font-bold text-[#06080f] transition hover:bg-sky-300">Sign in</button>}
    </Glas>
  );
}

/** "vor 3 min" */
export function her(ms?: number | null) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}
/** Datum und Uhrzeit */
export function wann(ms?: number | null) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.toLocaleDateString('en-GB')} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
export const datum = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
