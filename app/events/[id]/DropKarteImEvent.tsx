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
 * wie jede Turnierkarte (Formen, Namen in der Mitte, Ausweichen bei Ueberdeckung, rot ab zwei Teams), rechts die Spielerliste. Quelle: nur CompHub.
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
  const echt = d.teams.filter((x) => x.art === 'echt').length;
  const hinweis = d.spiele > 0
    ? `${t('Echte Landungen aus')} ${d.spiele} ${d.spiele === 1 ? t('Spiel') : t('Spielen')} ${t('dieses Spieltags')}${echt < d.teams.length ? ` · ${t('Rest: Prognose')}` : ''}`
    : t('Prognose aus den letzten Matches jedes Spielers auf dieser Insel');
  return (
    <section className="mb-5 max-w-[1180px]">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-5 py-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <T>Drop-Karte</T> · <span className="normal-case tracking-normal text-slate-300">{hinweis}</span>
        </h2>
        <span className="text-[11px] font-semibold text-slate-400"><T>Quelle</T>: CompHub</span>
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
                  : `${z.art === 'echt' ? t('Gelandet') : t('Prognose')}: ${z.treffer}/${z.matches} ${t('Matches an dieser Stelle')}`}
                  className={`flex items-center justify-between gap-2 px-4 py-1.5 text-[12px] font-bold tracking-wide odd:bg-white/[0.025] ${z.form === null ? 'text-slate-500' : 'text-slate-100'}`}>
                  <span className="truncate">{z.zeile}</span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold tabular-nums text-slate-500">
                    {z.umkaempft && <span className="h-2 w-2 rounded-full bg-red-500" aria-label={t('umkämpft')} />}
                    {z.form !== null && <span>{z.treffer}/{z.matches}</span>}
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
