import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Laedt as DsLaedt, SeitenKopf } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';

/* Gemeinsame Bausteine der Admin-Werkzeuge im Hub - seit 28.11.2026 auf dem Design-System 3.0 (Akzent amber ueber data-bereich="admin"). */

export const feld = 'eingabe !py-2';
export const knopf = 'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
export const knopfLeise = `${knopf} border-white/10 bg-white/[0.05] text-white/80 hover:border-white/20 hover:bg-white/10 hover:text-white`;
export const knopfHaupt = `${knopf} border-akz bg-akz font-bold text-[#04050a] hover:brightness-110`;
export const knopfGefahr = `${knopf} border-red-500/40 text-red-300 hover:border-red-400 hover:bg-red-500/10`;

/**
 * Kopf eines Werkzeugs im Stil der anderen Bereiche (SeitenKopf aus dem Design-System): Gruppe als Zeile, Titel in Bebas, Satz; rechts die Knoepfe
 * des Werkzeugs und "Classic view" (die echte Seite im Rahmen).
 */
export function WerkzeugKopf({ ueber, titel, text, klassisch, rechts, children }: { ueber: ReactNode; titel: ReactNode; text?: ReactNode; klassisch?: () => void; rechts?: ReactNode; children?: ReactNode }) {
  return (
    <SeitenKopf klein ueber={typeof ueber === 'string' ? ueber : undefined} titel={titel} text={text}
      rechts={(rechts || klassisch) ? <>
        {rechts}
        {klassisch && <button type="button" onClick={klassisch} className={knopfLeise} title="The original page of thecomphub.com, inside the hub">Classic view</button>}
      </> : undefined}>
      {children}
    </SeitenKopf>
  );
}

export function Meldung({ text, gut = true }: { text: string; gut?: boolean }) {
  if (!text) return null;
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className={`mb-4 flex items-center gap-2.5 rounded-2xl border bg-fl px-4 py-2.5 text-sm ${gut ? 'border-emerald-400/30 text-emerald-100' : 'border-red-400/40 text-red-100'}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${gut ? 'bg-emerald-400' : 'bg-red-400'}`} />{text}
    </motion.p>
  );
}

export function Laedt({ text = 'Loading' }: { text?: string }) {
  return <DsLaedt text={text.replace(/\s*…$/, '')} />;
}

/** 401/403: freundlich, mit Anmelden. */
export function NurAdmins({ text = 'This tool is for admins only.' }: { text?: string }) {
  const { wer, oeffnen } = useWer();
  return (
    <div className="fl-fest mx-auto mt-6 flex max-w-2xl flex-col items-center gap-5 overflow-hidden p-8 text-center sm:flex-row sm:text-left">
      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-akz/15 text-akz ring-1 ring-akz/30">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z" /><path d="M9.5 12.5l2 2 3.5-4" /></svg>
      </div>
      <div className="flex-1">
        <h2 className="titel text-4xl">Admins only</h2>
        <p className="mt-1 text-sm leading-relaxed text-white/55">{text} {wer?.userName ? `You are signed in as ${wer.userName}, which has no admin rights here.` : 'Sign in with your CompHub admin account to use it.'}</p>
      </div>
      {!wer?.userName && <button type="button" onClick={() => oeffnen('konto')} className="knopf-prim shrink-0">Sign in</button>}
    </div>
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
