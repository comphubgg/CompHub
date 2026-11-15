'use client';

/*
 * "Replay laden" (Betreiber, 15.11.2026): Season-Reiter, Region, Sortierung nach Datum oder Name, die Cups mit ihren Tagen und Games -
 * ein Game waehlen und "Analysieren" oeffnet /replays/<Tag>/<Game>. Daten: /api/replay?uebersicht=1 und ?tag=.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { replayDatum, replayUhrzeit, schoenerTitel, tagName, ohneMarke } from '@/lib/replayNamen';

interface TagKurz { windowId: string; region: string; beginn: string; games: number; sieger: string[] }
interface CupKurz { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: TagKurz[] }
interface Game { id: string; nr: number; beginn?: string; sieger?: string[]; spieler?: number }

export default function LadenDialog({ offen, schliessen, aktuell }: { offen: boolean; schliessen: () => void; aktuell?: string }) {
  const t = useT();
  const router = useRouter();
  const [cups, setCups] = useState<CupKurz[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [season, setSeason] = useState<string>('');
  const [region, setRegion] = useState('alle');
  const [sort, setSort] = useState<'datum' | 'name'>('datum');
  const [suche, setSuche] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [games, setGames] = useState<Game[] | null>(null);
  const [wahl, setWahl] = useState<number | null>(null);

  useEffect(() => {
    if (!offen || cups) return undefined;
    let weg = false;
    fetch('/api/replay?uebersicht=1').then((r) => r.json())
      .then((j) => { if (weg) return; if (Array.isArray(j?.cups)) { setCups(j.cups); setSeason((j.cups[0] as CupKurz | undefined)?.season ?? ''); } else setFehler(true); })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [offen, cups]);

  useEffect(() => {
    if (!tag) { setGames(null); return undefined; }
    let weg = false;
    setGames(null); setWahl(null);
    fetch(`/api/replay?tag=${encodeURIComponent(tag)}`).then((r) => r.json())
      .then((j) => { if (!weg) setGames(Array.isArray(j?.tag?.matches) ? j.tag.matches : []); })
      .catch(() => { if (!weg) setGames([]); });
    return () => { weg = true; };
  }, [tag]);

  useEffect(() => {
    if (!offen) return undefined;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [offen, schliessen]);

  const seasons = useMemo(() => [...new Set((cups ?? []).map((c) => c.season))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })), [cups]);
  const regionen = useMemo(() => [...new Set((cups ?? []).flatMap((c) => c.tage.map((d) => d.region)))].sort(), [cups]);
  const liste = useMemo(() => {
    const q = suche.trim().toLowerCase();
    const l = (cups ?? []).filter((c) => !season || c.season === season)
      .map((c) => ({ ...c, tage: c.tage.filter((d) => region === 'alle' || d.region === region) }))
      .filter((c) => c.tage.length && (!q || schoenerTitel(c.titel).toLowerCase().includes(q)));
    return sort === 'name' ? l.sort((a, b) => schoenerTitel(a.titel).localeCompare(schoenerTitel(b.titel))) : l.sort((a, b) => b.beginn.localeCompare(a.beginn));
  }, [cups, season, region, sort, suche]);

  if (!offen) return null;
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`;
  const game = games?.find((g) => g.nr === wahl);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onClick={schliessen} role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h2 className="text-lg font-black text-slate-50"><T>Load replay</T></h2>
          <button type="button" onClick={schliessen} className="rounded-md px-2 text-xl leading-none text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
        </div>
        <div className="space-y-2 border-b border-white/[0.08] px-4 py-3">
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
            {seasons.map((s) => <button key={s} type="button" onClick={() => setSeason(s)} className={chip(season === s)}>{s}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Search cup …')}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-slate-100">
              <option value="alle">{t('All regions')}</option>
              {regionen.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'datum' | 'name')} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-slate-100">
              <option value="datum">{t('Newest first')}</option>
              <option value="name">{t('Name A–Z')}</option>
            </select>
          </div>
        </div>
        <div className="grid min-h-0 flex-1 overflow-hidden sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <ul className="max-h-[50vh] overflow-y-auto border-b border-white/[0.08] p-2 sm:max-h-none sm:border-b-0 sm:border-r">
            {fehler && <li className="p-3 text-sm text-rose-300"><T>The replays could not be loaded right now.</T></li>}
            {!cups && !fehler && <li className="p-3 text-sm text-slate-500"><T>Loading …</T></li>}
            {cups && !liste.length && <li className="p-3 text-sm text-slate-500"><T>No replays in this selection.</T></li>}
            {liste.map((c) => (
              <li key={c.eventId} className="mb-2">
                <p className="px-1 text-[12px] font-bold text-slate-100">{schoenerTitel(c.titel)} <span className="font-normal text-slate-500">· {replayDatum(c.beginn)}</span></p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {c.tage.map((d, i) => (
                    <button key={d.windowId} type="button" onClick={() => setTag(d.windowId)}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${tag === d.windowId ? 'border-sky-500 bg-sky-500/15 text-sky-200' : 'border-white/10 text-slate-300 hover:border-sky-500/50'}`}>
                      <span className="mr-1 rounded bg-white/10 px-1 text-[9px] font-black">{d.region}</span>{tagName(d.windowId, i)} · {d.games}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex min-h-0 flex-col p-2">
            {!tag && <p className="p-3 text-sm text-slate-500"><T>Pick a cup day on the left.</T></p>}
            {tag && !games && <p className="p-3 text-sm text-slate-500"><T>Loading …</T></p>}
            {games && (
              <ul className="grid max-h-[40vh] grid-cols-2 gap-1.5 overflow-y-auto sm:max-h-[48vh]">
                {games.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => setWahl(g.nr)} onDoubleClick={() => router.push(`/replays/${encodeURIComponent(tag!)}/${g.nr}`)}
                      className={`w-full rounded-lg border p-2 text-left transition ${wahl === g.nr ? 'border-sky-500 bg-sky-500/15' : 'border-white/10 hover:border-sky-500/50'} ${aktuell === g.id ? 'ring-1 ring-amber-400/60' : ''}`}>
                      <span className="flex justify-between text-[13px] font-black text-slate-50">Game {g.nr}<span className="text-[10px] font-normal text-slate-500">{replayUhrzeit(g.beginn)}</span></span>
                      <span className="block truncate text-[10px] uppercase text-amber-300/90">{(g.sieger ?? []).map(ohneMarke).join(' · ') || '–'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" disabled={!game} onClick={() => { if (game && tag) { router.push(`/replays/${encodeURIComponent(tag)}/${game.nr}`); schliessen(); } }}
              className="mt-auto w-full rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40">
              <T>Analyze</T>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
