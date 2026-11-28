import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Route, Routes, useNavigate } from 'react-router-dom';
import Kopf, { abmelden } from '../../teile/Kopf';
import { Glas } from '../../teile/Glas';
import { useWer } from '../../teile/Anmeldung';
import Rahmen from '../admin/Rahmen';
import { Laedt, feld, knopfGefahr, knopfHaupt, knopfLeise } from '../admin/teile';

/*
 * Das eigene Konto im Hub (/account) - nachgebaut nach app/account/KontoInhalt auf main, dieselben Schnittstellen:
 *   GET  /api/konto                                  - das Konto (oder angemeldet: false)
 *   POST /api/konto { was: 'aendern', name, socials, bild }      Profil, Socials, Bild (Bild 256 px, im Browser verkleinert)
 *   POST /api/konto { was: 'email-aendern', email, passwort }    neue Adresse (Bestaetigungsmail)
 *   POST /api/konto { was: 'bestaetigung-neu' }                   Bestaetigungsmail erneut
 *   POST /api/konto { was: 'passwort', alt, neu }                 Passwort setzen/aendern
 *   POST /api/konto { was: 'loeschen', email }                    Konto endgueltig entfernen (Adresse abtippen)
 * Wer nur mit Zugangsschluessel da ist (VIP ohne Konto): Name und Bild ueber /api/profile, dazu "Konto anlegen".
 * Alles, was die Seite sonst noch kann (My stats, Epic verbinden, Twitch-Chat ...), steht unter /account/classic als echte Seite im Rahmen.
 */
