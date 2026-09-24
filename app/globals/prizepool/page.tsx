'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import GlobalsGeruest, { FNCS_BLAU } from '../GlobalsGeruest';

/*
 * Das Preisgeld der Global Championship - jeder Platz mit seinem Betrag.
 *
 * Der Betreiber: "eine Price-Pool-Page, wo man sieht, welcher Platz wie viel
 * gewinnen wuerde, also einfach alle Plaetze mit ihrem Price Pool, in meinem
 * Style." Die Zahlen kommen aus Epics Auszahlungstabelle (siehe
 * /api/globals-preisgeld), je Spieler; ein Duo bekommt das Doppelte, und
 * beides steht da.
 */

interface Platz { platz: number; proSpieler: number; proTeam: number; spanne: [number, number] }
interface Antwort {
  waehrung: string; teamGroesse: number; plaetze: Platz[];
  summe: number; summeProSpieler: number; error?: string;
}

const PODEST = [
  { ring: 'ring-amber-300/70', schein: 'from-amber-400/25', zahl: 'text-amber-200' },
  { ring: 'ring-slate-300/50', schein: 'from-slate-300/15', zahl: 'text-slate-100' },
  { ring: 'ring-orange-400/50', schein: 'from-orange-500/15', zahl: 'text-orange-200' },
];

export default function GlobalsPreisgeld() {
  const { sprache } = useSprache();
  const [daten, setDaten] = useState<Antwort | null>(null);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    let weg = false;
    fetch('/api/globals-preisgeld')
      .then((r) => r.json())
      .then((j: Antwort) => {
        if (weg) return;
        if (j.error) setFehler(j.error); else setDaten(j);
      })
      .catch((e) => { if (!weg) setFehler((e as Error).message); });
    return () => { weg = true; };
  }, []);

  const geld = (n: number) => new Intl.NumberFormat(sprache === 'en' ? 'en-US' : 'de-DE',
    { style: 'currency', currency: daten?.waehrung ?? 'USD', maximumFractionDigits: 0 }).format(n);
  const ordnung = (n: number) => (sprache === 'en'
    ? `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`
    : `${n}.`);

  return (
    <GlobalsGeruest aktiv="/globals/prizepool">
      {fehler ? (
        <p className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          <T>Epic nennt das Preisgeld gerade nicht - bitte gleich noch einmal laden.</T>
          <span className="ml-2 text-amber-300/60">({fehler})</span>
        </p>
      ) : !daten ? (
        <LadeSchirm />
      ) : (
        <div className="space-y-6">
          {/* ------------------------------------------------ Der Topf */}
          <section className="relative overflow-hidden rounded-2xl border border-amber-500/25
                              bg-zinc-950 px-6 py-8 text-center">
            <div aria-hidden className="absolute inset-0"
              style={{ background: `radial-gradient(60% 80% at 50% 0%, ${FNCS_BLAU}40, transparent 70%)` }} />
            <div className="relative">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-300/80">
                <T>Preisgeld</T>
              </p>
              <p className="mt-2 text-5xl font-black tracking-tight tabular-nums sm:text-6xl"
                style={{ color: '#ffd766' }}>
                {geld(daten.summe)}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                {daten.plaetze.length} <T>bezahlte Plätze</T> · {geld(daten.summeProSpieler)}{' '}
                <T>je Spielerseite</T>
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                <T>Quelle: Epics Auszahlungstabelle der Global Championship. Die Beträge gelten je Spieler; ein Duo erhält das Doppelte.</T>
              </p>
            </div>
          </section>

          {/* ----------------------------------------------- Das Podest */}
          <section className="grid gap-3 md:grid-cols-3">
            {daten.plaetze.slice(0, 3).map((p, i) => (
              <div key={p.platz}
                className={`relative overflow-hidden rounded-2xl bg-zinc-950 p-5 ring-1 ${PODEST[i].ring}`}>
                <div aria-hidden className={`absolute inset-0 bg-gradient-to-b ${PODEST[i].schein} to-transparent`} />
                <div className="relative">
                  <p className="text-sm font-black uppercase tracking-widest text-slate-400">
                    {ordnung(p.platz)}
                  </p>
                  <p className={`mt-2 text-4xl font-black tabular-nums ${PODEST[i].zahl}`}>
                    {geld(p.proTeam)}
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    <T>pro Team</T> · {geld(p.proSpieler)} <T>pro Spieler</T>
                  </p>
                </div>
              </div>
            ))}
          </section>

          {/* ------------------------------------------ Alle weiteren Plaetze */}
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {daten.plaetze.slice(3).map((p) => (
              <div key={p.platz}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40
                           px-4 py-3 transition hover:border-amber-500/40">
                <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-zinc-950
                                 text-sm font-black tabular-nums text-amber-200/90">
                  {ordnung(p.platz)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold tabular-nums text-slate-100">
                    {geld(p.proTeam)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {geld(p.proSpieler)} <T>pro Spieler</T>
                  </span>
                </span>
                {p.spanne[0] !== p.spanne[1] && (
                  <span title={`${p.spanne[0]}–${p.spanne[1]}`}
                    className="shrink-0 rounded-md border border-zinc-700 px-2 py-0.5 text-[10px]
                               font-semibold tabular-nums text-slate-400">
                    {p.spanne[0]}–{p.spanne[1]}
                  </span>
                )}
              </div>
            ))}
          </section>
        </div>
      )}
    </GlobalsGeruest>
  );
}
