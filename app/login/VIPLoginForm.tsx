'use client';

// Der VIP-Zugang.
//
// Kein Konto, sondern ein vergebener Schluessel - deshalb ein eigenes
// Formular. Das Aussehen folgt jetzt aber der Anmeldeseite, auf der es
// sitzt: dieselben Felder, dieselben Rundungen, dasselbe Blau. Vorher stand
// hier Violett und Gruen, was neben dem Rest der Seite wie ein
// hereingeratenes Fremdstueck wirkte.
//
// Herausgenommen sind zwei Bloecke, die der Nutzer nicht mehr wollte: der
// Knopf zur Vorteilsseite und der Hinweis, dass Schluessel nur ueber den
// privaten Discord vergeben werden.

import { useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

export default function VIPLoginForm() {
  const t = useT();
  const [username, setUsername] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [zeigen, setZeigen] = useState(false);
  const [fehler, setFehler] = useState('');
  const [hilfeZeigen, setHilfeZeigen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  const feld = 'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 '
    + 'text-sm text-slate-100 outline-none placeholder:text-slate-600 '
    + 'focus:border-sky-500';

  async function abschicken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFehler('');
    setHilfeZeigen(false);
    setLaeuft(true);

    try {
      const antwort = await fetch('/api/auth/vip', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, accessKey }),
      });

      const daten = await antwort.json();

      if (!antwort.ok) {
        setFehler(daten?.error || t('Anmeldung fehlgeschlagen. Bitte die Angaben prüfen.'));
        // Nur bei falschem Schluessel den Weg zur Wiederherstellung zeigen -
        // bei einem Serverfehler waere der Hinweis irrefuehrend.
        setHilfeZeigen(antwort.status === 401);
        return;
      }

      // Nach /vip, nicht nach /admin: wer mit einem Zugangsschluessel
      // hereinkommt, ist kein Administrator und soll auch nicht so
      // adressiert werden. Dieselbe Seite, die passende Adresse.
      window.location.href = '/vip';
    } catch {
      setFehler(t('Anmeldung fehlgeschlagen. Bitte die Verbindung prüfen.'));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form onSubmit={abschicken} className="space-y-3">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder={t('Benutzername')}
        autoComplete="username"
        className={feld}
        required
      />

      <div className="relative">
        <input
          type={zeigen ? 'text' : 'password'}
          value={accessKey}
          onChange={(e) => setAccessKey(e.target.value)}
          placeholder={t('Zugangsschlüssel')}
          autoComplete="current-password"
          className={`${feld} pr-16`}
          required
        />
        <button
          type="button"
          onClick={() => setZeigen((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px]
                     font-semibold text-slate-500 transition hover:text-sky-400"
        >
          {zeigen ? <T>verbergen</T> : <T>zeigen</T>}
        </button>
      </div>

      {fehler && (
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 px-4
                        py-2.5 text-xs text-rose-300">
          <p>{fehler}</p>
          {hilfeZeigen && (
            <p className="mt-1.5 text-rose-400/80">
              <T>Schlüssel vergessen? Melde dich bei</T>{' '}
              <a
                href="https://x.com/CompHub_gg"
                target="_blank"
                rel="noreferrer"
                className="text-rose-200 underline-offset-2 hover:underline"
              >
                @CompHub_gg
              </a>.
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={laeuft}
        className="w-full rounded-lg bg-sky-500 py-2.5 text-sm font-semibold
                   text-white transition hover:bg-sky-400
                   disabled:cursor-not-allowed disabled:opacity-40"
      >
        {laeuft ? <T>einen Moment …</T> : <T>Anmelden</T>}
      </button>
    </form>
  );
}
