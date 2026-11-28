import { motion } from 'framer-motion';
import { useWer } from '../../../teile/Anmeldung';

/* Gemeinsame Bausteine der Werkzeug-Seiten (Match-Finder, Streams, Tierlist, FNCS, Orgs, Posts ...) - im Design-System 3.0 (Flaeche .fl, Akzent akz). */

/** Karte "Sign in to see this" - bei 401/403 der echten Seite. */
export function AnmeldeKarte({ titel = 'Sign in to see this', text }: { titel?: string; text?: string }) {
  const { oeffnen, wer } = useWer();
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }} className="fl relative mx-auto mt-6 max-w-xl overflow-hidden p-10 text-center">
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-akz/20 blur-3xl" />
      <div className="relative">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/5">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-akz" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
        </div>
        <h2 className="titel mt-5 text-4xl">{titel}</h2>
        {text && <p className="mt-2 text-sm leading-relaxed text-white/55">{text}</p>}
        {wer?.userName && <p className="mt-3 text-xs text-amber-300/80">Signed in as {wer.userName} – this account has no access yet.</p>}
        <button type="button" onClick={() => oeffnen('konto')} className="knopf-prim mt-6 !px-6 !py-3">Sign in</button>
      </div>
    </motion.div>
  );
}

/** Lade-Kreisel im Hub-Stil. */
export function Laedt({ text = 'Loading …' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-white/40">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-akz" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

/** Kleine Fehlerzeile. */
export function Fehler({ text }: { text: string }) {
  return <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{text}</p>;
}

/** Geldbetrag kurz: $1.2M, $340K, $900. */
export function geld(n: number | null | undefined) {
  const x = Number(n) || 0;
  if (x >= 1e6) return `$${(x / 1e6).toFixed(x >= 1e7 ? 1 : 2)}M`;
  if (x >= 1e4) return `$${Math.round(x / 1e3)}K`;
  return `$${Math.round(x).toLocaleString('en')}`;
}
