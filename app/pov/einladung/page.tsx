'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import { t } from '@/app/lib/i18n';

/*
 * Eine Pro-Einladung annehmen (lib/povVip): ein VIP hat diesen Link geschickt. Wer angemeldet ist, nimmt mit einem Klick an - das Konto wird Pro, und
 * der VIP sieht sein POV. Ohne Anmeldung geht es erst zur Anmeldung und danach hierher zurueck.
 */

function Einladung() {
  const code = useSearchParams().get('code') ?? '';
  const zugang = useZugang();
  const [info, setInfo] = useState<{ ok: boolean; vipName?: string; gilt?: boolean; angenommen?: boolean; error?: string } | null>(null);
  const [stand, setStand] = useState<'' | 'laeuft' | 'fertig'>('');
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    fetch(`/api/pov/einladung?code=${encodeURIComponent(code)}`, { cache: 'no-store' }).then((r) => r.json())
      .then(setInfo).catch(() => setInfo({ ok: false, error: t('Nicht ladbar') }));
  }, [code]);

  const annehmen = async () => {
    setStand('laeuft'); setFehler('');
    try {
      const j = await fetch('/api/pov/einladung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).then((r) => r.json());
      if (j?.ok) { setStand('fertig'); window.setTimeout(() => { window.location.href = '/pov'; }, 1500); }
      else { setStand(''); setFehler(j?.fehler || j?.error ? t(j.fehler ?? j.error) : t('Das hat nicht geklappt.')); }
    } catch { setStand(''); setFehler(t('Das hat nicht geklappt.')); }
  };

  if (!info || zugang.laedt) return <LadeSchirm />;
  const angemeldet = zugang.nutzer || zugang.admin;
  const weiter = `/sign-in?weiter=${encodeURIComponent(`/pov/einladung?code=${code}`)}`;

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-10 text-slate-100">
      <section className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900 p-7 text-center sm:p-9">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-500"><T>Pro-Einladung</T></p>
          {!info.ok ? (
            <>
              <h1 className="mt-3 text-2xl font-extrabold"><T>Diese Einladung gibt es nicht.</T></h1>
              <p className="mt-3 text-sm text-slate-400"><T>Frag den VIP, der dir den Link geschickt hat, nach einem neuen.</T></p>
            </>
          ) : !info.gilt ? (
            <>
              <h1 className="mt-3 text-2xl font-extrabold">{info.angenommen ? <T>Diese Einladung wurde schon angenommen.</T> : <T>Diese Einladung ist abgelaufen.</T>}</h1>
              <p className="mt-3 text-sm text-slate-400"><T>Frag den VIP, der dir den Link geschickt hat, nach einem neuen.</T></p>
            </>
          ) : stand === 'fertig' ? (
            <>
              <h1 className="mt-3 text-2xl font-extrabold"><T>Du bist jetzt Pro.</T></h1>
              <p className="mt-3 text-sm text-slate-400"><T>Gleich geht es weiter zu deinem POV-Dashboard.</T></p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-2xl font-extrabold">{info.vipName} <T>lädt dich als Pro ein</T></h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
                <T>Mit einem Pro-Konto teilst du dein Spiel live mit den VIPs, die du freigibst - nicht öffentlich und nicht über Twitch. Der einladende VIP darf von Anfang an zusehen; alles Weitere stellst du selbst ein.</T>
              </p>
              {fehler && <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{fehler}</p>}
              <div className="mt-6">
                {angemeldet ? (
                  <button type="button" onClick={() => void annehmen()} disabled={stand === 'laeuft'}
                    className="rounded-lg bg-sky-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">
                    {stand === 'laeuft' ? <T>Wird angenommen …</T> : <T>Einladung annehmen</T>}
                  </button>
                ) : (
                  <Link href={weiter} className="inline-block rounded-lg bg-sky-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-400">
                    <T>Anmelden und annehmen</T>
                  </Link>
                )}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export default function EinladungSeite() {
  return <Suspense fallback={<LadeSchirm />}><Einladung /></Suspense>;
}
