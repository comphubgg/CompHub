'use client';

/*
 * Passwort vergessen - anfordern und neu setzen.
 *
 * Zwei Zustaende auf einer Seite, weil es zwei Haelften desselben Vorgangs
 * sind: ohne Schluessel in der Adresse fragt sie nach der Adresse und schickt
 * die Mail, mit Schluessel nimmt sie das neue Passwort entgegen. Zwei Seiten
 * dafuer waeren zwei Wege, von denen man den zweiten nie direkt aufruft.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

const FELD = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 '
  + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
  + 'focus:border-sky-500';

function Inhalt() {
  const t = useT();
  const router = useRouter();
  const suchParameter = useSearchParams();
  const [schluessel, setSchluessel] = useState<string | null>(null);

  // Erst nach dem Zusammenfuegen im Browser lesen - sonst weicht der Server
  // von dem ab, was hier steht.
  useEffect(() => {
    setSchluessel(suchParameter.get('schluessel'));
  }, [suchParameter]);

  const [wen, setWen] = useState('');
  const [passwort, setPasswort] = useState('');
  const [sichtbar, setSichtbar] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');

  async function anfordern(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true); setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'reset-anfordern', email: wen }),
      });
      const j = await r.json();
      setHinweis(t(j?.hinweis ?? 'Wenn es zu dieser Angabe ein Konto gibt, ist die Mail unterwegs.'));
    } catch {
      setFehler(t('Keine Verbindung zum Server.'));
    } finally { setLaeuft(false); }
  }

  async function setzen(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true); setFehler('');
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ was: 'reset-setzen', schluessel, passwort }),
      });
      const j = await r.json();
      if (!r.ok) { setFehler(t(j?.fehler ?? 'Das hat nicht geklappt.')); return; }
      // Angemeldet ist man danach schon - der Server hat die Sitzung gesetzt.
      router.push('/konto');
      router.refresh();
    } catch {
      setFehler(t('Keine Verbindung zum Server.'));
    } finally { setLaeuft(false); }
  }

  return (
    <main className="grid flex-1 place-items-center bg-zinc-950 px-4 py-20">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-bold text-slate-50">
          {schluessel ? <T>Neues Passwort setzen</T> : <T>Passwort vergessen</T>}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {schluessel
            ? <T>Wähl ein neues Passwort. Danach bist du gleich angemeldet.</T>
            : <T>Gib deine E-Mail-Adresse oder deinen Namen an — wir schicken dir
              einen Link. Er gilt eine Stunde.</T>}
        </p>

        <form onSubmit={schluessel ? setzen : anfordern} className="mt-6 space-y-3">
          {schluessel ? (
            <div className="relative">
              <input value={passwort} onChange={(e) => setPasswort(e.target.value)}
                type={sichtbar ? 'text' : 'password'} required autoFocus
                placeholder={t('Passwort — mindestens acht Zeichen')}
                autoComplete="new-password"
                className={`${FELD} pr-12`} />
              <button type="button" onClick={() => setSichtbar((v) => !v)}
                aria-label={sichtbar ? t('Passwort verbergen') : t('Passwort anzeigen')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5
                           text-slate-500 transition hover:text-sky-400">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  {sichtbar
                    ? <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M6.7 6.7C4.6 8 3 10 2 12c2 4 6 7 10 7 1.7 0 3.3-.5 4.7-1.3M9.9 5.2A9.8 9.8 0 0 1 12 5c4 0 8 3 10 7-.7 1.4-1.7 2.7-2.8 3.8" />
                    : <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.6" /></>}
                </svg>
              </button>
            </div>
          ) : (
            <input value={wen} onChange={(e) => setWen(e.target.value)}
              required autoFocus autoComplete="username"
              placeholder={t('E-Mail-Adresse oder Name')} className={FELD} />
          )}

          {fehler && (
            <p className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4
                          py-2.5 text-xs text-rose-300">{fehler}</p>
          )}
          {hinweis && (
            <p className="rounded-lg border border-sky-900/60 bg-sky-950/30 px-4
                          py-2.5 text-xs text-sky-300">{hinweis}</p>
          )}

          <button type="submit" disabled={laeuft}
            className="w-full rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-medium
                       text-white transition hover:bg-sky-400 disabled:opacity-50">
            {laeuft ? <T>einen Moment …</T>
              : schluessel ? <T>Passwort setzen</T> : <T>Link schicken</T>}
          </button>
        </form>

        <Link href="/anmelden"
          className="mt-6 inline-block text-xs text-slate-500 transition
                     hover:text-sky-400">
          ← <T>zur Anmeldung</T>
        </Link>
      </div>
    </main>
  );
}

export default function PasswortSeite() {
  return (
    <Suspense fallback={<main className="flex-1 bg-zinc-950" />}>
      <Inhalt />
    </Suspense>
  );
}
