'use client';

import { useEffect, useState } from 'react';
import { MODUS_COOKIE, lieseModus, type Modus } from '@/app/lib/design';
import { useT } from '@/app/components/SprachProvider';

/*
 * Der Hell/Dunkel-Schalter in der Kopfzeile.
 *
 * Er stellt data-modus am <html>-Element um (sofort, ohne Neuladen) und merkt sich die Wahl im Cookie comphub_modus, das der Rahmen beim
 * naechsten Aufruf schon auf dem Server liest - so blitzt beim Laden nie die falsche Fassung auf.
 */
export default function ModusSchalter() {
  const t = useT();
  const [modus, setModus] = useState<Modus>('hell');
  useEffect(() => { setModus(document.documentElement.dataset.modus === 'dunkel' ? 'dunkel' : lieseModus(document.cookie)); }, []);

  const umschalten = () => {
    const neu: Modus = modus === 'hell' ? 'dunkel' : 'hell';
    document.cookie = `${MODUS_COOKIE}=${neu}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.modus = neu;
    setModus(neu);
  };
  const titel = modus === 'hell' ? t('Dunkles Design') : t('Helles Design');
  return (
    <button type="button" onClick={umschalten} title={titel} aria-label={titel}
      className="modus-schalter grid h-9 w-9 shrink-0 place-items-center rounded-full border border-zinc-800 text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
      {modus === 'hell'
        ? (/* Mond */ <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>)
        : (/* Sonne */ <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>)}
    </button>
  );
}
