'use client';

// Unten rechts: das Zahnrad mit den Einstellungen der Seite - Sprache, Helligkeit, Schriftgroesse, Animationen.
//
// Es sitzt fest unten rechts, damit es auf jeder Seite an derselben Stelle ist und beim Scrollen nicht verschwindet. Der frueher danebenstehende
// DE/EN-Schalter ist weg (Betreiber, 14.10.2026: "nur noch das Zahnrad"); die Sprache waehlt man in der Tafel.
//
// Das Zahnrad (Betreiber, 14.10.2026): die Kopfzeile ist voll, deshalb steht der Hell/Dunkel-Schalter nicht mehr dort, sondern hier in einer
// kleinen Einstellungstafel - mit Sprache, Helligkeit, Schriftgroesse und Animationen. Alles merkt sich die Seite im Cookie.

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SPRACHEN } from '@/app/lib/sprache';
import {
  BEWEGUNG_COOKIE, GROESSE_COOKIE, MODUS_COOKIE, designFuerPfad, lieseModus,
  type Groesse, type Modus,
} from '@/app/lib/design';
import { useSprache } from './SprachProvider';

const merke = (name: string, wert: string) => { document.cookie = `${name}=${wert}; path=/; max-age=31536000; samesite=lax`; };

/** Eine Zeile der Tafel: Beschriftung oben, Auswahl darunter. */
function Zeile({ titel, hinweis, children }: { titel: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <div className="py-3 first:pt-1 last:pb-1">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-500">{titel}</p>
        {hinweis && <p className="text-[0.68rem] text-slate-500">{hinweis}</p>}
      </div>
      {children}
    </div>
  );
}

/** Zwei bis drei Knoepfe nebeneinander, einer ist gewaehlt. */
function Wahl<W extends string>({ wert, optionen, setze, aus = false }: {
  wert: W; optionen: Array<[W, string, React.ReactNode?]>; setze: (w: W) => void; aus?: boolean;
}) {
  return (
    <div className={`grid gap-1 rounded-xl bg-zinc-950 p-1 ${optionen.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} ${aus ? 'opacity-50' : ''}`} role="group">
      {optionen.map(([w, text, symbol]) => (
        <button key={w} type="button" disabled={aus} onClick={() => setze(w)} aria-pressed={wert === w}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition ${wert === w
            ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:bg-zinc-800 hover:text-slate-200'} ${aus ? 'cursor-not-allowed' : ''}`}>
          {symbol}{text}
        </button>
      ))}
    </div>
  );
}

const Sonne = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Mond = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

export default function Sprachschalter() {
  const { sprache, setzeSprache, t } = useSprache();
  const pfad = usePathname();
  const alt = designFuerPfad(pfad ?? '') === 'alt';

  const [offen, setOffen] = useState(false);
  const [modus, setModus] = useState<Modus>('dunkel');
  const [groesse, setGroesse] = useState<Groesse>('normal');
  const [bewegung, setBewegung] = useState<'an' | 'aus'>('an');
  const huelle = useRef<HTMLDivElement>(null);

  // Den Stand vom <html>-Element holen (dort hat ihn der Server hingeschrieben).
  useEffect(() => {
    const h = document.documentElement;
    setModus(lieseModus(document.cookie));
    setGroesse((h.dataset.groesse as Groesse) || 'normal');
    setBewegung(h.dataset.bewegung === 'aus' ? 'aus' : 'an');
  }, []);

  // Schliessen: Escape oder ein Klick daneben.
  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    const klick = (e: MouseEvent) => { if (huelle.current && !huelle.current.contains(e.target as Node)) setOffen(false); };
    document.addEventListener('keydown', taste); document.addEventListener('mousedown', klick);
    return () => { document.removeEventListener('keydown', taste); document.removeEventListener('mousedown', klick); };
  }, [offen]);

  const stelleModus = (m: Modus) => { merke(MODUS_COOKIE, m); document.documentElement.dataset.modus = m; setModus(m); };
  const stelleGroesse = (g: Groesse) => {
    merke(GROESSE_COOKIE, g); setGroesse(g);
    if (g === 'normal') delete document.documentElement.dataset.groesse; else document.documentElement.dataset.groesse = g;
  };
  const stelleBewegung = (b: 'an' | 'aus') => {
    merke(BEWEGUNG_COOKIE, b); setBewegung(b);
    if (b === 'an') delete document.documentElement.dataset.bewegung; else document.documentElement.dataset.bewegung = b;
  };

  return (
    <div ref={huelle} className="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
      {/* Die Tafel: bleibt im Dokument und blendet nur ein - so laeuft das Auf- und Zuklappen weich. */}
      <div role="dialog" aria-label={t('Einstellungen')} aria-hidden={!offen}
        className={`w-72 origin-bottom-right rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl transition duration-200 ${offen
          ? 'pointer-events-auto translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-95 opacity-0'}`}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="schrift-anzeige text-base font-bold text-slate-100">{t('Einstellungen')}</h2>
          <button type="button" onClick={() => setOffen(false)} aria-label={t('Schließen')} tabIndex={offen ? 0 : -1}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-400 transition hover:bg-zinc-800 hover:text-slate-100">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="divide-y divide-zinc-800">
          <Zeile titel={t('Sprache')}>
            <Wahl wert={sprache} setze={setzeSprache} optionen={SPRACHEN.map((s) => [s.kennung, s.name] as [typeof sprache, string])} />
          </Zeile>
          <Zeile titel={t('Helligkeit')} hinweis={alt ? t('Diese Seite ist immer dunkel') : undefined}>
            <Wahl wert={modus} setze={stelleModus} aus={alt}
              optionen={[['hell', t('Hell'), Sonne], ['dunkel', t('Dunkel'), Mond]]} />
          </Zeile>
          <Zeile titel={t('Schriftgröße')}>
            <Wahl wert={groesse} setze={stelleGroesse}
              optionen={[['klein', t('Klein')], ['normal', t('Normal')], ['gross', t('Groß')]]} />
          </Zeile>
          <Zeile titel={t('Animationen')}>
            <Wahl wert={bewegung} setze={stelleBewegung} optionen={[['an', t('An')], ['aus', t('Aus')]]} />
          </Zeile>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen} aria-label={t('Einstellungen')} title={t('Einstellungen')}
          className={`grid h-10 w-10 place-items-center rounded-full border bg-zinc-950/90 shadow-lg backdrop-blur transition hover:border-sky-500 hover:text-sky-400 ${offen
            ? 'border-sky-500 text-sky-400' : 'border-zinc-700 text-slate-300'}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden className={`transition-transform duration-500 ${offen ? 'rotate-90' : ''}`}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
