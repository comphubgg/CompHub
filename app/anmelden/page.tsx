'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import T from '@/app/components/T';
import VIPLoginForm from '../login/VIPLoginForm';
import { useT } from '@/app/components/SprachProvider';

// Registrieren und Anmelden.
//
// Eine Seite, zwei Reiter. Ein getrenntes Formular je Fall waere ein Klick
// mehr fuer denselben Zweck, und wer sich vertut, landet ohnehin auf der
// jeweils anderen Seite.
//
// Die Regel, die der Nutzer ausdruecklich wollte: wer sich anmeldet, ohne ein
// Konto zu haben, bekommt das gesagt - und wird nicht stillschweigend
// angelegt. Die Schnittstelle meldet das mit "keinKonto"; dann springt die
// Seite auf den Reiter "Registrieren" und traegt die Adresse gleich ein.

interface Dienste {
  dienste: { twitch: boolean; discord: boolean; google: boolean; email: boolean };
  woher: Record<string, string>;
}

const ANBIETER = [
  { schluessel: 'twitch' as const, titel: 'Twitch',
    pfad: '/api/auth/twitch/authorize', logo: '/icons/twitch.png' },
  { schluessel: 'discord' as const, titel: 'Discord',
    pfad: '/api/auth/discord/authorize', logo: '/icons/discord.png' },
  { schluessel: 'google' as const, titel: 'Google',
    pfad: '/api/auth/google/authorize', logo: '/icons/google.svg' },
];

