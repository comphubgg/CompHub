'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';
import { MARKE } from '@/lib/marke';

/*
 * Der Hinweis fuer einen VIP-Schluessel, der erst mit Twitch bestaetigt werden muss (lib/vipZugaenge, twitchPflicht).
 *
 * Der Betreiber (2.11.2026): Verdacht, dass ein Streamer-Schluessel von jemand anderem benutzt wird. Statt einer Sperre mit Vorwurf eine
 * normale Sicherheitspruefung: der Schluessel ruht, bis sich sein Inhaber einmal mit seinem Twitch-Konto bestaetigt; wer keinen Zugang zu
 * diesem Twitch-Konto hat, fragt auf Discord oder X nach einem neuen Schluessel. Solange er ruht, hat der Schluessel keine Rechte (verify
 * meldet grund 'twitch'); das Fenster laesst sich schliessen, dann sieht man die Seite wie jeder Besucher.
 *
 * Danach meldet der Rueckweg von Twitch ?twitch=bestaetigt oder ?twitch=falsches-konto - beides sagt das Fenster einmal an.
 */
export default function TwitchPruefung() {
  const t = useT();
  const [lage, setLage] = useState<'pruefen' | 'bestaetigt' | 'falsch' | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const rueck = p.get('twitch');
    // Nur zum Ansehen (Betreiber): ?twitch=vorschau zeigt das Fenster, ohne dass ein Schluessel betroffen ist.
    if (rueck === 'vorschau') { setLage('pruefen'); return; }
    if (rueck === 'bestaetigt' || rueck === 'falsches-konto') {
      setLage(rueck === 'bestaetigt' ? 'bestaetigt' : 'falsch');
      p.delete('twitch');
      const rest = p.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
      if (rueck === 'bestaetigt') return;
    }
    fetch('/api/auth/verify', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { grund?: string }) => { if (j.grund === 'twitch') setLage((l) => l ?? 'pruefen'); })
      .catch(() => undefined);
  }, []);

  if (!lage) return null;

  const knopf = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition';
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(3,7,18,0.78)] p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        {lage === 'bestaetigt' ? (
          <>
            <p className="text-lg font-bold text-slate-50">{t('Bestätigt - dein Zugang ist wieder aktiv.')}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{t('Danke! Alles ist wieder freigeschaltet.')}</p>
            <button type="button" onClick={() => window.location.reload()} className={`${knopf} mt-5 w-full bg-sky-500 text-white hover:bg-sky-400`}>
              {t('Weiter')}
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-300">{t('Sicherheitsprüfung')}</p>
            <p className="mt-1.5 text-lg font-bold text-slate-50">
              {lage === 'falsch' ? t('Das war nicht das richtige Twitch-Konto.') : t('Dein Zugangsschlüssel wurde vorübergehend pausiert.')}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              {t('Bestätige kurz mit dem Twitch-Konto, zu dem dieser Zugang gehört - danach ist er sofort wieder aktiv.')}
            </p>
            <a href="/api/auth/twitch/authorize?zweck=vip" className={`${knopf} mt-5 w-full bg-[#9146ff] text-white hover:bg-[#a970ff]`}>
              {t('Mit Twitch bestätigen')}
            </a>
            <p className="mt-5 text-sm leading-relaxed text-slate-400">
              {t('Kein Zugriff auf dieses Twitch-Konto? Frag auf unserem Discord oder auf X nach einem neuen Schlüssel.')}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a href={MARKE.discord} target="_blank" rel="noreferrer" className={`${knopf} border border-zinc-700 text-slate-200 hover:border-[#5865f2]`}>Discord</a>
              <a href="https://x.com/juanitofnbr" target="_blank" rel="noreferrer" className={`${knopf} border border-zinc-700 text-slate-200 hover:border-slate-400`}>X</a>
            </div>
            <button type="button" onClick={() => setLage(null)} className="mt-4 w-full text-xs font-semibold text-slate-500 transition hover:text-slate-300">
              {t('Schließen')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
