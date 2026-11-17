'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * "Photos from" (Betreiber, 17.11.2026): statt eines Credits an jedem Foto ein kleiner Link - oben rechts auf /statistics und in der Fusszeile.
 * Ein Klick oeffnet die Liste aller Quellen, gruppiert nach Organisationen und Fotografen, mit der Zahl ihrer oeffentlichen Fotos
 * (/api/foto-quellen, lib/fotoQuellen.ts - rechnet sich selbst aus foto-credits.json, dazu foto-quellen-extra.json).
 *
 * Aussehen: halbdurchsichtig schwarz, helle Schrift in der Seitenschrift - wie der Rest der Seite; auch im hellen Modus dunkel (foto-dunkel).
 */

interface Quelle { name: string; handle?: string; link?: string; fotos: number }
interface Liste { organisationen: Quelle[]; fotografen: Quelle[] }

let geladen: Promise<Liste | null> | null = null;
const holen = () => (geladen ??= fetch('/api/foto-quellen').then((r) => (r.ok ? r.json() : null)).catch(() => null)
  .then((j: Liste | null) => { if (!j) geladen = null; return j; }));

function Zeile({ q }: { q: Quelle }) {
  const t = useT();
  const name = q.link
    ? <a href={q.link} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words font-medium text-slate-100 underline-offset-2 hover:underline">{q.name}</a>
    : <span className="min-w-0 break-words font-medium text-slate-100">{q.name}</span>;
  return (
    <li className="flex items-baseline gap-2 py-1.5">
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        {name}
        {q.handle && !q.name.startsWith('@') && (
          <a href={`https://x.com/${q.handle}`} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-slate-400 hover:text-slate-200">@{q.handle}</a>
        )}
      </span>
      {q.fotos > 0 && <span className="shrink-0 text-xs tabular-nums text-slate-400">{q.fotos} {q.fotos === 1 ? t('Foto') : t('Fotos')}</span>}
    </li>
  );
}

function Fenster({ zu }: { zu: () => void }) {
  const t = useT();
  const [liste, setListe] = useState<Liste | null | 'fehler'>(null);
  useEffect(() => { let weg = false; holen().then((l) => { if (!weg) setListe(l ?? 'fehler'); }); return () => { weg = true; }; }, []);
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') zu(); };
    window.addEventListener('keydown', taste);
    return () => window.removeEventListener('keydown', taste);
  }, [zu]);

  const gruppe = (titel: string, q: Quelle[]) => q.length > 0 && (
    <section className="mt-4 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"><T>{titel}</T></h3>
      <ul className="mt-1 divide-y divide-white/[0.06] text-sm">{q.map((x) => <Zeile key={`${x.name}-${x.handle ?? ''}`} q={x} />)}</ul>
    </section>
  );

  return (
    <div className="foto-dunkel fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) zu(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="foto-quellen-titel"
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-black/80 p-5 text-slate-200 shadow-2xl backdrop-blur-md">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 id="foto-quellen-titel" className="text-base font-semibold text-white"><T>Fotos von</T></h2>
          <button type="button" onClick={zu} aria-label={t('Schließen')} autoFocus
            className="-mr-1 -mt-1 rounded-md p-1 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-slate-400"><T>Die Spielerfotos auf CompHub stammen von diesen Quellen. Danke!</T></p>
        {liste === null && <p className="text-sm text-slate-400"><T>Lädt …</T></p>}
        {liste === 'fehler' && <p className="text-sm text-slate-400"><T>Die Liste konnte nicht geladen werden.</T></p>}
        {liste && liste !== 'fehler' && (<>
          {gruppe('Organisationen', liste.organisationen)}
          {gruppe('Fotografen', liste.fotografen)}
        </>)}
        <p className="mt-5 border-t border-white/[0.06] pt-3 text-[11px] text-slate-500">
          <T>Soll ein Foto genannt oder entfernt werden?</T>{' '}
          <Link href="/contact" onClick={zu} className="text-slate-300 underline-offset-2 hover:underline"><T>Schreib uns.</T></Link>
        </p>
      </div>
    </div>
  );
}

/** Der kleine Link "Photos from" - oeffnet die Liste. */
export default function FotoQuellen({ className = '' }: { className?: string }) {
  const [offen, setOffen] = useState(false);
  const zu = useCallback(() => setOffen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOffen(true)} aria-haspopup="dialog" data-foto-quellen
        className={`inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-200 ${className}`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13.5" r="3.5" />
        </svg>
        <T>Fotos von</T>
      </button>
      {offen && typeof document !== 'undefined' && createPortal(<Fenster zu={zu} />, document.body)}
    </>
  );
}