interface Konto {
  id: string; email: string; name: string; rolle: string | null; org: string | null; rechte: string[]; vip: boolean; vipBis: number | null;
  bestaetigt: boolean; dienste: string[]; hatPasswort: boolean; epicId: string | null; epicVerifiziert: boolean; epicName: string | null;
  neueEmail: string | null; socials: Record<string, string>; bild: string | null; angelegt: string;
}
const SOCIALS = [
  { s: 'x', titel: 'X', vor: '@' }, { s: 'twitch', titel: 'Twitch', vor: '' }, { s: 'youtube', titel: 'YouTube', vor: '@' },
  { s: 'tiktok', titel: 'TikTok', vor: '@' }, { s: 'discord', titel: 'Discord', vor: '' },
];
const post = async (k: Record<string, unknown>) => {
  const r = await fetch('/api/konto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(k) });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j: j as { fehler?: string; hinweis?: string; konto?: Konto } };
};
/** Bild auf 256 px quadratisch aus der Mitte verkleinern (wie auf der Seite - sonst landet ein Handyfoto mit 4 MB im Konto). */
function verkleinern(datei: File): Promise<string> {
  return new Promise((fertig, fehl) => {
    const leser = new FileReader();
    leser.onload = () => {
      const roh = new Image();
      roh.onload = () => {
        const K = 256; const c = document.createElement('canvas'); c.width = K; c.height = K;
        const g = c.getContext('2d'); if (!g) { fehl(new Error('no canvas')); return; }
        const kante = Math.min(roh.width, roh.height);
        g.drawImage(roh, (roh.width - kante) / 2, (roh.height - kante) / 2, kante, kante, 0, 0, K, K);
        fertig(c.toDataURL('image/webp', 0.85));
      };
      roh.onerror = () => fehl(new Error('That was not an image.'));
      roh.src = String(leser.result);
    };
    leser.readAsDataURL(datei);
  });
}

export default function KontoSeite() {
  return (
    <div className="min-h-screen">
      <Kopf bereich="account" />
      <main className="px-6 pb-16 pt-8 lg:px-10">
        <Routes>
          <Route index element={<Konto />} />
          <Route path="classic" element={<Rahmen pfad="/account" titel="Account (classic)" />} />
        </Routes>
      </main>
    </div>
  );
}

function Karte({ titel, farbe = 'text-sky-300', children, i = 0, className = '' }: { titel: string; farbe?: string; children: ReactNode; i?: number; className?: string }) {
  return (
    <Glas verzoegerung={0.04 * i} className={`min-w-0 p-6 ${className}`}>
      <h2 className={`mb-4 text-xs font-bold uppercase tracking-[0.25em] ${farbe}`}>{titel}</h2>
      {children}
    </Glas>
  );
}
/** Ohne Profilbild kein Buchstabe (Betreiber 27.11.: "Profilbild oder gar nichts") - nur das Feld zum Hochladen mit Kamera-Zeichen. */
function OhneBild() {
  return (
    <span className="flex h-full flex-col items-center justify-center gap-1 rounded-[inherit] border-2 border-dashed border-white/15 text-white/45 transition hover:border-akz/50 hover:text-akz">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
      <span className="text-[9px] font-bold uppercase tracking-wider">Add photo</span>
    </span>
  );
}
const Stand = ({ text }: { text: string }) => (text ? <span className="text-xs text-white/55">{text}</span> : null);

function Konto() {
  const { wer, oeffnen, neu } = useWer();
  const weiter = useNavigate();
  const [konto, setKonto] = useState<Konto | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [name, setName] = useState(''); const [socials, setSocials] = useState<Record<string, string>>({}); const [bild, setBild] = useState<string | null>(null);
  const [stand, setStand] = useState('');
  const [neueMail, setNeueMail] = useState(''); const [mailPw, setMailPw] = useState(''); const [mailStand, setMailStand] = useState('');
  const [altesPw, setAltesPw] = useState(''); const [neuesPw, setNeuesPw] = useState(''); const [pwStand, setPwStand] = useState('');
  const [loeschEmail, setLoeschEmail] = useState(''); const [loeschStand, setLoeschStand] = useState('');
  const [kopiert, setKopiert] = useState(false);
  const datei = useRef<HTMLInputElement>(null);

  const laden = useCallback(async () => {
    try {
      const j = await (await fetch('/api/konto', { cache: 'no-store' })).json();
      const k: Konto | null = j?.angemeldet ? j.konto : null;
      setKonto(k);
      if (k) { setName(k.name ?? ''); setSocials(k.socials ?? {}); setBild(k.bild ?? j.bild ?? null); }
    } catch { setKonto(null); } finally { setLaedt(false); }
  }, []);
  useEffect(() => { void laden(); }, [laden, wer?.userName]);

  async function speichern(neuesBild?: string | null) {
    setStand('saving …');
    try {
      const { ok, j } = await post({ was: 'aendern', name, socials, bild: neuesBild === undefined ? bild : neuesBild });
      if (!ok) { setStand(j.fehler ?? 'not saved'); return; }
      if (j.konto) setKonto(j.konto);
      setStand('saved'); setTimeout(() => setStand(''), 2000); neu();
    } catch (e) { setStand((e as Error).message); }
  }

  if (laedt) return <Laedt />;
  if (!konto) return wer?.userName ? <NurSchluessel /> : (
    <Glas className="mx-auto mt-10 max-w-xl p-10 text-center">
      <h1 className="titel text-5xl">Your account</h1>
      <p className="mt-2 text-sm text-white/55">Sign in with your CompHub account to see and edit your profile — the same account as on thecomphub.com.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button type="button" onClick={() => oeffnen('konto')} className={`${knopfHaupt} px-6 py-2.5 text-sm`}>Sign in</button>
        <button type="button" onClick={() => oeffnen('registrieren')} className={`${knopfLeise} px-6 py-2.5 text-sm`}>Create account</button>
      </div>
    </Glas>
  );

  const rolle = konto.rolle === 'admin' ? 'Admin' : konto.rolle === 'manager' ? 'Manager' : konto.rolle === 'pro' ? 'Pro' : konto.vip ? 'VIP' : 'User';
  const seit = konto.angelegt ? new Date(konto.angelegt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '';
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-wrap items-center gap-6">
        <button type="button" onClick={() => datei.current?.click()} title="Change profile picture" className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]">
          {bild ? <img src={bild} alt="" className="h-full w-full object-cover" /> : <OhneBild />}
          <span className="absolute inset-0 hidden place-items-center bg-black/55 text-[10px] font-bold uppercase tracking-wider text-sky-200 group-hover:grid">Change</span>
        </button>
        <input ref={datei} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
          const d = e.target.files?.[0]; e.target.value = ''; if (!d) return;
          try { const b = await verkleinern(d); setBild(b); void speichern(b); } catch (x) { setStand((x as Error).message); }
        }} />
        <div className="min-w-0 flex-1">
          <p className="ueber">Account</p>
          <h1 className="titel mt-1 truncate text-6xl">{konto.name || 'No name yet'}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/55">
            <span>{konto.email}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${konto.rolle === 'admin' ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/75'}`}>{rolle}</span>
            {konto.vip && konto.vipBis ? <span className="rounded-full border border-violet-400/40 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-200">VIP until {new Date(konto.vipBis).toLocaleDateString('en-GB')}</span> : null}
            {seit && <span className="text-white/35">· member since {seit}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {konto.rolle === 'admin' && <Link to="/admin" className={`${knopfLeise} !border-amber-400/40 !text-amber-200`}>Admin tools</Link>}
          <Link to="/messages" className={knopfLeise}>Messages</Link>
          <Link to="/account/classic" className={knopfLeise} title="The original account page of thecomphub.com - my stats, Epic, Twitch chat and everything else">Full account page</Link>
        </div>
      </motion.div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Karte titel="Profile" i={0} className="xl:col-span-2">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/45">Display name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className={`${feld} w-full`} /></label>
            {SOCIALS.map((s) => (
              <label key={s.s} className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/45">{s.titel}</span>
                <span className="flex items-center rounded-xl border border-white/10 bg-black/40 focus-within:border-sky-400/60">
                  {s.vor && <span className="pl-3 text-sm text-white/35">{s.vor}</span>}
                  <input value={socials[s.s] ?? ''} onChange={(e) => setSocials((v) => ({ ...v, [s.s]: e.target.value.replace(/^@/, '') }))} maxLength={60} spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none" />
                </span></label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void speichern()} className={`${knopfHaupt} px-5 py-2 text-sm`}>Save</button>
            <button type="button" onClick={() => datei.current?.click()} className={knopfLeise}>{bild ? 'Change picture' : 'Upload picture'}</button>
            {bild && <button type="button" onClick={() => { setBild(null); void speichern(null); }} className={knopfLeise}>Remove picture</button>}
            <Stand text={stand} />
          </div>
        </Karte>

        <Karte titel="Role & access" farbe="text-amber-300" i={1}>
          <p className="text-2xl font-extrabold text-white">{rolle}</p>
          {konto.org && <p className="mt-1 text-sm text-white/55">Organisation: {konto.org}</p>}
          {konto.rechte?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">{konto.rechte.map((r) => <span key={r} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/70">{r}</span>)}</div>
          ) : <p className="mt-2 text-sm text-white/45">No management areas.</p>}
          <div className="mt-5 border-t border-white/5 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Account ID</p>
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(konto.id); setKopiert(true); setTimeout(() => setKopiert(false), 1500); } catch { /* ohne Zwischenablage */ } }}
              className="mt-1 break-all text-left font-mono text-xs text-white/60 transition hover:text-sky-300">{konto.id} {kopiert ? '· copied' : ''}</button>
          </div>
        </Karte>

        <Karte titel="Email address" i={2}>
          <p className="flex flex-wrap items-center gap-2 text-sm text-white">{konto.email}
            {konto.bestaetigt ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">verified</span>
              : <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">not verified</span>}
          </p>
          {!konto.bestaetigt && <button type="button" className={`${knopfLeise} mt-2`} onClick={async () => { setMailStand('one moment …'); const { j } = await post({ was: 'bestaetigung-neu' }); setMailStand((j as { schon?: boolean }).schon ? 'Already verified.' : (j.hinweis ?? j.fehler ?? 'Sent.')); }}>Resend confirmation mail</button>}
          {konto.neueEmail && <p className="mt-2 text-xs text-sky-200">Waiting for confirmation: {konto.neueEmail}</p>}
          <div className="mt-4 space-y-2">
            <input value={neueMail} onChange={(e) => setNeueMail(e.target.value)} type="email" placeholder="New email address" className={`${feld} w-full`} />
            {konto.hatPasswort && <input value={mailPw} onChange={(e) => setMailPw(e.target.value)} type="password" placeholder="Your password" autoComplete="current-password" className={`${feld} w-full`} />}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!neueMail.includes('@')} className={knopfHaupt} onClick={async () => {
                setMailStand('one moment …');
                const { ok, j } = await post({ was: 'email-aendern', email: neueMail, passwort: mailPw });
                if (!ok) { setMailStand(j.fehler ?? 'not saved'); return; }
                setMailStand(j.hinweis ?? 'The mail is on its way.'); setKonto((k) => (k ? { ...k, neueEmail: neueMail.trim().toLowerCase() } : k)); setNeueMail(''); setMailPw('');
              }}>Change email</button>
              <Stand text={mailStand} />
            </div>
          </div>
        </Karte>

        <Karte titel="Password" i={3}>
          <p className="text-sm text-white/55">{konto.hatPasswort ? 'Change your password.' : 'You signed up through a service — set a password to also sign in with email.'}</p>
          <div className="mt-4 space-y-2">
            {konto.hatPasswort && <input value={altesPw} onChange={(e) => setAltesPw(e.target.value)} type="password" placeholder="Current password" autoComplete="current-password" className={`${feld} w-full`} />}
            <input value={neuesPw} onChange={(e) => setNeuesPw(e.target.value)} type="password" placeholder="New password — at least eight characters" autoComplete="new-password" className={`${feld} w-full`} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={neuesPw.length < 8} className={knopfHaupt} onClick={async () => {
                setPwStand('saving …');
                const { ok, j } = await post({ was: 'passwort', alt: altesPw, neu: neuesPw });
                if (!ok) { setPwStand(j.fehler ?? 'not saved'); return; }
                if (j.konto) setKonto(j.konto); setAltesPw(''); setNeuesPw(''); setPwStand('Password changed'); setTimeout(() => setPwStand(''), 3000);
              }}>{konto.hatPasswort ? 'Change password' : 'Set password'}</button>
              <Link to="/password" className="text-xs text-white/45 transition hover:text-sky-300">Forgot your password?</Link>
              <Stand text={pwStand} />
            </div>
          </div>
        </Karte>

        <Karte titel="Epic Games & services" farbe="text-violet-300" i={4}>
          {konto.epicId ? (
            <p className="text-sm text-white">{konto.epicName ?? 'Epic account linked'}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${konto.epicVerifiziert ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/10 text-white/60'}`}>{konto.epicVerifiziert ? 'verified' : 'assigned'}</span></p>
          ) : <p className="text-sm text-white/55">No Epic account linked yet.</p>}
          <p className="mt-1 text-xs text-white/40">Epic accounts are assigned by the operator or verified on the full account page.</p>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/40">Linked sign-in services</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['email', ...konto.dienste.filter((d) => d !== 'email')].map((d) => <span key={d} className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs capitalize text-white/75">{d === 'email' ? (konto.hatPasswort ? 'Email & password' : 'Email') : d}</span>)}
          </div>
          <Link to="/account/classic" className={`${knopfLeise} mt-4 inline-block`}>Connect Epic, Twitch, Discord …</Link>
        </Karte>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Karte titel="Privacy — delete account" farbe="text-rose-300" i={5}>
          <p className="text-sm text-white/55">Removes your account for good — there is no recycle bin. Type your email address to confirm.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={loeschEmail} onChange={(e) => setLoeschEmail(e.target.value)} placeholder={konto.email} className={`${feld} min-w-[240px] flex-1 focus:border-rose-400/60`} />
            <button type="button" disabled={loeschEmail.trim().toLowerCase() !== konto.email} className={knopfGefahr} onClick={async () => {
              if (!window.confirm('Delete your CompHub account for good?')) return;
              setLoeschStand('one moment …');
              const { ok, j } = await post({ was: 'loeschen', email: loeschEmail });
              if (!ok) { setLoeschStand(j.fehler ?? 'not deleted'); return; }
              neu(); weiter('/');
            }}>Delete account</button>
            <Stand text={loeschStand} />
          </div>
        </Karte>
        <Glas verzoegerung={0.24} className="flex flex-col justify-between gap-4 p-6">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.25em] text-white/50">Session</h2>
            <p className="mt-2 text-sm text-white/55">Signing out only ends this session.</p>
          </div>
          <button type="button" className={`${knopfLeise} self-start px-5 py-2 text-sm hover:!border-rose-400 hover:!text-rose-300`} onClick={async () => { await abmelden(); neu(); weiter('/'); }}>Sign out</button>
        </Glas>
      </div>
    </>
  );
}

