'use client';

import { useEffect, useState } from 'react';

/*
 * Eine Zahl, deren Ziffern wie bei einem Kilometerzaehler von null auf ihren Wert rollen.
 *
 * Der Betreiber (12.10.2026): "dieser Scroll-Animation, wenn man auf die Seite kommt ... ich brauche unbedingt mehr
 * Animation." Jede Ziffer ist eine Saeule von 0 bis 9, die sich verschiebt; die Trenner stehen still. Sichtbar wird
 * sie erst, wenn `los` wahr ist (die Zahl ist da und im Bild) - bis dahin steht die Saeule auf null. Wer
 * Bewegung abgestellt hat, sieht die fertige Zahl sofort.
 */
export default function Rollzahl({ wert, los, ort = 'de-DE', dauer = 1100, className = '' }: {
  wert: number | null;
  los: boolean;
  ort?: string;
  /** Wie lange die laengste Ziffer rollt (ms). */
  dauer?: number;
  className?: string;
}) {
  const [an, setAn] = useState(false);
  const [ruhig, setRuhig] = useState(false);

  useEffect(() => {
    try { setRuhig(window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { /* alte Browser */ }
  }, []);
  useEffect(() => {
    if (!los || wert === null) return undefined;
    // Ein Takt Verzoegerung, damit die Ziffern erst auf null stehen und dann rollen.
    const id = window.setTimeout(() => setAn(true), 60);
    return () => window.clearTimeout(id);
  }, [los, wert]);

  if (wert === null) return <span className={className}>—</span>;
  const text = wert.toLocaleString(ort);
  const zeichen = [...text];
  const gezeigt = ruhig ? true : an;

  return (
    <span className={`inline-flex tabular-nums leading-none ${className}`} aria-label={text}>
      {zeichen.map((z, i) => {
        if (!/\d/.test(z)) return <span key={i} aria-hidden className="px-[0.04em]">{z}</span>;
        const ziffer = Number(z);
        // Von rechts nach links: die hinteren Ziffern rollen laenger, so laeuft die Zahl "hoch".
        const ausRechts = zeichen.length - 1 - i;
        return (
          <span key={i} aria-hidden className="relative inline-block overflow-hidden" style={{ height: '1em', width: '0.62em' }}>
            <span className="absolute left-0 top-0 flex w-full flex-col"
              style={{
                transform: `translateY(${gezeigt ? -ziffer : 0}em)`,
                transition: ruhig ? 'none' : `transform ${dauer + ausRechts * 90}ms cubic-bezier(.16,1,.3,1)`,
              }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <span key={d} style={{ height: '1em', lineHeight: '1em', textAlign: 'center' }}>{d}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
