'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';

/*
 * Das Rating im Profil: die Konstanz-Note aus den letzten zwanzig Cups (scripts/spieler-kreis.mjs) und ihre Form-Kurve. Die Note ist unsere eigene Rechnung, keine fremde:
 * jede Platzierung zaehlt nach dem Feld, das schlechteste Fuenftel faellt weg. Ohne genug Cups steht hier nichts.
 */

export function ratingStufe(note: number): string {
  if (note >= 0.75) return 'Weltklasse';
  if (note >= 0.6) return 'Elite';
  if (note >= 0.5) return 'Sehr stark';
  if (note >= 0.4) return 'Stark';
  return 'Solide';
}

export default function KonstanzKarte({ epicId }: { epicId: string }) {
  const t = useT();
  const [rating, setRating] = useState<{ note: number; form: Array<[number, number]>; cups: number } | null>(null);

  useEffect(() => {
    let weg = false;
    setRating(null);
    fetch(`/api/spieler-rating?id=${encodeURIComponent(epicId)}`)
      .then((r) => r.json()).then((j) => { if (!weg) setRating(j?.rating ?? null); }).catch(() => {});
    return () => { weg = true; };
  }, [epicId]);

  if (!rating) return null;
  const B = 600; const H = 90; const RAND = 8;
  const n = rating.form.length;
  const x = (i: number) => RAND + (n > 1 ? (i / (n - 1)) * (B - 2 * RAND) : 0);
  const y = (note: number) => RAND + (1 - note) * (H - 2 * RAND);
  const linie = rating.form.map(([note], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(note).toFixed(1)}`).join(' ');

  return (
    <div className="mb-3 flex flex-wrap items-stretch gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-sm">
      <div className="min-w-[8.5rem]">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500"><T>Rating</T></p>
        <p className="schrift-anzeige mt-1.5 text-3xl font-extrabold tabular-nums text-sky-400">{rating.note.toFixed(2)}</p>
        <p className="mt-1 text-xs font-semibold text-slate-300">{t(ratingStufe(rating.note))}</p>
      </div>
      <div className="min-w-[14rem] flex-1">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-500">{t('Form der letzten {n} Cups').replace('{n}', String(n))}</p>
        <svg viewBox={`0 0 ${B} ${H}`} className="mt-1.5 h-20 w-full" preserveAspectRatio="none" role="img" aria-label={t('Form der letzten {n} Cups').replace('{n}', String(n))}>
          <path d={linie} fill="none" stroke="#38bdf8" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          {rating.form.map(([note, platz], i) => (
            <circle key={i} cx={x(i)} cy={y(note)} r="3.5" fill="#38bdf8"><title>{`#${platz.toLocaleString()}`}</title></circle>
          ))}
        </svg>
        <p className="mt-1 text-[11px] text-slate-500"><T>Links älter, rechts neuer. Die Note zählt jede Platzierung nach der Größe des Feldes, das schlechteste Fünftel fällt weg.</T></p>
      </div>
    </div>
  );
}
