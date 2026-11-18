'use client';

import { useMemo } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { Karte } from '@/app/globals-solos/Bausteine';
import { kartenName } from '@/app/lib/kartenStil';
import type { SolosFenster } from '@/lib/globalsSolos';
import type { DropKarte } from '@/lib/dropKarte';

/*
 * Die Drop-Karte eines Spieltags mit einer einzigen Lobby aus den eigenen Replays (lib/dropKarte, Betreiber 18.11.2026) - gezeichnet von demselben Baustein
 * wie jede Turnierkarte (Formen, Namen in der Mitte, Ausweichen bei Ueberdeckung, rot ab zwei Teams), rechts die Spielerliste. Die Formen sind
 * immer unsere (lib/dropFormen: Rechteck oder ein sauberes L); die Stellen kommen aus den echten Landungen, sonst von Noble Practice, sonst aus der Prognose.
 * Vor dem Spieltag ist es eine Prognose aus den letzten Matches jedes Teams auf derselben Insel; sobald Spiele gelesen sind, stehen dort die echten Landungen.
 */
export default function DropKarteImEvent({ d }: { d: DropKarte }) {
  const t = useT();
  const fenster = useMemo<SolosFenster>(() => ({
    windowId: `drop:${d.windowId}`, name: d.titel, art: 'finale', start: null, end: null, spieler: [], formen: d.formen,
  }), [d]);
  const rotAb = 2;
  const zeilen = useMemo(() => [...d.teams]
    .map((tm) => ({ ...tm, zeile: tm.namen.map(kartenName).join(' · ') }))
    .sort((a, b) => Number(a.form === null) - Number(b.form === null) || a.zeile.localeCompare(b.zeile)), [d]);
  // Die Quelle der Stellen steht auf der Karte (Betreiber, 18.11.2026): echte Landungen ab Spiel 1, sonst Noble Practice, sonst die Prognose -
  // die Prognose deutlich als solche, im Finale wechseln Spieler manchmal den Drop.
  const zahl = (art: string) => d.teams.filter((x) => x.art === art).length;
  const echt = zahl('echt'), noble = zahl('noble'), prognose = zahl('prognose');
  const quellen: Array<{ text: string; farbe: string }> = [];
  if (echt) quellen.push({ text: `${t('Echte Landungen')} (${d.spiele} ${d.spiele === 1 ? t('Spiel') : t('Spiele')})`, farbe: 'bg-emerald-400/15 text-emerald-300' });
  if (noble) quellen.push({ text: t('Stellen: Noble Practice'), farbe: 'bg-sky-400/15 text-sky-300' });
  if (prognose) quellen.push({ text: t('Prognose aus den letzten Matches'), farbe: 'bg-amber-400/15 text-amber-300' });
  const hinweis = d.spiele === 0 ? t('Nach Spiel 1 ersetzt durch die echten Landungen') : '';
  return (
    <section className="mb-5 max-w-[1180px]">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <T>Drop-Karte</T>
          {quellen.map((q) => (
            <span key={q.text} className={`ml-2 rounded-md px-2 py-0.5 normal-case tracking-normal ${q.farbe}`}>{q.text}</span>
          ))}
          {hinweis && <span className="ml-2 normal-case tracking-normal text-slate-400">· {hinweis}</span>}
        </h2>
        <span className="text-[11px] font-semibold text-slate-400"><T>nur Admins</T></span>
      </div>
      <div className="mt-2 grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="overflow-hidden rounded-2xl">
          <Karte f={fenster} bild={d.bild} rotAb={rotAb} />
        </div>
        <aside className="relative min-h-[320px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70">
          <div className="absolute inset-0 flex flex-col">
            <p className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <T>Spieler</T><span className="tabular-nums text-slate-300">{d.teams.reduce((a, x) => a + x.ids.length, 0)}</span>
            </p>
            <ul className="flex-1 overflow-y-auto py-1">
              {zeilen.map((z) => (
                <li key={z.ids.join('|')} title={z.form === null ? t('Keine Landung bekannt')
                  : z.art === 'noble' ? t('Stellen: Noble Practice')
                    : `${z.art === 'echt' ? t('Gelandet') : t('Prognose')}: ${z.treffer}/${z.matches} ${t('Matches an dieser Stelle')}`}
                  className={`flex items-center justify-between gap-2 px-4 py-1.5 text-[12px] font-bold tracking-wide odd:bg-white/[0.025] ${z.form === null ? 'text-slate-500' : 'text-slate-100'}`}>
                  <span className="truncate">{z.zeile}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tabular-nums text-slate-500">
                    {z.umkaempft && <span className="h-2 w-2 rounded-full bg-red-500" aria-label={t('umkämpft')} />}
                    {z.form !== null && z.art !== 'noble' && <span>{z.treffer}/{z.matches}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