export default function Anmelden() {
  const t = useT();
  const router = useRouter();
  const [reiter, setReiter] = useState<'anmelden' | 'registrieren' | 'vip'>('anmelden');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [name, setName] = useState('');
  const [fehler, setFehler] = useState('');
  const [hinweis, setHinweis] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [dienste, setDienste] = useState<Dienste | null>(null);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const [d, ich] = await Promise.all([
          fetch('/api/konto/dienste').then((r) => r.json()),
          fetch('/api/konto', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        setDienste(d);
        // Wer schon angemeldet ist, hat hier nichts zu suchen.
        if (ich?.angemeldet) router.replace('/konto');
      } catch { /* dann eben ohne */ }
    });
  }, [router]);

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true); setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          was: reiter, email, passwort,
          ...(reiter === 'registrieren' ? { name } : {}),
        }),
      });
      const j = await r.json();

      if (!r.ok) {
        setFehler(j?.fehler ?? 'Das hat nicht geklappt.');
        // Kein Konto? Dann gleich zum Registrieren, mit der Adresse im Feld.
        if (j?.keinKonto) { setReiter('registrieren'); setPasswort(''); }
        return;
      }
      if (j?.hinweis) setHinweis(j.hinweis);
      router.push('/konto');
      router.refresh();
    } catch (err) {
      setFehler((err as Error).message);
    } finally { setLaeuft(false); }
  }

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-16">
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/CompHub-Logo-frei.png" alt=""
          className="mx-auto mb-6 h-12 w-auto opacity-80" />

        {/* ----------------------------------------------------- Reiter */}
        <div className="mb-6 flex rounded-xl border border-zinc-800 p-1">
          {([['anmelden', 'Anmelden'], ['registrieren', 'Registrieren'],
             ['vip', 'VIP']] as
            Array<['anmelden' | 'registrieren' | 'vip', string]>).map(([w, titel]) => (
            <button key={w} onClick={() => { setReiter(w); setFehler(''); }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition
                          ${reiter === w
                ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <T>{titel}</T>
            </button>
          ))}
        </div>

        {reiter === 'vip' ? (
          /*
           * Der VIP-Zugang. Kein Konto, sondern ein Schluessel fuer den
           * Verwaltungsbereich - deshalb ein eigenes Formular und nicht
           * dasselbe wie oben.
           */
          <div className="space-y-4">
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4
                          py-3 text-xs leading-relaxed text-slate-400">
              <T>Der VIP-Zugang ist etwas anderes als ein CompHub-Konto: er
                 wird vergeben, nicht angelegt. Wer keinen Schlüssel hat,
                 registriert sich links.</T>
            </p>
            <VIPLoginForm />
          </div>
        ) : (
        <>
        <form onSubmit={abschicken} className="space-y-3">
          {reiter === 'registrieren' && (
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t('Anzeigename')} autoComplete="nickname"
              className={feld} />
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            type="email" required placeholder={t('E-Mail-Adresse')}
            autoComplete="email" className={feld} />
          <input value={passwort} onChange={(e) => setPasswort(e.target.value)}
            type="password" required
            placeholder={reiter === 'registrieren'
              ? t('Passwort — mindestens acht Zeichen') : t('Passwort')}
            autoComplete={reiter === 'registrieren'
              ? 'new-password' : 'current-password'}
            className={feld} />

          {fehler && (
            <p className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4
                          py-2.5 text-xs text-rose-300">{fehler}</p>
          )}
          {hinweis && (
            <p className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4
                          py-2.5 text-xs text-amber-300">{hinweis}</p>
          )}

          <button type="submit" disabled={laeuft}
            className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold
                       text-white transition hover:bg-sky-400
                       disabled:cursor-not-allowed disabled:opacity-40">
            {laeuft ? <T>einen Moment …</T>
              : reiter === 'registrieren' ? <T>Konto anlegen</T> : <T>Anmelden</T>}
          </button>
        </form>

        {/* -------------------------------------------------- Die Dienste */}
        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-zinc-800" />
          <span className="text-[10px] uppercase tracking-[0.16em] text-slate-600">
            <T>oder</T>
          </span>
          <span className="h-px flex-1 bg-zinc-800" />
        </div>

        {/*
          * Quadrate mit dem Logo statt breiter Zeilen.
          *
          * So macht es fast jede Anmeldeseite, und es hat einen Grund: das
          * Logo erkennt man schneller als den Text daneben, und drei
          * Quadrate nebeneinander brauchen ein Drittel der Hoehe. Was der
          * Knopf tut, steht im Titel beim Darueberfahren.
          */}
        <div className="flex flex-wrap justify-center gap-3">
          {ANBIETER.map((a) => {
            const bereit = dienste?.dienste[a.schluessel] ?? false;
            const titel = reiter === 'registrieren'
              ? `${t('Registrieren mit')} ${a.titel}`
              : `${t('Anmelden mit')} ${a.titel}`;

            /*
             * Nicht eingerichtete Dienste bleiben sichtbar, aber tot - und
             * sagen im Titel, was fehlt. Ein Knopf, der auf "invalid client"
             * fuehrt, laesst den Nutzer glauben, er habe etwas falsch
             * gemacht.
             */
            if (!bereit) {
              return (
                <div key={a.schluessel}
                  title={`${titel} — ${t('In .env.local fehlen die Zugangsdaten')}`}
                  className="flex h-16 w-16 cursor-not-allowed items-center
                             justify-center rounded-xl border border-zinc-900
                             opacity-25">
                  <img src={a.logo} alt={a.titel} className="h-7 w-7 object-contain" />
                </div>
              );
            }
            return (
              <a key={a.schluessel} href={a.pfad} title={titel}
                className="flex h-16 w-16 items-center justify-center rounded-xl
                           border border-zinc-800 bg-zinc-900/40 transition
                           hover:border-sky-500 hover:bg-zinc-900">
                <img src={a.logo} alt={a.titel} className="h-7 w-7 object-contain" />
              </a>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-600">
          <T>Ohne Konto ist alles zu sehen. Angemeldet bleiben deine Streamwände,
          Ordner und Tierlists erhalten.</T>
        </p>
        </>
        )}
        <p className="mt-3 text-center text-[11px] text-slate-700">
          <Link href="/" className="transition hover:text-sky-400">
            ← <T>zur Startseite</T>
          </Link>
        </p>
      </div>
    </main>
  );
}