/** Angemeldet nur mit dem Zugangsschluessel (VIP ohne CompHub-Konto): Name und Bild ueber /api/profile, dazu ein Konto anlegen. */
function NurSchluessel() {
  const { wer, neu } = useWer();
  const weiter = useNavigate();
  const [profil, setProfil] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState(''); const [bild, setBild] = useState<string | null>(null); const [stand, setStand] = useState('');
  const [mail, setMail] = useState(''); const [pw, setPw] = useState(''); const [anlegen, setAnlegen] = useState('');
  const [seit] = useState(() => Date.now());
  const datei = useRef<HTMLInputElement>(null);
  useEffect(() => {
    fetch('/api/profile', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.profile) return; setProfil(j.profile); setName(String(j.profile.displayName ?? '')); setBild((j.profile.avatarUrl as string) ?? null);
    }).catch(() => {});
  }, []);
  async function sichern(neuesBild?: string | null) {
    setStand('saving …');
    try {
      const r = await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { ...(profil ?? { twitchChatEnabled: false, socials: { twitch: '' } }), displayName: name || wer?.userName || '', avatarUrl: neuesBild === undefined ? bild : neuesBild } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setStand(j?.error ?? 'not saved'); return; }
      if (j.profile) setProfil(j.profile); setStand('saved'); setTimeout(() => setStand(''), 2000);
    } catch (e) { setStand((e as Error).message); }
  }
  return (
    <>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <p className="ueber">Access key</p>
        <h1 className="titel mt-1 truncate text-6xl">{name || wer?.userName}</h1>
        <p className="mt-2 text-sm text-white/55">You are signed in with an access key. Create a CompHub account to also get email, password and the Epic link.</p>
      </motion.div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Karte titel="Profile">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => datei.current?.click()} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              {bild ? <img src={bild} alt="" className="h-full w-full object-cover" /> : <OhneBild />}
            </button>
            <input ref={datei} type="file" accept="image/*" className="hidden" onChange={async (e) => { const d = e.target.files?.[0]; e.target.value = ''; if (!d) return; const b = await verkleinern(d); setBild(b); void sichern(b); }} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" className={`${feld} min-w-0 flex-1`} />
          </div>
          <div className="mt-4 flex items-center gap-3"><button type="button" onClick={() => void sichern()} className={knopfHaupt}>Save</button><Stand text={stand} /></div>
        </Karte>
        <Karte titel="Create an account" farbe="text-violet-300">
          <div className="space-y-2">
            <input value={mail} onChange={(e) => setMail(e.target.value)} type="email" placeholder="Email" className={`${feld} w-full`} />
            <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Password — at least eight characters" autoComplete="new-password" className={`${feld} w-full`} />
            <div className="flex items-center gap-3">
              <button type="button" disabled={!mail.includes('@') || pw.length < 8} className={knopfHaupt} onClick={async () => {
                setAnlegen('one moment …');
                const { ok, j } = await post({ was: 'registrieren', email: mail, passwort: pw, name: name || wer?.userName, seit, website: '' });
                if (!ok) { setAnlegen(j.fehler ?? 'That did not work.'); return; }
                neu(); window.location.reload();
              }}>Create account</button>
              <Stand text={anlegen} />
            </div>
          </div>
        </Karte>
      </div>
      <div className="mt-5 flex gap-2">
        <Link to="/account/classic" className={knopfLeise}>Full account page</Link>
        <button type="button" className={knopfLeise} onClick={async () => { await abmelden(); neu(); weiter('/'); }}>Sign out</button>
      </div>
    </>
  );
}
