'use client';

/*
 * Grand-Finals-Rekorde (16.11.2026): die besten Teamergebnisse aus einem einzigen Finale - Punkte, Victory Royales, Eliminierungen.
 *
 * Vorher standen hier drei gleich gebaute Karten nebeneinander ("Most points in a single Grand Finals" ...), fast wie auf einer
 * anderen Statistik-Seite. Jetzt ein eigener Abschnitt: oben ein Umschalter fuer die Wertung, darunter ein Treppchen fuer die
 * ersten drei (Platz 2 links, 1 in der Mitte und am hoechsten, 3 rechts) und die Plaetze ab 4 als knappe Tabelle.
 *
 * Die Zahlen sind unveraendert die aus lib/fncsEreignisse (fncsRekorde): Epics Turnier-Bestenlisten, beide Tage eines Finales
 * zusammen. Die Eliminierungen sind Epics Team-Wert, nach dem auch die Elim-Punkte vergeben wurden (geprueft 16.11.2026: Elim-Punkte
 * = 4 x Elims). Die Flaggen kommen aus unseren Profildaten (spielerKontext / Spielerliste), nie von Hand.
 */

import { useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';
import type { FncsRekorde, RekordZeile } from '@/lib/fncsEreignisse';

type Wertung = 'punkte' | 'siege' | 'elims';

const WERTUNGEN: Array<{ k: Wertung; lang: string; kurz: string; spalte: string; einheit: string }> = [
  { k: 'punkte', lang: 'Punkte', kurz: 'Punkte', spalte: 'PTS', einheit: 'Punkte' },
  { k: 'siege', lang: 'Victory Royales', kurz: 'VRs', spalte: 'VR', einheit: 'Victory Royales' },
  { k: 'elims', lang: 'Eliminierungen', kurz: 'Elims', spalte: 'Elims', einheit: 'Eliminierungen' },
];

/** "CH6 S3 Grand Finals" -> "Ch. 6 S3" (EU-Finale), "2024 Global Championship" -> "Globals 2024". */
export function finaleKurz(event: string): { kurz: string; art: string } {
  const gf = /^CH(\d+) S(\w+) Grand Finals$/i.exec(event);
  if (gf) return { kurz: `Ch. ${gf[1]} S${gf[2]}`, art: 'EU-Finale' };
  const gc = /^(\d{4}) Global Championship$/.exec(event);
  if (gc) return { kurz: `Globals ${gc[1]}`, art: 'Weltfinale' };
  return { kurz: event, art: '' };
}

/** Das Treppchen: Reihenfolge 2 - 1 - 3, Hoehe nach Platz. */
const SOCKEL = [
  { platz: 1, hoehe: 'h-24 sm:h-36', rand: 'border-sky-400/70', flaeche: 'from-sky-500/35 to-sky-500/[0.04]', zahl: 'text-sky-200' },
  { platz: 2, hoehe: 'h-16 sm:h-24', rand: 'border-sky-300/35', flaeche: 'from-sky-400/20 to-sky-400/[0.03]', zahl: 'text-sky-200/70' },
  { platz: 3, hoehe: 'h-11 sm:h-16', rand: 'border-sky-700/60', flaeche: 'from-sky-700/30 to-sky-700/[0.04]', zahl: 'text-sky-300/55' },
];

function Treppchen({ z, platz, einheit, ort }: { z: RekordZeile; platz: number; einheit: string; ort: string }) {
  const t = useT();
  const s = SOCKEL[platz - 1];
  const f = finaleKurz(z.event);
  return (
    <li className="flex min-w-0 flex-col items-center text-center" aria-label={t('Platz {n}').replace('{n}', String(platz))}>
      <TeamFlagge groesse={platz === 1 ? 40 : 34} laender={z.spieler.map((x) => x.land)} />
      <span className="mt-2 w-full space-y-0.5">
        {z.spieler.map((x) => (
          <span key={x.name} className="block truncate text-[11px] font-bold uppercase tracking-wide text-slate-100 sm:text-[13px]">{x.name}</span>
        ))}
      </span>
      <span className={`mt-2 font-black tabular-nums leading-none text-sky-300 ${platz === 1 ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'}`}>{z.wert.toLocaleString(ort)}</span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"><T>{einheit}</T></span>
      <span className="mt-1.5 text-[11px] text-slate-400">
        {f.kurz}{f.art && <span className="hidden sm:inline"> · <T>{f.art}</T></span>}
      </span>
      <span className={`mt-3 flex w-full items-start justify-center rounded-t-xl border-x border-t bg-gradient-to-b pt-2 ${s.hoehe} ${s.rand} ${s.flaeche}`}>
        <span className={`text-3xl font-black leading-none sm:text-5xl ${s.zahl}`}>{platz}</span>
      </span>
    </li>
  );
}

export default function GfRekorde({ rekorde, ort }: { rekorde: FncsRekorde; ort: string }) {
  const t = useT();
  const [wertung, setWertung] = useState<Wertung>('punkte');
  const w = WERTUNGEN.find((x) => x.k === wertung) ?? WERTUNGEN[0];
  const zeilen = rekorde[wertung] ?? [];
  const finals = rekorde.finals ?? [];

  return (
    <section className="mb-10 rounded-2xl border border-white/[0.08] bg-zinc-900 p-4 sm:p-6" aria-labelledby="gf-rekorde">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sky-400"><T>FNCS · Teamrekorde</T></p>
          <h2 id="gf-rekorde" className="mt-1 text-2xl font-black tracking-tight text-slate-50 sm:text-3xl"><T>Grand-Finals-Rekorde</T></h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400"><T>Die stärksten Teamergebnisse aus einem einzigen Finale – beide Tage zusammengezählt.</T></p>
        </div>
        <div role="tablist" aria-label={t('Wertung')} className="grid w-full grid-cols-3 gap-1 rounded-xl border border-white/[0.08] bg-zinc-950 p-1 sm:w-auto">
          {WERTUNGEN.map((x) => (
            <button key={x.k} type="button" role="tab" aria-selected={wertung === x.k} onClick={() => setWertung(x.k)}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.1em] transition sm:px-4 ${wertung === x.k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}>
              <span className="sm:hidden"><T>{x.kurz}</T></span><span className="hidden sm:inline"><T>{x.lang}</T></span>
            </button>
          ))}
        </div>
      </div>

      {zeilen.length > 0 && (
        <div className="mx-auto mt-8 max-w-4xl">
          <ol className="grid grid-cols-3 items-end gap-2 sm:gap-5">
            {[1, 0, 2].filter((i) => zeilen[i]).map((i) => (
              <Treppchen key={`${wertung}-${i}`} z={zeilen[i]} platz={i + 1} einheit={w.einheit} ort={ort} />
            ))}
          </ol>

          {zeilen.length > 3 && (
            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08] text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-9 py-2 pl-3">#</th>
                    <th className="py-2 pl-2">Team</th>
                    <th className="w-[5.5rem] py-2 pl-2 sm:w-52">Event</th>
                    <th className="w-16 py-2 pr-3 text-right sm:w-20">{w.spalte}</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.slice(3).map((z, i) => {
                    const f = finaleKurz(z.event);
                    return (
                      <tr key={`${wertung}-${z.event}-${i}`} className="border-b border-white/[0.04] last:border-b-0">
                        <td className="py-2 pl-3 text-[11px] font-black tabular-nums text-slate-500">{i + 4}</td>
                        <td className="py-2 pl-2">
                          <span className="flex items-center gap-2">
                            <TeamFlagge groesse={z.spieler.length > 1 ? 22 : 16} laender={z.spieler.map((x) => x.land)} />
                            <span className="min-w-0 text-[12px] font-bold uppercase leading-snug text-slate-100 [overflow-wrap:anywhere]">{z.spieler.map((x) => x.name).join(' · ')}</span>
                          </span>
                        </td>
                        <td className="py-2 pl-2 text-[12px] text-slate-300">
                          {f.kurz}{f.art && <span className="hidden text-slate-500 sm:inline"> · <T>{f.art}</T></span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-black tabular-nums text-sky-300">{z.wert.toLocaleString(ort)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-slate-500">
        {finals.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-semibold uppercase tracking-[0.14em] text-slate-400">{t('{n} Finals gezählt').replace('{n}', String(finals.length))}</span>
            {finals.map((e) => (
              <span key={e} className="rounded-md border border-white/[0.08] bg-zinc-950 px-1.5 py-0.5 text-slate-300">{finaleKurz(e).kurz}</span>
            ))}
          </p>
        )}
        <p className="mt-2"><T>Nur diese Finals sind eingerechnet, alle anderen nicht. Bei Gleichstand entscheiden die beiden anderen Werte. Quelle: Epics offizielle Turnier-Bestenlisten.</T></p>
      </div>
    </section>
  );
}
