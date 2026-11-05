'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';

/*
 * Die Aufsteiger (Betreiber, 4.11.2026): wer gerade konstant stark wird. Verglichen werden die letzten zehn Cups mit den zehn davor, gerechnet in scripts/spieler-kreis.mjs.
 * In der Liste steht nur, wer im letzten Monat gespielt hat und schon jetzt eine gute Note hat - ein einzelner guter Cup reicht nicht.
 */

interface Zeile { epicId: string; name: string; region: string; jetzt: number; vorher: number; delta: number; cups: number }
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'OCE', 'ME', 'ASIA'];

export default function Aufsteiger({ aufSpieler }: { aufSpieler: (id: string, name: string) => void }) {
  const [liste, setListe] = useState<Zeile[] | null>(null);
  const [region, setRegion] = useState('EU');

  useEffect(() => {
    let weg = false;
    fetch('/api/spieler-rating?liste=aufsteiger').then((r) => r.json())
      .then((j) => { if (!weg) setListe(j?.liste ?? []); }).catch(() => { if (!weg) setListe([]); });
    return () => { weg = true; };
  }, []);

  const zeilen = useMemo(() => (liste ?? []).filter((x) => x.region === region && x.name).slice(0, 50), [liste, region]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-100"><T>Aufsteiger</T></h2>
          <p className="mt-0.5 text-sm text-slate-400"><T>Wer gerade konstant stärker wird: die letzten zehn Cups gegen die zehn davor.</T></p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {REGIONEN.map((r) => (
            <button key={r} type="button" onClick={() => setRegion(r)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${region === r ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-zinc-800 text-slate-400 hover:border-zinc-600'}`}>{r}</button>
          ))}
        </div>
      </div>
      {liste === null ? <p className="py-8 text-center text-sm text-slate-500"><T>Wird geladen …</T></p>
        : !zeilen.length ? <p className="py-8 text-center text-sm text-slate-500"><T>Noch keine Aufsteiger in dieser Region.</T></p>
          : (
            <ol className="divide-y divide-zinc-800">
              {zeilen.map((x, i) => (
                <li key={x.epicId}>
                  <button type="button" onClick={() => aufSpieler(x.epicId, x.name)} className="flex w-full items-center gap-3 px-1 py-2.5 text-left transition hover:bg-zinc-800/50">
                    <span className="w-7 shrink-0 text-right text-sm tabular-nums text-slate-500">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{x.name}</span>
                    <span className="text-xs tabular-nums text-slate-500">{x.vorher.toFixed(2)} → {x.jetzt.toFixed(2)}</span>
                    <span className="w-14 text-right text-sm font-bold tabular-nums text-sky-400">+{x.delta.toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
    </section>
  );
}
