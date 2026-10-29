'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { t } from '@/app/lib/i18n';

/*
 * Eine Pro-Einladung oeffnen (lib/povVip). Der Betreiber (29.10.2026): "man soll direkt automatisch in ein Pro-Account geladen werden ... man soll sich nicht
 * selber einloggen muessen". Der Link legt beim ersten Mal das Pro-Konto an und meldet an, danach meldet er immer in dasselbe Konto an - die Seite geht
 * gleich weiter zum POV-Dashboard. Nur wenn gerade ein anderes Konto angemeldet ist, fragt sie vorher (sonst waere es ohne Warnung abgemeldet).
 */

interface Info { ok: boolean; vipName?: string; gilt?: boolean; gesperrt?: boolean; schonDrin?: boolean; anderesKonto?: string | null; error?: string }

function Einladung() {
  const code = useSearchParams().get('code') ?? '';
  const [info, setInfo] = useState<Info | null>(null);
  const [fehler, setFehler] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const oeffnen = useCallback(async () => {
    setLaeuft(true); setFehler('');
    try {
      const j = await fetch('/api/pov/einladung', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).then((r) => r.json());
      if (j?.ok) { window.location.replace('/pov'); return; }
      setFehler(j?.fehler ? t(j.fehler) : t('Das hat nicht geklappt.'));
    } catch { setFehler(t('Das hat nicht geklappt.')); }
    setLaeuft(false);
  }, [code]);

  useEffect(() => {
    fetch(`/api/pov/einladung?code=${encodeURIComponent(code)}`, { cache: 'no-store' }).then((r) => r.json())
      .then((j: Info) => {
        setInfo(j);
        if (j?.schonDrin) window.location.replace('/pov');
        else if (j?.ok && j.gilt && !j.anderesKonto) void oeffnen();
      })
      .catch(() => setInfo({ ok: false, error: t('Nicht ladbar') }));
  }, [code, oeffnen]);

  const fertig = info && (!info.ok || !info.gilt || info.anderesKonto || fehler);
  if (!fertig) return <LadeSchirm />;

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
              <h1 className="mt-3 text-2xl font-extrabold">{info.gesperrt ? <T>Diese Einladung wurde zurückgezogen.</T> : <T>Diese Einladung ist abgelaufen.</T>}</h1>
              <p className="mt-3 text-sm text-slate-400"><T>Frag den VIP, der dir den Link geschickt hat, nach einem neuen.</T></p>
            </>
          ) : info.anderesKonto ? (
            <>
              <h1 className="mt-3 text-2xl font-extrabold">{info.vipName} <T>lädt dich als Pro ein</T></h1>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
                <T>Du bist gerade als</T> <b className="text-slate-200">{info.anderesKonto}</b> <T>angemeldet. Mit dem Link wirst du davon abgemeldet und in dein Pro-Konto angemeldet.</T>
              </p>
              {fehler && <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{fehler}</p>}
              <button type="button" onClick={() => void oeffnen()} disabled={laeuft}
                className="mt-6 rounded-lg bg-sky-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50">
                {laeuft ? <T>Wird angemeldet …</T> : <T>Zum Pro-Konto wechseln</T>}
              </button>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-2xl font-extrabold"><T>Das hat nicht geklappt.</T></h1>
              <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{fehler}</p>
              <button type="button" onClick={() => void oeffnen()} disabled={laeuft}
                className="mt-6 rounded-lg bg-sky-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"><T>Noch einmal versuchen</T></button>
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
