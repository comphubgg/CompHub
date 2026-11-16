'use client';

/*
 * "Replay laden" (Betreiber, 15.11.2026): Season-Reiter, Region (nur Regionen mit Replays), Sortierung nach Datum oder Name. Je Cup-Tag eine Zeile mit
 * "Games" (die Games klappen auf und laden sofort). Daten: /api/replay?uebersicht=1 und ?tag=.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { replayDatum, replayUhrzeit, schoenerTitel, tagName, ohneMarke } from '@/lib/replayNamen';

interface TagKurz { windowId: string; region: string; beginn: string; games: number; sieger: string[] }
interface CupKurz { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: TagKurz[] }
interface Game { id: string; nr: number; beginn?: string; sieger?: string[]; spieler?: number }
interface Zeile { cup: CupKurz; tag: TagKurz; name: string }

export default function LadenDialog({ offen, schliessen, aktuell }: { offen: boolean; schliessen: () => void; aktuell?: string }) {
  const t = useT();
  const router = useRouter();
  const [cups, setCups] = useState<CupKurz[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [season, setSeason] = useState<string>('');
  const [region, setRegion] = useState('alle');
  const [sort, setSort] = useState<'datum' | 'name'>('datum');
  const [suche, setSuche] = useState('');
  const [offenerTag, setOffenerTag] = useState<string | null>(null);
  const [games, setGames] = useState<Record<string, Game[]>>({});

  useEffect(() => {
    if (!offen || cups) return undefined;
    let weg = false;
    fetch('/api/replay?uebersicht=1').then((r) => r.json())
      .then((j) => { if (weg) return; if (Array.isArray(j?.cups)) { setCups(j.cups); setSeason((j.cups[0] as CupKurz | undefined)?.season ?? ''); } else setFehler(true); })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [offen, cups]);

  useEffect(() => {
    if (!offenerTag || games[offenerTag]) return undefined;
    let weg = false;
    fetch(`/api/replay?tag=${encodeURIComponent(offenerTag)}`).then((r) => r.json())
      .then((j) => { if (!weg) setGames((g) => ({ ...g, [offenerTag]: Array.isArray(j?.tag?.matches) ? j.tag.matches : [] })); })
      .catch(() => { if (!weg) setGames((g) => ({ ...g, [offenerTag]: [] })); });
    return () => { weg = true; };
  }, [offenerTag, games]);

  useEffect(() => {
    if (!offen) return undefined;
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') schliessen(); };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [offen, schliessen]);

  const seasons = useMemo(() => [...new Set((cups ?? []).map((c) => c.season))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true })), [cups]);
  // Nur Regionen, die in dieser Season Replays haben.
  const regionen = useMemo(() => [...new Set((cups ?? []).filter((c) => !season || c.season === season).flatMap((c) => c.tage.map((d) => d.region)))].sort(), [cups, season]);
  const zeilen = useMemo<Zeile[]>(() => {
    const q = suche.trim().toLowerCase();
    const l: Zeile[] = [];
    for (const c of cups ?? []) {
      if (season && c.season !== season) continue;
      if (q && !schoenerTitel(c.titel).toLowerCase().includes(q)) continue;
      c.tage.forEach((d, i) => { if (region === 'alle' || d.region === region) l.push({ cup: c, tag: d, name: `${schoenerTitel(c.titel)} · ${tagName(d.windowId, i)}` }); });
    }
    return sort === 'name' ? l.sort((a, b) => a.name.localeCompare(b.name) || a.tag.region.localeCompare(b.tag.region)) : l.sort((a, b) => b.tag.beginn.localeCompare(a.tag.beginn));
  }, [cups, season, region, sort, suche]);

  if (!offen) return null;
  const chip = (an: boolean) => `rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`;
  const geh = (href: string) => { router.push(href); schliessen(); };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onClick={schliessen} role="dialog" aria-modal="true" aria-label={t('Load replay')}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
          <h2 className="text-lg font-black text-slate-50"><T>Load replay</T></h2>
          <button type="button" onClick={schliessen} className="rounded-md px-2 text-xl leading-none text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close">×</button>
        </div>
        <div className="space-y-2 border-b border-white/[0.08] px-4 py-3">
          <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
            {seasons.map((s) => <button key={s} type="button" onClick={() => { setSeason(s); setRegion('alle'); }} className={chip(season === s)}>{s}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Search cup …')}
              className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[12px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
            <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-slate-100" aria-label={t('Region')}>
              <option value="alle">{t('All regions')}</option>
              {regionen.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'datum' | 'name')} className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[12px] text-slate-100" aria-label={t('Sort')}>
              <option value="datum">{t('Newest first')}</option>
              <option value="name">{t('Name A–Z')}</option>
            </select>
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto p-2">
          {fehler && <li className="p-3 text-sm text-rose-300"><T>The replays could not be loaded right now.</T></li>}
          {!cups && !fehler && <li className="p-3 text-sm text-slate-500"><T>Loading …</T></li>}
          {cups && !zeilen.length && <li className="p-3 text-sm text-slate-500"><T>No replays in this selection.</T></li>}
          {zeilen.map(({ tag: d, name }) => {
            const w = d.windowId; const auf = offenerTag === w;
            return (
              <li key={w} className="mb-1 rounded-xl border border-white/[0.06] transition">
                <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
                  <span className="rounded bg-white/10 px-1.5 py-px text-[9px] font-black text-slate-200">{d.region}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-bold text-slate-100">{name}</span>
                    <span className="block truncate text-[10px] text-slate-500">{replayDatum(d.beginn)} · {d.games} Games{d.sieger.length ? ` · ${d.sieger.map(ohneMarke).join(' · ')}` : ''}</span>
                  </span>
                  <button type="button" onClick={() => setOffenerTag(auf ? null : w)} aria-expanded={auf}
                    className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-sky-500/60">Games {auf ? '▴' : '▾'}</button>
                </div>
                {auf && (
                  <div className="flex flex-wrap gap-1 border-t border-white/[0.06] px-2.5 py-2">
                    {!games[w] && <span className="text-[11px] text-slate-500"><T>Loading …</T></span>}
                    {(games[w] ?? []).map((g) => (
                      <button key={g.id} type="button" onClick={() => geh(`/replays/${encodeURIComponent(w)}/${g.nr}`)}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition hover:border-sky-500 ${aktuell === g.id ? 'border-amber-400/70 text-amber-200' : 'border-white/10 text-slate-200'}`}
                        title={`${replayUhrzeit(g.beginn)} · ${(g.sieger ?? []).map(ohneMarke).join(' · ')}`}>Game {g.nr}</button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
