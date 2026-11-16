'use client';

/*
 * Kopf der Seite /replays (Betreiber, 15.11.2026): "Replay oeffnen" / "Cups" und der neueste Cup mit seinen Games.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { replayDatum, replayUhrzeit, schoenerTitel, tagName, ohneMarke } from '@/lib/replayNamen';
import LadenDialog from './LadenDialog';

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
  const href = neuester ? `/replays/${encodeURIComponent(neuester.d.windowId)}` : '/replays';

  return (
    <section className="relative mt-6 overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-500/15 via-zinc-900 to-zinc-950 p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300"><T>Replay analyzer</T></p>
      <h2 className="mt-2 text-2xl font-black leading-tight text-slate-50 sm:text-3xl"><T>Every game, every player, every zone.</T></h2>
      <p className="mt-2 max-w-md text-[13px] leading-relaxed text-slate-400"><T>Watch any analysed cup game on the map, follow a player from the bus to the end, and see who held the high ground in every zone.</T></p>
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
          </div>
          {games.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {games.map((g) => <Link key={g.id} href={`${href}/${g.nr}`} title={replayUhrzeit(g.beginn)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold text-slate-300 hover:border-sky-500 hover:text-sky-200">Game {g.nr}</Link>)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
