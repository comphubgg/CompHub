'use client';

/*
 * Replays - alle Cups, deren Games aus den Server-Replays ausgewertet sind. Jede Adresse hier bleibt dauerhaft gleich
 * (/replays/<Fenster>/<Game>); /live-replays/<Cup> zeigt immer den neuesten Spieltag eines Cups.
 *
 * Der Betreiber (13.10.2026): die Replay-Funktion ist die Hauptfunktion - eine eigene Seite je Cup und je Game, ueber URL.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import ReplayUmschalter from './ReplayUmschalter';
import { replayDatum as datum, tagName, ohneMarke, schoenerTitel } from '@/lib/replayNamen';

interface TagKurz { windowId: string; region: string; beginn: string; games: number; sieger: string[] }
interface CupKurz { eventId: string; kurz: string; titel: string; season: string; beginn: string; tage: TagKurz[] }

const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ME', 'ASIA', 'OCE'];

export default function ReplaysSeite() {
  const t = useT();
  const [cups, setCups] = useState<CupKurz[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [suche, setSuche] = useState('');
  const [region, setRegion] = useState('alle');

  useEffect(() => {
    let weg = false;
    fetch('/api/replay?uebersicht=1').then((r) => r.json())
      .then((j) => { if (!weg) { if (Array.isArray(j?.cups)) setCups(j.cups); else setFehler(true); } })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, []);

  const sichtbar = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return (cups ?? []).map((c) => ({ ...c, tage: c.tage.filter((d) => region === 'alle' || d.region === region) }))
      .filter((c) => c.tage.length && (!q || `${schoenerTitel(c.titel)} ${c.season} ${c.eventId}`.toLowerCase().includes(q)));
  }, [cups, suche, region]);

  const regionen = useMemo(() => REGIONEN.filter((r) => (cups ?? []).some((c) => c.tage.some((d) => d.region === r))), [cups]);
  const chip = (an: boolean) => `rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${an ? 'bg-white text-zinc-900' : 'text-slate-400 hover:text-slate-100'}`;

  return (
    <main className="min-h-screen bg-zinc-950 text-slate-100">
      <div className="mx-auto max-w-[1400px] px-4 py-8">
        <ReplayUmschalter aktiv="alle" />
        <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl"><T>Replays</T></h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          <T>Jedes Game eines ausgewerteten Cups mit Zone, Eliminierungen, Knocks und der Zahl der Lebenden - zum Abspielen, in 2D und 3D. Die Adressen bleiben dauerhaft gleich.</T>
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Cup suchen …')}
            className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
            <button type="button" onClick={() => setRegion('alle')} className={chip(region === 'alle')}><T>Alle</T></button>
            {regionen.map((r) => <button key={r} type="button" onClick={() => setRegion(r)} className={chip(region === r)}>{r}</button>)}
          </div>
        </div>

        <div className="mt-6">
          {fehler && <p className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300"><T>Die Replays ließen sich gerade nicht laden. Bitte gleich noch einmal versuchen.</T></p>}
          {!cups && !fehler && <LadeSchirm />}
          {cups && sichtbar.length === 0 && <p className="text-sm text-slate-500"><T>Keine Replays in dieser Auswahl.</T></p>}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sichtbar.map((c) => (
              <section key={c.eventId} className="flex flex-col rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-4">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[15px] font-bold text-slate-50">{schoenerTitel(c.titel)}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{c.season} · {datum(c.beginn)}</span>
                </p>
                <ul className="mt-3 space-y-1.5">
                  {c.tage.map((d, i) => (
                    <li key={d.windowId}>
                      <Link href={`/replays/${encodeURIComponent(d.windowId)}`}
                        className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] px-3 py-2 text-[12px] transition hover:border-sky-500 hover:bg-zinc-900">
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-200">{d.region}</span>
                        <span className="font-semibold text-slate-200">{c.tage.filter((x) => x.region === d.region).length > 1 ? tagName(d.windowId, i) : datum(d.beginn)}</span>
                        <span className="min-w-0 flex-1 truncate text-[11px] uppercase text-slate-500">{d.sieger.map(ohneMarke).join(' · ')}</span>
                        <span className="shrink-0 tabular-nums text-slate-400">{d.games} <T>Games</T></span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link href={`/live-replays/${encodeURIComponent(c.kurz)}`} className="mt-3 self-start text-[11px] font-semibold text-sky-300 hover:underline">
                  <T>Immer der neueste Tag</T> →
                </Link>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
