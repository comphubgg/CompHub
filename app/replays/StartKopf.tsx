'use client';

/*
 * Kopf der Seite /replays (Betreiber, 15.11.2026): "Replay oeffnen" / "Cups", der neueste Cup mit seinen Games (ansehen, alle analysieren) und
 * Highlights: bestes und schlechtestes Zonen-Glueck des neuesten Cup-Tags (/api/replay-auswertung).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { replayDatum, replayUhrzeit, schoenerTitel, tagName, ohneMarke } from '@/lib/replayNamen';
import LadenDialog from './LadenDialog';
import { useAuswertung, zusammen } from './TagesAuswertung';
import { glueckWort, FORMEL_GLUECK } from './analyse';
import { Flagge } from './Werkzeuge';
import { Info } from './Analysen';

interface TagKurz { windowId: string; region: string; beginn: string; games: number; sieger: string[] }
interface CupKurz { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: TagKurz[] }
interface Game { id: string; nr: number; beginn?: string; sieger?: string[] }

export default function StartKopf({ cups }: { cups: CupKurz[] | null }) {
  const [laden, setLaden] = useState(false);
  // Der neueste Cup-Tag - EU bevorzugt, sonst der neueste ueberhaupt.
  const neuester = useMemo(() => {
    const alle = (cups ?? []).flatMap((c) => c.tage.map((d, i) => ({ c, d, i })));
    const eu = alle.filter((x) => x.d.region === 'EU').sort((a, b) => b.d.beginn.localeCompare(a.d.beginn))[0];
    return eu ?? alle.sort((a, b) => b.d.beginn.localeCompare(a.d.beginn))[0] ?? null;
  }, [cups]);
  const [games, setGames] = useState<Game[]>([]);
  useEffect(() => {
    if (!neuester) return undefined;
    let weg = false;
    fetch(`/api/replay?tag=${encodeURIComponent(neuester.d.windowId)}`).then((r) => r.json()).then((j) => { if (!weg && Array.isArray(j?.tag?.matches)) setGames(j.tag.matches); }).catch(() => {});
    return () => { weg = true; };
  }, [neuester]);
  const { d: auswertung } = useAuswertung(neuester ? [neuester.d.windowId] : []);
  const glueck = useMemo(() => (auswertung?.spieler ?? []).filter((s) => s.games.length >= 2).map((s) => ({ s, z: zusammen(s) }))
    .map((x) => ({ ...x, jeGame: x.z.glueck / x.s.games.length })).sort((a, b) => b.jeGame - a.jeGame), [auswertung]);
  const href = neuester ? `/replays/${encodeURIComponent(neuester.d.windowId)}` : '/replays';

  const karte = (x: (typeof glueck)[number], gut: boolean) => (
    <li key={x.s.epic} className="flex items-center gap-2 border-b border-white/[0.05] py-1.5 text-[12px] last:border-0">
      <Flagge land={x.s.land} klein />
      <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{x.s.name}</span>
      <span className="hidden shrink-0 text-[10px] text-slate-500 sm:inline">{x.z.abstand !== null ? `Ø ${x.z.abstand.toFixed(2)} r` : ''} · <T>inside</T> {x.z.drin}/{x.z.zonen}</span>
      <span className={`shrink-0 rounded px-1.5 py-px text-[9px] font-black uppercase tracking-wider ${gut ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}><T>{glueckWort(x.jeGame)}</T></span>
      <span className={`w-10 shrink-0 text-right font-bold tabular-nums ${x.jeGame >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{x.jeGame >= 0 ? '+' : ''}{x.jeGame.toFixed(0)}</span>
    </li>
  );

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-500/15 via-zinc-900 to-zinc-950 p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300"><T>Replay analyzer</T></p>
        <h2 className="mt-2 text-2xl font-black leading-tight text-slate-50 sm:text-3xl"><T>Every game, every player, every zone.</T></h2>
        <p className="mt-2 max-w-md text-[13px] leading-relaxed text-slate-400"><T>Watch any analysed cup game on the map, follow a player from the bus to the end, and see who had the zones on their side.</T></p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setLaden(true)} className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400"><T>Open replay</T></button>
          <a href="#cups" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-500/60"><T>Tournaments</T></a>
          <Link href="/replays/anleitung" className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-sky-500/60"><T>Guide</T></Link>
        </div>
        <LadenDialog offen={laden} schliessen={() => setLaden(false)} />
        {neuester && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <p className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[14px] font-bold text-slate-50">{schoenerTitel(neuester.c.titel)} · {tagName(neuester.d.windowId, neuester.i)}</span>
              <span className="shrink-0 text-[11px] text-slate-500">{neuester.d.region} · {replayDatum(neuester.d.beginn)}</span>
            </p>
            <p className="mt-0.5 truncate text-[11px] uppercase text-amber-300/90">{neuester.d.sieger.map(ohneMarke).join(' · ')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`${href}/1`} className="rounded-lg bg-sky-500 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-sky-400"><T>Watch game 1</T></Link>
              <Link href={`${href}#auswertung`} className="rounded-lg border border-white/15 px-3 py-1.5 text-[12px] font-semibold text-slate-200 hover:border-sky-500/60"><T>Analyze all games</T></Link>
            </div>
            {games.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {games.map((g) => <Link key={g.id} href={`${href}/${g.nr}`} title={replayUhrzeit(g.beginn)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-sky-500 hover:text-sky-200">Game {g.nr}</Link>)}
              </div>
            )}
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-white/[0.08] bg-zinc-900/60 p-5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400"><T>Highlights of the latest cup day</T> <Info text={FORMEL_GLUECK} /></p>
        {!auswertung && <p className="mt-4 text-[12px] text-slate-500"><T>Analysing all games …</T></p>}
        {auswertung && glueck.length > 0 && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div>
              <p className="mb-1 text-[12px] font-bold text-emerald-300"><T>Best zone luck</T> <span className="font-normal text-slate-500">(<T>per game</T>)</span></p>
              <ul>{glueck.slice(0, 5).map((x) => karte(x, true))}</ul>
            </div>
            <div>
              <p className="mb-1 text-[12px] font-bold text-rose-300"><T>Worst zone luck</T> <span className="font-normal text-slate-500">(<T>per game</T>)</span></p>
              <ul>{glueck.slice(-5).reverse().map((x) => karte(x, false))}</ul>
            </div>
          </div>
        )}
        {auswertung && !glueck.length && <p className="mt-4 text-[12px] text-slate-500"><T>These replays carry no player positions.</T></p>}
        <p className="mt-3 text-[10px] text-slate-500"><T>Ø r = average distance to the edge of the next zone, in radii of the current zone. Inside = how often the player already stood inside the next zone when it appeared.</T></p>
      </section>
    </div>
  );
}
