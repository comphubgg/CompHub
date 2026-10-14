'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import T from '@/app/components/T';
import VIPLoginForm from '../login/VIPLoginForm';
import HeroHintergrund from '@/app/components/HeroHintergrund';
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

/**
 * Die Anmeldeseite.
 *
 * @param start Welcher Reiter offen ist, wenn die Seite aufgeht. Die Adresse
 *   /anmelden/vip fuehrt geradewegs zum VIP-Zugang: der Link steht in Discord
 *   in jedem Schluesselkanal, und wer ihm folgt, will nicht erst einen Reiter
 *   suchen. Der Betreiber hatte genau das bemerkt - er landete auf dem
 *   E-Mail-Formular statt beim VIP-Zugang.
 */
export default function Anmelden({ start = 'anmelden' }: {
  start?: 'anmelden' | 'registrieren' | 'vip';
} = {}) {
  const t = useT();
  const router = useRouter();
  const [reiter, setReiter] = useState<'anmelden' | 'registrieren' | 'vip'>(start);
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

  /*
   * Warum ein Anmeldedienst abgebrochen hat.
   *
   * Die drei Rueckwege schicken den Grund als "?fehler=..." mit - und diese
   * Seite hat ihn bisher weggeworfen. Wer sich mit Google oder Discord
   * anzumelden versuchte und scheiterte, landete deshalb auf einem
   * unveraenderten Anmeldeformular und konnte nur raten. Genau so kam die
   * Meldung "nur Twitch funktioniert" zustande: es gab schlicht nichts zu
   * lesen.
   *
   * Gelesen wird aus window.location, nicht mit useSearchParams: das
   * verlangt eine Suspense-Grenze um die halbe Seite, und dafuer ist ein
   * Fehlerhinweis zu wenig Anlass.
   */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const art = p.get('fehler');
    if (!art) return;

    const dienst = p.get('dienst');
    const grund = p.get('grund');
    const saetze: Record<string, string> = {
      abgebrochen: 'Der Anmeldedienst hat abgebrochen. Meist fehlt dort der '
        + 'Rückweg zu dieser Adresse.',
      state: 'Der Anmeldevorgang war abgelaufen. Bitte noch einmal versuchen.',
      token: 'Der Anmeldedienst hat den Code nicht angenommen. Client-ID, '
        + 'Secret oder der eingetragene Rückweg passen nicht.',
      profil: 'Der Anmeldedienst gab kein Profil heraus.',
      email: 'Dieses Konto hat dort keine bestätigte Adresse — damit lässt '
        + 'sich hier keines anlegen.',
      keine: 'Der Anmeldedienst hat keine Adresse mitgeschickt.',
      konto: 'Das Konto ließ sich nicht anlegen.',
      unerwartet: 'Da ist etwas schiefgegangen.',
    };

    setFehler([
      dienst ? `${dienst[0].toUpperCase()}${dienst.slice(1)}: ` : '',
      t(saetze[art] ?? 'Die Anmeldung hat nicht geklappt.'),
      // Der Wortlaut des Dienstes selbst, wenn er einen mitgeschickt hat -
      // er benennt den Grund genauer als jede Umschreibung von hier.
      grund ? ` (${grund})` : '',
    ].join(''));

    // Die Adresse wieder saubermachen, damit ein Neuladen nicht denselben
    // Hinweis noch einmal aufwirft.
    window.history.replaceState({}, '', '/sign-in');
  }, [t]);

  useEffect(() => {
    void Promise.resolve().then(async () => {
      try {
        const [d, ich] = await Promise.all([
          fetch('/api/konto/dienste').then((r) => r.json()),
          fetch('/api/konto', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        setDienste(d);
        // Wer schon angemeldet ist, hat hier nichts zu suchen.
        if (ich?.angemeldet) router.replace(ich?.konto?.rolle === 'pro' ? '/pov' : '/account');
      } catch { /* dann eben ohne */ }
    });
  }, [router]);

  /*
   * Zwei stille Angaben gegen Anmelde-Bots - siehe app/api/konto.
   *
   * "website" ist ein Feld, das kein Mensch sieht und deshalb leer bleibt;
   * "seit" ist der Zeitpunkt, an dem das Formular aufging.
   */
  const [website, setWebsite] = useState('');
  const [seit] = useState(() => Date.now());

  async function abschicken(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true); setFehler(''); setHinweis('');
    try {
      const r = await fetch('/api/konto', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          was: reiter, email, passwort,
          ...(reiter === 'registrieren' ? { name, website, seit } : {}),
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
        /*
         * Ein VIP-Zugang auch hier.
         *
         * Wer hier den Namen und den Schluessel seines VIP-Zugangs eintippt, hat kein Konto gemeint, sondern den
         * Schluessel - und bekam "Diesen Namen kennt niemand hier" (der Betreiber, 12.10.2026). Also: kennt das
         * Formular den Namen nicht als Konto, wird er als VIP-Zugang versucht. Klappt auch das nicht, bleibt es bei
         * der bisherigen Antwort. Der eigene VIP-Reiter bleibt dafuer da.
         */
        if (reiter === 'anmelden' && j?.keinKonto && email.trim() && !email.includes('@') && passwort) {
          try {
            const v = await fetch('/api/auth/vip', {
              method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: email.trim(), accessKey: passwort }),
            });
            if (v.ok) {
              const nach = new URLSearchParams(window.location.search).get('weiter') ?? '';
              window.location.href = /^\/[a-z0-9/_-]*$/i.test(nach) && !nach.startsWith('//') ? nach : '/vip';
              return;
            }
          } catch { /* dann gilt die Antwort des Kontos */ }
        }
        setFehler(t(j?.fehler ?? 'Das hat nicht geklappt.'));
        // Kein Konto? Dann gleich zum Registrieren, mit der Adresse im Feld.
        if (j?.keinKonto) { setReiter('registrieren'); setPasswort(''); }
        return;
      }
      if (j?.hinweis) setHinweis(j.hinweis);
      // Wer von einer gesperrten Adresse kam (/admin), kommt dorthin zurueck.
      const weiter = new URLSearchParams(window.location.search).get('weiter') ?? '';
      router.push(/^\/[a-z0-9/_-]*$/i.test(weiter) && weiter.startsWith('/') && !weiter.startsWith('//') ? weiter : (j?.konto?.rolle === 'pro' ? '/pov' : '/account'));
      router.refresh();
    } catch (err) {
      setFehler((err as Error).message);
    } finally { setLaeuft(false); }
  }

  const feld = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-500 '
    + 'transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20';

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-16">
      {/* Dieselbe laufende Vorschau wie auf der Startseite: Cup-Banner, Karten und Spielerfotos hinter dem Formular. */}
      <HeroHintergrund />
      <div className="relative grid w-full max-w-5xl items-center gap-12 lg:grid-cols-[1fr_28rem]">
        <div className="hidden lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="mb-6 h-16 w-auto drop-shadow-xl" />
          <h1 className="schrift-anzeige text-5xl font-extrabold leading-[1.02] tracking-tight text-slate-100">
            <T>Komm rein.</T>
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-300"><T>Dein Konto für den Fortnite-Wettkampf: Statistiken, Turniere und Streams an einem Ort.</T></p>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {['Deine Streamwände, Ordner und Tierlists bleiben erhalten — auf jedem Gerät.', 'Updates, Support und Zugang direkt im Discord.', 'Kostenlos — ohne Konto bleibt alles zu sehen.'].map((z) => (
              <li key={z} className="flex items-start gap-3">
                <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500 text-[11px] font-black text-white">✓</span>
                <span><T>{z}</T></span>
              </li>
            ))}
          </ul>
        </div>
      <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/90 p-7 shadow-[0_24px_60px_rgba(15,23,42,.28)] backdrop-blur-xl sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/CompHub-Logo-frei.png" alt=""
          className="mx-auto mb-6 h-12 w-auto opacity-90 lg:hidden" />
        <h2 className="schrift-anzeige mb-5 hidden text-2xl font-extrabold tracking-tight text-slate-100 lg:block">
          {reiter === 'registrieren' ? <T>Konto anlegen</T> : reiter === 'vip' ? <T>VIP-Zugang</T> : <T>Anmelden</T>}
        </h2>

        {/* ----------------------------------------------------- Reiter */}
        <div className="mb-6 flex rounded-full bg-zinc-950 p-1">
          {([['anmelden', 'Anmelden'], ['registrieren', 'Registrieren'],
             ['vip', 'VIP']] as
            Array<['anmelden' | 'registrieren' | 'vip', string]>).map(([w, titel]) => (
            <button key={w} onClick={() => { setReiter(w); setFehler(''); }}
              className={`flex-1 rounded-full py-2 text-sm font-bold transition
                          ${reiter === w
                ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}>
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
          {/* Der Honigtopf: unsichtbar, ohne Tab-Reihenfolge, ohne Ausfuellhilfe.
              Ein Mensch sieht ihn nie; ein Bot fuellt ihn. */}
          {reiter === 'registrieren' && (
            <input value={website} onChange={(e) => setWebsite(e.target.value)}
              name="website" tabIndex={-1} autoComplete="off" aria-hidden
              className="absolute -left-[9999px] h-0 w-0 opacity-0" />
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
              <Link href="/password"
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
            className="w-full rounded-full bg-sky-500 py-3 text-sm font-bold
                       text-white shadow-lg shadow-sky-500/20 transition hover:-translate-y-0.5 hover:bg-sky-400
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
            /*
             * Solange die Auskunft noch unterwegs ist (oder ausbleibt), gilt
             * der Dienst als eingerichtet: die drei Knoepfe standen sonst
             * fuer eine Sekunde grau da - der Betreiber hielt Discord fuer
             * "ausgegraut". Nur ein klares Nein der Auskunft graut aus.
             */
            const bereit = dienste ? dienste.dienste[a.schluessel] : true;
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
                className="flex h-16 w-16 items-center justify-center rounded-2xl
                           border border-zinc-700 bg-zinc-950 transition
                           hover:-translate-y-0.5 hover:border-sky-500">
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
      </div>
    </main>
  );
}
