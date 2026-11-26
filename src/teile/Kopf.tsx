import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useWer } from './Anmeldung';

/*
 * Kopfzeile der Bereiche (Betreiber, 26.11.2026): links das Logo - es fuehrt zurueck zum Startbildschirm, dort wechselt man den Bereich (kein
 * direkter Wechsel). Rechts Anmelden bzw. der angemeldete Name - ein Klick darauf oeffnet das Menue (Account, Messages, Admin, Sign out). Volle Breite.
 */
export type KopfBereich = 'competitive' | 'community' | 'streamer' | 'admin' | 'account';

/** Abmelden wie auf der Seite: Konto-Sitzung (POST /api/konto) und der Zugangsschluessel (GET /api/auth/logout loescht dessen Cookies). */
export async function abmelden() {
  await fetch('/api/konto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ was: 'abmelden' }) }).catch(() => null);
  await fetch('/api/auth/logout', { redirect: 'manual', cache: 'no-store' }).catch(() => null);
}

export default function Kopf({ bereich }: { bereich: KopfBereich }) {
  const { wer, oeffnen } = useWer();
  const farbe = bereich === 'community' ? 'text-teal-300' : bereich === 'streamer' ? 'text-violet-300' : bereich === 'admin' ? 'text-amber-300' : 'text-sky-300';
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080f]/70 backdrop-blur-xl">
      <div className="flex items-center gap-4 px-6 py-3 lg:px-10">
        <Link to="/" title="Back to the hub" className="group flex items-center gap-2.5">
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="h-8 w-auto transition group-hover:scale-110 group-hover:drop-shadow-[0_0_14px_rgba(56,189,248,0.7)]" />
          <span className="text-lg font-extrabold tracking-tight text-white">Comp<span className="text-sky-400">Hub</span></span>
          <span className={`ml-2 hidden rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] sm:inline ${farbe}`}>{bereich}</span>
        </Link>
        <div className="ml-auto">
          {wer?.userName ? <Menue /> : (
            <button type="button" onClick={() => oeffnen('konto')} className="rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-sky-300">Sign in</button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Das Menue unter dem Namen - Glas, wie die Tafeln. Schliesst bei Klick daneben und mit Escape. */
function Menue() {
  const { wer, neu } = useWer();
  const [offen, setOffen] = useState(false);
  const [geht, setGeht] = useState(false);
  const huelle = useRef<HTMLDivElement>(null);
  const weiter = useNavigate();
  useEffect(() => {
    if (!offen) return undefined;
    const daneben = (e: PointerEvent) => { if (!huelle.current?.contains(e.target as Node)) setOffen(false); };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('pointerdown', daneben); document.addEventListener('keydown', taste);
    return () => { document.removeEventListener('pointerdown', daneben); document.removeEventListener('keydown', taste); };
  }, [offen]);
  if (!wer) return null;
  const eintraege = [
    { zu: '/account', titel: 'Account', text: 'Profile, socials, password', zeichen: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
    { zu: '/messages', titel: 'Messages', text: 'Your conversations with CompHub', zeichen: 'M4 5h16v11H8l-4 4z' },
    ...(wer.isAdmin ? [{ zu: '/admin', titel: 'Admin', text: 'Every admin tool', zeichen: 'M12 3l8 4v5c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V7z' }] : []),
  ];
  return (
    <div ref={huelle} className="relative">
      <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen}
        className={`flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-1.5 text-sm text-white transition ${offen ? 'border-sky-400/50 bg-white/[0.08]' : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'}`}>
        {wer.userName}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${wer.isAdmin ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/70'}`}>{wer.isAdmin ? 'Admin' : wer.rolle ?? 'User'}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 text-white/50 transition ${offen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <AnimatePresence>
        {offen && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full z-40 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f19]/90 p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <div className="px-3 pb-2 pt-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-white/40">Signed in as</p>
              <p className="truncate text-sm font-bold text-white">{wer.userName}</p>
            </div>
            {eintraege.map((e, i) => (
              <motion.div key={e.zu} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.03 * i }}>
                <Link to={e.zu} onClick={() => setOffen(false)} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.06]">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg border border-white/10 ${e.zu === '/admin' ? 'bg-amber-400/10 text-amber-300' : 'bg-sky-400/10 text-sky-300'}`}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round"><path d={e.zeichen} /></svg>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white group-hover:text-sky-300">{e.titel}</span>
                    <span className="block truncate text-xs text-white/45">{e.text}</span>
                  </span>
                </Link>
              </motion.div>
            ))}
            <div className="my-1 h-px bg-white/5" />
            <button type="button" disabled={geht}
              onClick={async () => { setGeht(true); await abmelden(); setGeht(false); setOffen(false); neu(); weiter('/'); }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white/70 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.03]">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" /></svg>
              </span>
              {geht ? 'Signing out …' : 'Sign out'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
