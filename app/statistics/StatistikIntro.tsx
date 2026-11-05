'use client';

import { useCallback, useEffect, useState } from 'react';
import { useT } from '@/app/components/SprachProvider';

/*
 * Die kurze Fuehrung durch die Statistik-Seite (Betreiber, 2.11.2026): kein "i" an jedem Reiter - "Map" oder "Road to Finals" versteht
 * jeder -, sondern EIN "i" an der Leiste der Statistik, das mit einem Klick Teil fuer Teil nacheinander erklaert, wie ein Intro.
 *
 * Jeder Schritt hebt ein Element hervor, das auf der Seite ein data-intro traegt (die Bereiche der Leiste, das Suchfeld); was gerade nicht
 * da ist (Duell nur fuer VIPs), faellt weg. Der Rest der Seite wird abgedunkelt und laesst sich waehrenddessen nicht anklicken.
 */

/** Ein Satz je Bereich der Leiste. */
const ERKLAERUNG: Record<string, string> = {
  start: 'Das Wichtigste auf einen Blick: Rekorde, Bestwerte und die Spieler, die gerade vorne sind.',
  turniere: 'Alle ausgewerteten Cups mit Ergebnissen und Statistiken.',
  regional: 'Die Spieler einer Region im Vergleich.',
  spieler: 'Alle Spieler mit ihren Werten. Ein Klick öffnet das Profil.',
  aufsteiger: 'Wer gerade konstant stärker wird: die letzten zehn Cups gegen die zehn davor.',
  jahr: 'Das laufende Jahr: Preisgeld, Siege und Bestwerte.',
  orgs: 'Die E-Sports-Teams mit ihren Spielern und Preisgeldern.',
  vergleich: 'Zwei Spieler direkt gegeneinander vergleichen.',
};

interface Schritt { ziel: string | null; titel: string; text: string }
interface Rahmen { x: number; y: number; b: number; h: number }

export default function StatistikIntro({ bereiche, waehle }: { bereiche: Array<[string, string]>; waehle?: (bereich: string) => void }) {
  const t = useT();
  const [schritt, setSchritt] = useState<number | null>(null);
  const [rahmen, setRahmen] = useState<Rahmen | null>(null);

  const schritte: Schritt[] = [
    { ziel: null, titel: 'Kurz erklärt', text: 'Auf dieser Seite steckt viel drin. In ein paar Schritten siehst du, was wo zu finden ist.' },
    ...bereiche.filter(([w]) => ERKLAERUNG[w]).map(([w, titel]) => ({ ziel: `bereich-${w}`, titel, text: ERKLAERUNG[w] })),
    { ziel: 'suche', titel: 'Spielersuche', text: 'Hier tippst du den Namen eines Spielers ein. Ein Klick auf den Treffer öffnet sein Profil.' },
  ];
  const jetzt = schritt === null ? null : schritte[schritt];

  // Die Seite geht mit (Betreiber, 5.11.2026): der erklaerte Reiter ist auch der geoeffnete und damit blau.
  const zielBereich = jetzt?.ziel?.startsWith('bereich-') ? jetzt.ziel.slice(8) : null;
  useEffect(() => { if (zielBereich) waehle?.(zielBereich); }, [zielBereich, waehle]);

  const messen = useCallback(() => {
    if (!jetzt?.ziel) { setRahmen(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-intro="${jetzt.ziel}"]`);
    const r = el?.getBoundingClientRect();
    setRahmen(r && r.width ? { x: r.left, y: r.top, b: r.width, h: r.height } : null);
  }, [jetzt?.ziel]);

  useEffect(() => {
    if (schritt === null) return undefined;
    const el = jetzt?.ziel ? document.querySelector<HTMLElement>(`[data-intro="${jetzt.ziel}"]`) : null;
    el?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    messen();
    const spaeter = window.setTimeout(messen, 400);
    window.addEventListener('resize', messen);
    window.addEventListener('scroll', messen, true);
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSchritt(null);
      if (e.key === 'ArrowRight') setSchritt((s) => (s === null ? s : Math.min(s + 1, schritte.length - 1)));
      if (e.key === 'ArrowLeft') setSchritt((s) => (s === null ? s : Math.max(s - 1, 0)));
    };
    window.addEventListener('keydown', taste);
    return () => {
      window.clearTimeout(spaeter);
      window.removeEventListener('resize', messen);
      window.removeEventListener('scroll', messen, true);
      window.removeEventListener('keydown', taste);
    };
  }, [schritt, jetzt?.ziel, messen, schritte.length]);

  const letzter = schritt === schritte.length - 1;
  const RAND = 6;
  const kartenBreite = typeof window === 'undefined' ? 340 : Math.min(340, window.innerWidth - 32);
  // Die Karte unter dem hervorgehobenen Teil - passt sie dort nicht hin, darueber; ohne Ziel in der Mitte.
  const karte = (() => {
    if (typeof window === 'undefined' || !rahmen) return null;
    const links = Math.max(16, Math.min(rahmen.x + rahmen.b / 2 - kartenBreite / 2, window.innerWidth - kartenBreite - 16));
    const unten = rahmen.y + rahmen.h + RAND + 12;
    return unten + 190 < window.innerHeight ? { left: links, top: unten } : { left: links, bottom: window.innerHeight - rahmen.y + RAND + 12 };
  })();

  return (
    <>
      <button type="button" onClick={() => setSchritt(0)} aria-label={t('Kurz erklärt')} title={t('Kurz erklärt')}
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-slate-400 shadow-sm
                   transition hover:border-sky-500 hover:text-sky-400">
        <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full border-[1.5px] border-current font-serif text-[11px] font-bold leading-none">i</span>
      </button>

      {jetzt && (
        <div className="fixed inset-0 z-[200]" role="dialog" aria-modal="true" aria-label={t('Kurz erklärt')}>
          {/* Abdunkeln: ohne Ziel die ganze Flaeche, sonst alles ausser dem Ausschnitt (grosser Schatten um den Rahmen). */}
          {rahmen ? (
            <div className="pointer-events-none fixed rounded-2xl ring-2 ring-sky-400 transition-all duration-300"
              style={{ left: rahmen.x - RAND, top: rahmen.y - RAND, width: rahmen.b + 2 * RAND, height: rahmen.h + 2 * RAND, boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.72)' }} />
          ) : <div className="fixed inset-0 bg-[rgba(3,7,18,0.72)]" />}

          <div className="fixed rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
            style={karte ? { ...karte, width: kartenBreite } : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: kartenBreite }}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-400 tabular-nums">{schritt! + 1} / {schritte.length}</p>
            <p className="mt-1.5 text-base font-bold text-slate-50">{t(jetzt.titel)}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{t(jetzt.text)}</p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setSchritt(null)} className="text-xs font-semibold text-slate-500 transition hover:text-slate-300">
                {t('Überspringen')}
              </button>
              <div className="flex gap-2">
                {schritt! > 0 && (
                  <button type="button" onClick={() => setSchritt((s) => Math.max(0, (s ?? 0) - 1))}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-slate-300 transition hover:border-zinc-500">
                    {t('Zurück')}
                  </button>
                )}
                <button type="button" autoFocus onClick={() => setSchritt((s) => (letzter ? null : (s ?? 0) + 1))}
                  className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-bold text-white shadow transition hover:bg-sky-400">
                  {letzter ? t('Fertig') : t('Weiter')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
