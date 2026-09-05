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
  /*
   * Das Passwort sichtbar machen.
   *
   * Wer auf einem Telefon ein langes Passwort eintippt, vertippt sich - und
   * sieht dann nur "Passwort stimmt nicht", ohne zu wissen, wo. Ein Auge
   * daneben kostet nichts und erspart den dritten Versuch.
   */
  const [passwortSichtbar, setPasswortSichtbar] = useState(false);
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
        /*
         * Die Meldung des Servers durch die Uebersetzung schicken.
         *
         * Sie entsteht auf Deutsch - in der englischen Ansicht stand hier
         * also "Dieses Konto ist gesperrt." mitten auf einer sonst
         * englischen Seite. Der Satz steht im Woerterbuch; er musste nur
         * noch hindurch.
         */
        setFehler(t(j?.fehler ?? 'Das hat nicht geklappt.'));
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
          {/*
            * Beim Anmelden geht beides: Adresse oder Name.
            *
            * Deshalb hier kein type="email" - der Browser wiese einen Namen
            * sonst als ungueltig zurueck, bevor der Server ihn ueberhaupt zu
            * sehen bekaeme. Beim Registrieren bleibt es bei der Adresse, denn
            * dort entsteht das Konto.
            */}
          <input value={email} onChange={(e) => setEmail(e.target.value)}
            type={reiter === 'registrieren' ? 'email' : 'text'} required
            placeholder={reiter === 'registrieren'
              ? t('E-Mail-Adresse') : t('E-Mail-Adresse oder Name')}
            autoComplete={reiter === 'registrieren' ? 'email' : 'username'}
            className={feld} />

          <div className="relative">
            <input value={passwort} onChange={(e) => setPasswort(e.target.value)}
              type={passwortSichtbar ? 'text' : 'password'} required
              placeholder={reiter === 'registrieren'
                ? t('Passwort — mindestens acht Zeichen') : t('Passwort')}
              autoComplete={reiter === 'registrieren'
                ? 'new-password' : 'current-password'}
              className={`${feld} pr-12`} />
            <button type="button"
              onClick={() => setPasswortSichtbar((v) => !v)}
              aria-label={passwortSichtbar ? t('Passwort verbergen') : t('Passwort anzeigen')}
              title={passwortSichtbar ? t('Passwort verbergen') : t('Passwort anzeigen')}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5
                         text-slate-500 transition hover:text-sky-400">
              {passwortSichtbar ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                  <path d="M6.7 6.7C4.6 8 3 10 2 12c2 4 6 7 10 7 1.7 0 3.3-.5 4.7-1.3
                           M9.9 5.2A9.8 9.8 0 0 1 12 5c4 0 8 3 10 7-.7 1.4-1.7 2.7-2.8 3.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none"
                  stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              )}
            </button>
          </div>

          {/* Der Weg zurueck, wenn das Passwort weg ist. Steht beim Anmelden
              und nicht beim Registrieren - dort gibt es noch keins. */}
          {reiter === 'anmelden' && (
            <div className="text-right">
              <Link href="/passwort"
                className="text-[11px] text-slate-500 transition hover:text-sky-400">
                <T>Passwort vergessen?</T>
              </Link>
            </div>
          )}

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
