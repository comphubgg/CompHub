'use client';

import { useEffect, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';

/*
 * Das Preisgeld der FNCS Solos - jeder bezahlte Platz mit seinem Betrag (Betreiber, 26.10.2026: "die Prize-Pool-Seite sollte auch fuer Solo-FNCS drin sein",
 * und im November kommt FNCS Solos Reload dazu). Die Zahlen liefert /api/solos-preisgeld aus Epics Auszahlungstabellen; bei Solos ist ein Platz ein Spieler.
 * Gleiche Gestalt wie die Seite der Globals (/globals/prizepool).
 */

interface Platz { platz: number; proSpieler: number; proTeam: number; spanne: [number, number] }
interface Gruppe { id: string; name: string; waehrung: string; plaetze: Platz[]; summe: number }
interface Antwort { ok: boolean; region?: string; gruppen?: Gruppe[]; error?: string }

const PODEST = [
  { ring: 'ring-sky-300/70', schein: 'from-sky-400/25', zahl: 'text-sky-200' },
  { ring: 'ring-slate-300/50', schein: 'from-slate-300/15', zahl: 'text-slate-100' },
  { ring: 'ring-orange-400/50', schein: 'from-orange-500/15', zahl: 'text-orange-200' },
];

export default function Preisgeld({ region }: { region: string }) {
  const { sprache } = useSprache();
  const [antwort, setAntwort] = useState<{ fuer: string; daten: Antwort } | null>(null);
  const [fehler, setFehler] = useState<{ fuer: string; text: string } | null>(null);
  const [wahl, setWahl] = useState('');

  useEffect(() => {
    let weg = false;
    fetch(`/api/solos-preisgeld?region=${encodeURIComponent(region)}`)
      .then((r) => r.json())
      .then((j: Antwort) => { if (!weg) setAntwort({ fuer: region, daten: j }); })
      .catch((e) => { if (!weg) setFehler({ fuer: region, text: (e as Error).message }); });
    return () => { weg = true; };
  }, [region]);

  const daten = antwort?.fuer === region ? antwort.daten : null;
  const fehlerText = fehler?.fuer === region ? fehler.text : daten && !daten.ok ? (daten.error ?? 'nicht ladbar') : '';
  const gruppen = daten?.ok ? (daten.gruppen ?? []) : [];
  const gruppe = gruppen.find((g) => g.id === wahl) ?? gruppen[0];

  const geld = (n: number) => new Intl.NumberFormat(sprache === 'en' ? 'en-US' : 'de-DE',
    { style: 'currency', currency: gruppe?.waehrung ?? 'USD', maximumFractionDigits: 0 }).format(n);
  const ordnung = (n: number) => (sprache === 'en'
    ? `${n}${[, 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] ?? 'th'}`
    : `${n}.`);

  if (fehlerText) {
    return (
      <p className="rounded-lg border border-sky-800 bg-sky-950/30 px-4 py-3 text-sm text-sky-300">
        <T>Epic nennt das Preisgeld gerade nicht - bitte gleich noch einmal laden.</T>
        <span className="ml-2 text-sky-300/60">({fehlerText})</span>
      </p>
    );
  }
  if (!daten) return <LadeSchirm />;
  if (!gruppe) {
    return (
      <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-5 py-8 text-center text-sm text-slate-400">
        <T>Für diese Region führt Epic gerade keine Auszahlungstabelle - sobald das Finale feststeht, steht das Preisgeld hier.</T>
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {gruppen.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {gruppen.map((g) => (
            <button key={g.id} type="button" onClick={() => setWahl(g.id)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${gruppe.id === g.id
                ? 'border-sky-500 bg-sky-500 text-white' : 'border-zinc-800 text-slate-400 hover:border-sky-500/50 hover:text-slate-100'}`}>
              {g.name}
            </button>
          ))}
        </div>
      )}

      <section className="relative overflow-hidden rounded-2xl border border-sky-500/25 bg-zinc-950 px-6 py-8 text-center">
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgba(14,165,233,0.25), transparent 70%)' }} />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300/80"><T>Preisgeld</T> · {gruppe.name}</p>
          <p className="mt-2 text-5xl font-black tracking-tight tabular-nums sm:text-6xl" style={{ color: '#ffd766' }}>{geld(gruppe.summe)}</p>
          <p className="mt-3 text-sm text-slate-400">{gruppe.plaetze.length} <T>bezahlte Plätze</T></p>
          <p className="mt-1 text-[11px] text-slate-600"><T>Quelle: Epics Auszahlungstabelle des Finales. Bei Solos zählt jeder Platz für einen Spieler.</T></p>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {gruppe.plaetze.slice(0, 3).map((p, i) => (
          <div key={p.platz} className={`relative overflow-hidden rounded-2xl bg-zinc-950 p-5 ring-1 ${PODEST[i].ring}`}>
            <div aria-hidden className={`absolute inset-0 bg-gradient-to-b ${PODEST[i].schein} to-transparent`} />
            <div className="relative">
              <p className="text-sm font-black uppercase tracking-widest text-slate-400">{ordnung(p.platz)}</p>
              <p className={`mt-2 text-4xl font-black tabular-nums ${PODEST[i].zahl}`}>{geld(p.proSpieler)}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {gruppe.plaetze.slice(3).map((p) => (
          <div key={p.platz} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-sky-500/40">
            <span className="grid h-10 w-14 shrink-0 place-items-center rounded-lg bg-zinc-950 text-sm font-black tabular-nums text-sky-200/90">{ordnung(p.platz)}</span>
            <span className="min-w-0 flex-1 text-lg font-bold tabular-nums text-slate-100">{geld(p.proSpieler)}</span>
            {p.spanne[0] !== p.spanne[1] && (
              <span title={`${p.spanne[0]}–${p.spanne[1]}`}
                className="shrink-0 rounded-md border border-zinc-700 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-400">
                {p.spanne[0]}–{p.spanne[1]}
              </span>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
