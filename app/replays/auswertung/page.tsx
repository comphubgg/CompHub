'use client';

/*
 * Mehrere Cup-Tage zusammen ausgewertet (aus "Replay laden" -> "Auswahl analysieren"): /replays/auswertung?tage=A,B,...
 * Zonen-Glueck und "gegen die Erwartung" ueber alle Games der Auswahl.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import TagesAuswertung from '../TagesAuswertung';
import LadenDialog from '../LadenDialog';

export default function AuswertungSeite() {
  const [tage, setTage] = useState<string[]>([]);
  const [laden, setLaden] = useState(false);
  useEffect(() => {
    try { setTage((new URLSearchParams(window.location.search).get('tage') ?? '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4)); } catch { /* ohne Adresse nichts */ }
  }, []);
  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1200px] px-4 py-8">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/replays" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 transition hover:border-sky-500/60">← <T>All replays</T></Link>
          <button type="button" onClick={() => setLaden(true)} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-sky-400"><T>Load replay</T></button>
          <LadenDialog offen={laden} schliessen={() => setLaden(false)} />
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl"><T>Combined analysis</T></h1>
        <p className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {tage.map((x) => <Link key={x} href={`/replays/${encodeURIComponent(x)}`} className="rounded bg-white/10 px-1.5 py-0.5 text-slate-200 hover:text-sky-300">{x.replace(/^S\d+_/, '').replace(/_/g, ' ')}</Link>)}
        </p>
        <div className="mt-6">{tage.length ? <TagesAuswertung tage={tage} /> : <p className="text-sm text-slate-500"><T>No cup days selected.</T></p>}</div>
      </div>
    </main>
  );
}
