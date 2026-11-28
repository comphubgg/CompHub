import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { useWer } from '../../teile/Anmeldung';
import { feld } from '../admin/teile';

/*
 * Passwort vergessen (/password, wie app/password auf main): ohne ?schluessel= die Mail anfordern (POST /api/konto { was: 'reset-anfordern', email }),
 * mit Schluessel aus der Mail das neue Passwort setzen (POST { was: 'reset-setzen', schluessel, passwort }) - danach ist man gleich angemeldet.
 */
export default function Passwort() {
  const [p] = useSearchParams();
  const schluessel = p.get('schluessel');
  const { oeffnen, neu } = useWer();
  const weiter = useNavigate();
  const [wen, setWen] = useState(''); const [passwort, setPasswort] = useState(''); const [sichtbar, setSichtbar] = useState(false);
  const [laeuft, setLaeuft] = useState(false); const [fehler, setFehler] = useState(''); const [hinweis, setHinweis] = useState('');

  async function senden(e: React.FormEvent) {
    e.preventDefault(); setLaeuft(true); setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/konto', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schluessel ? { was: 'reset-setzen', schluessel, passwort } : { was: 'reset-anfordern', email: wen }) });
      const j = await r.json().catch(() => ({}));
      if (schluessel) {
        if (!r.ok) { setFehler(j?.fehler ?? 'That did not work.'); return; }
        neu(); weiter('/account');
      } else setHinweis('If there is an account for this, the mail is on its way. The link is valid for one hour.');
    } catch { setFehler('No connection to the server.'); } finally { setLaeuft(false); }
  }

  return (
    <div className="min-h-screen">
      <Kopf bereich="account" />
      <main className="grid place-items-center px-6 py-20 lg:px-10">
        <motion.form onSubmit={senden} initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fl w-full max-w-md p-8">
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="h-12" />
          <h1 className="titel mt-5 text-5xl">{schluessel ? 'Set a new password' : 'Forgot your password?'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-white/55">
            {schluessel ? 'Choose a new password. You are signed in right afterwards.' : 'Enter your email address or your name — we send you a link. It is valid for one hour.'}
          </p>
          <div className="mt-6 space-y-3">
            {schluessel ? (
              <div className="relative">
                <input value={passwort} onChange={(e) => setPasswort(e.target.value)} type={sichtbar ? 'text' : 'password'} required autoFocus autoComplete="new-password"
                  placeholder="Password — at least eight characters" className={`${feld} w-full py-3 pr-12`} />
                <button type="button" onClick={() => setSichtbar((v) => !v)} aria-label={sichtbar ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-white/45 transition hover:text-sky-300">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    {sichtbar ? <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M6.7 6.7C4.6 8 3 10 2 12c2 4 6 7 10 7 1.7 0 3.3-.5 4.7-1.3M9.9 5.2A9.8 9.8 0 0 1 12 5c4 0 8 3 10 7-.7 1.4-1.7 2.7-2.8 3.8" />
                      : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.6" /></>}
                  </svg>
                </button>
              </div>
            ) : (
              <input value={wen} onChange={(e) => setWen(e.target.value)} required autoFocus autoComplete="username" placeholder="Email address or name" className={`${feld} w-full py-3`} />
            )}
            {fehler && <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">{fehler}</p>}
            {hinweis && <p className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-xs text-sky-100">{hinweis}</p>}
            <button type="submit" disabled={laeuft} className="w-full rounded-xl bg-sky-400 py-3 text-sm font-bold text-[#06080f] transition hover:bg-sky-300 disabled:opacity-50">
              {laeuft ? 'one moment …' : schluessel ? 'Set password' : 'Send link'}
            </button>
          </div>
          <div className="mt-6 flex justify-between text-xs">
            <button type="button" onClick={() => oeffnen('konto')} className="text-white/45 transition hover:text-sky-300">← Sign in</button>
            <Link to="/account" className="text-white/45 transition hover:text-sky-300">Account</Link>
          </div>
        </motion.form>
      </main>
    </div>
  );
}
