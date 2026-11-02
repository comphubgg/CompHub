'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@/app/components/SprachProvider';

/*
 * Ein kleines "i" an einem Reiter, das in einem Satz sagt, was dahinter steht (Betreiber, 2.11.2026: "das i auf jede Tab zum Erklaeren,
 * was was heisst" - statt langer Erklaertexte auf der Seite). Am Rechner beim Darueberfahren, am Handy beim Antippen; der Reiter selbst
 * wechselt dabei nicht. Die Blase haengt am Seitenende (Portal), weil Reiterleisten seitlich scrollen und sie sonst abschneiden wuerden.
 *
 * Der Text ist deutsch und laeuft durch die Uebersetzung (app/lib/sprache).
 */
export default function ReiterInfo({ text }: { text: string }) {
  const t = useT();
  const ref = useRef<HTMLSpanElement>(null);
  const [ort, setOrt] = useState<{ x: number; y: number } | null>(null);
  /** Per Tippen geoeffnet - dann schliesst erst ein zweites Tippen oder ein Tippen daneben. */
  const [fest, setFest] = useState(false);

  const zeige = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setOrt({ x: r.left + r.width / 2, y: r.bottom + 8 });
  };
  const zu = () => { setOrt(null); setFest(false); };

  useEffect(() => {
    if (!ort) return undefined;
    const daneben = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) zu(); };
    window.addEventListener('scroll', zu, true);
    window.addEventListener('resize', zu);
    document.addEventListener('pointerdown', daneben);
    return () => {
      window.removeEventListener('scroll', zu, true);
      window.removeEventListener('resize', zu);
      document.removeEventListener('pointerdown', daneben);
    };
  }, [ort]);

  const breite = 260;
  const links = ort ? Math.max(8, Math.min(ort.x - breite / 2, window.innerWidth - breite - 8)) : 0;

  return (
    <>
      <span ref={ref} role="button" tabIndex={0} aria-label={t('Was zeigt dieser Reiter?')}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (ort && fest) zu(); else { zeige(); setFest(true); } }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.stopPropagation(); e.preventDefault();
          if (ort) zu(); else { zeige(); setFest(true); }
        }}
        onMouseEnter={zeige} onMouseLeave={() => { if (!fest) setOrt(null); }}
        className="ml-1.5 inline-flex h-[15px] w-[15px] shrink-0 cursor-help items-center justify-center rounded-full border border-current
                   font-serif text-[10px] font-bold normal-case leading-none tracking-normal opacity-50 transition hover:opacity-100
                   focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        i
      </span>
      {ort && createPortal(
        <div role="tooltip" style={{ position: 'fixed', left: links, top: ort.y, width: breite }}
          className="z-[200] rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 py-2.5 text-left text-[13px] font-normal normal-case
                     leading-snug tracking-normal text-slate-200 shadow-2xl">
          {t(text)}
        </div>,
        document.body,
      )}
    </>
  );
}
