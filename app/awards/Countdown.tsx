'use client';

import { useEffect, useState } from 'react';

/** Countdown auf den naechsten Schritt der Awards (Tage, Stunden, Minuten, Sekunden). Bis zum ersten Zeichnen im Browser ohne Zahlen, damit Server und Browser gleich sind. */
export default function Countdown({ ziel, was }: { ziel: string; was: string }) {
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    const erst = setTimeout(() => setJetzt(Date.now()), 0);
    const t = setInterval(() => setJetzt(Date.now()), 1000);
    return () => { clearTimeout(erst); clearInterval(t); };
  }, []);
  const rest = jetzt === null ? null : Math.max(0, Date.parse(ziel) - jetzt);
  const teile: Array<[string, number | null]> = [
    ['days', rest === null ? null : Math.floor(rest / 86_400_000)],
    ['hrs', rest === null ? null : Math.floor(rest / 3_600_000) % 24],
    ['min', rest === null ? null : Math.floor(rest / 60_000) % 60],
    ['sec', rest === null ? null : Math.floor(rest / 1000) % 60],
  ];
  return (
    <div className="aw-box px-6 py-5">
      <p className="aw-kicker text-xs">{was}</p>
      <div className="mt-3 flex gap-3 sm:gap-5">
        {teile.map(([e, n]) => (
          <div key={e} className="min-w-[3.6rem] text-center">
            <div className="aw-anton text-4xl tabular-nums sm:text-5xl">{n === null ? '--' : String(n).padStart(2, '0')}</div>
            <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">{e}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
