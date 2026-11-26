import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** konto: anmelden, registrieren: neues Konto (POST /api/konto { was: 'registrieren' }), schluessel: Zugangsschluessel. */
export type Art = 'konto' | 'registrieren' | 'schluessel';

/*
 * Anmeldung im Hub - dieselben Konten wie thecomphub.com (POST /api/konto { was: 'anmelden' }), dazu der Zugangsschluessel fuer Streamer/VIP
 * (POST /api/auth/vip { username, accessKey }). Der Proxy (vite.config.ts) setzt die Cookies fuer localhost, danach gelten Admin/VIP-Rechte
 * auch hier. Wer angemeldet ist: GET /api/auth/check-admin.
 */
export interface Wer { isAdmin: boolean; userName: string | null; rolle: string | null; rechte: string[]; epicId: string | null }
const Kontext = createContext<{ wer: Wer | null; neu: () => void; oeffnen: (art?: Art) => void }>({ wer: null, neu: () => {}, oeffnen: () => {} });
export const useWer = () => useContext(Kontext);

export function AnmeldungRahmen({ children }: { children: ReactNode }) {
  const [wer, setWer] = useState<Wer | null>(null);
  const [offen, setOffen] = useState<null | Art>(null);
  const neu = useCallback(() => { fetch('/api/auth/check-admin', { cache: 'no-store' }).then((r) => r.json()).then(setWer).catch(() => setWer(null)); }, []);
  useEffect(() => { neu(); }, [neu]);
  return (
    <Kontext.Provider value={{ wer, neu, oeffnen: (a = 'konto') => setOffen(a) }}>
      {children}
      <AnimatePresence>{offen && <Fenster art={offen} setArt={setOffen} zu={() => setOffen(null)} fertig={() => { setOffen(null); neu(); }} />}</AnimatePresence>
    </Kontext.Provider>
  );
}

function Fenster({ art, setArt, zu, fertig }: { art: Art; setArt: (a: Art) => void; zu: () => void; fertig: () => void }) {
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [n, setN] = useState('');
  // Registrieren: die Seite verlangt, dass das Formular mindestens drei Sekunden offen war (Schutz gegen Bots, app/api/konto auf main).
  const [seit] = useState(() => Date.now()); const [fehler, setFehler] = useState(''); const [laeuft, setLaeuft] = useState(false);
  async function senden(e: React.FormEvent) {
    e.preventDefault(); setLaeuft(true); setFehler('');
    try {
      const r = art === 'konto'
        ? await fetch('/api/konto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ was: 'anmelden', email: a, passwort: b }) })
        : art === 'registrieren'
        ? await fetch('/api/konto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ was: 'registrieren', email: a, passwort: b, name: n, seit, website: '' }) })
        : await fetch('/api/auth/vip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: a, accessKey: b }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false || j.success === false) throw new Error(j.error || j.fehler || j.message || 'Login failed');
      fertig();
    } catch (x) { setFehler((x as Error).message); } finally { setLaeuft(false); }
  }
  const feld = 'w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none';
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={zu}>
      <motion.form onSubmit={senden} onClick={(e) => e.stopPropagation()} initial={{ y: 30, scale: 0.96 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }}
        className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0b0f19]/90 p-7 backdrop-blur-xl">
        <img src="/logos/CompHub-Logo-frei.png" alt="" className="mx-auto h-12" />
        <div className="mt-5 flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-xs font-semibold uppercase tracking-wider">
          {(['konto', 'registrieren', 'schluessel'] as const).map((x) => (
            <button key={x} type="button" onClick={() => setArt(x)} className={`flex-1 rounded-full py-2 ${art === x ? 'bg-white/10 text-white' : 'text-white/50'}`}>{x === 'konto' ? 'Sign in' : x === 'registrieren' ? 'Create account' : 'Access key'}</button>
          ))}
        </div>
        <div className="mt-5 space-y-3">
          {art === 'registrieren' && <input className={feld} placeholder="Display name" value={n} onChange={(e) => setN(e.target.value)} autoFocus />}
          <input className={feld} type={art === 'registrieren' ? 'email' : 'text'} placeholder={art === 'konto' ? 'Email or username' : art === 'registrieren' ? 'Email' : 'Name'} value={a} onChange={(e) => setA(e.target.value)} autoFocus={art !== 'registrieren'} />
          <input className={feld} type="password" placeholder={art === 'schluessel' ? 'Access key' : 'Password'} value={b} onChange={(e) => setB(e.target.value)} />
        </div>
        {fehler && <p className="mt-3 text-sm text-red-400">{fehler}</p>}
        <button disabled={laeuft} className="mt-5 w-full rounded-xl bg-sky-400 py-3 text-sm font-bold text-[#06080f] transition hover:bg-sky-300 disabled:opacity-50">{laeuft ? '…' : art === 'registrieren' ? 'Create account' : 'Sign in'}</button>
        <p className="mt-4 text-center text-xs text-white/40">{art === 'konto' ? 'Same account as thecomphub.com' : art === 'registrieren' ? 'Free – works on thecomphub.com too' : 'Streamers and VIPs get their key from CompHub'}</p>
      </motion.form>
    </motion.div>
  );
}
