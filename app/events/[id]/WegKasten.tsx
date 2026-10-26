'use client';

import { useState } from 'react';
import Link from 'next/link';
import T from '@/app/components/T';
import WegPlan from '@/app/globals-solos/WegPlan';

/*
 * Der Weg ins Grand Final auf der Event-Seite - zugeklappt (Betreiber, 26.10.2026: "Road und Map sollen nicht sofort dastehen, sondern nur, wenn man sie aufklappt - wie die Reiter, mit einem
 * Knopf zum Oeffnen"). Erst beim Oeffnen wird der Plan geladen.
 */
export default function WegKasten({ region }: { region: string }) {
  const [offen, setOffen] = useState(false);
  return (
    <section className="mb-5 rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
        <h2 className="text-base font-extrabold text-slate-100"><T>Der Weg ins Grand Final</T></h2>
        <div className="flex items-center gap-3">
          {offen && (
            <Link href={`/globals-solos?region=${region}`} className="text-xs font-semibold text-sky-400 hover:underline"><T>Alle Stufen, Spieler und Karte</T> →</Link>
          )}
          <button type="button" onClick={() => setOffen((o) => !o)} aria-expanded={offen}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-sky-500 hover:text-sky-400">
            {offen ? <T>Ausblenden</T> : <T>Anzeigen</T>}
            <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition ${offen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8l5 5 5-5" /></svg>
          </button>
        </div>
      </div>
      {offen && <div className="border-t border-zinc-800 p-5"><WegPlan region={region} /></div>}
    </section>
  );
}
