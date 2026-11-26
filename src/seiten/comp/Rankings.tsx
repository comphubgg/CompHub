import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Glas, Titel, flagge } from '../../teile/Glas';
import { Treppchen, type PodestDaten } from '../../teile/Podest';

/* Power Rankings im Hub: Podest, Climbers/Fallers, Laender der Top 100, ganze Liste mit Suche und Blaettern (/api/power-rankings). */

interface S { rank: number; id: string; name: string; anzeige?: string; land?: string; wertung: number; deltaPlatz: number; deltaWertung?: number; bild?: string | null }
interface Uebersicht { spitze: S[]; aufsteiger: S[]; absteiger: S[]; laender: Array<{ land: string; n: number }> }
const name = (s: S) => s.anzeige || s.name;
const LAENDER: Record<string, string> = { us: 'United States', br: 'Brazil', dk: 'Denmark', pl: 'Poland', ca: 'Canada', fr: 'France', gb: 'United Kingdom', jp: 'Japan', de: 'Germany', ru: 'Russia', se: 'Sweden', nl: 'Netherlands', es: 'Spain', it: 'Italy', ua: 'Ukraine', au: 'Australia', ar: 'Argentina', mx: 'Mexico', ch: 'Switzerland', no: 'Norway', fi: 'Finland', pt: 'Portugal', tr: 'Turkey', kr: 'South Korea', sa: 'Saudi Arabia' };

function Bewegung({ titel, liste, hoch }: { titel: string; liste: S[]; hoch: boolean }) {
  return (
    <Glas className="p-5" verzoegerung={0.3}>
      <div className="flex items-baseline justify-between"><h3 className="font-bold text-white">{titel}</h3><span className="text-[11px] text-white/40">since the last update</span></div>
      <ul className="mt-3 space-y-1">
        {liste.slice(0, 6).map((s) => (
          <li key={s.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white/5">
            <span className="w-12 text-xs tabular-nums text-white/40">#{s.rank}</span>
            {s.land ? <img src={flagge(s.land)} alt="" className="h-5 w-5 rounded-full object-cover" /> : <span className="h-5 w-5 rounded-full bg-white/10" />}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{name(s)}</span>
            <span className={`text-sm font-bold tabular-nums ${hoch ? 'text-emerald-400' : 'text-red-400'}`}>{hoch ? '▲' : '▼'} {Math.abs(s.deltaPlatz).toLocaleString('en')}</span>
          </li>
        ))}
      </ul>
    </Glas>
  );
}

export default function Rankings() {
  const [ue, setUe] = useState<Uebersicht | null>(null);
  const [liste, setListe] = useState<S[]>([]);
  const [seite, setSeite] = useState(1);
  const [seiten, setSeiten] = useState(1);
  const [q, setQ] = useState('');
  useEffect(() => { fetch('/api/power-rankings?uebersicht=1').then((r) => r.json()).then(setUe).catch(() => {}); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/power-rankings?page=${seite}&pageSize=50${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.json()).then((j) => { setListe(j.players ?? []); setSeiten(j.totalPages ?? 1); }).catch(() => {});
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [seite, q]);
  const maxLand = Math.max(1, ...(ue?.laender ?? []).map((l) => l.n));
  return (
    <div className="space-y-8">
      <Titel ueber="Standings" titel="Power Rankings" text="Epic's global ranking — ten thousand places, refreshed daily." />
      {ue && ue.spitze.length >= 3 && (
        <div>
          <Treppchen plaetze={ue.spitze.slice(0, 3).map((s, i): PodestDaten => ({
            platz: (i + 1) as 1 | 2 | 3, bild: s.bild, land: s.land, name: name(s), unter: s.name, label: 'PR score', wert: s.wertung.toLocaleString('en'), link: `/competitive/player/${s.id}`,
            rechts: s.deltaPlatz !== 0 ? <span className={`text-sm font-bold ${s.deltaPlatz > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.deltaPlatz > 0 ? '▲' : '▼'} {Math.abs(s.deltaPlatz)}</span> : undefined,
          }))} />
        </div>
      )}
      {ue && (
        <div className="grid gap-5 lg:grid-cols-3">
          <Bewegung titel="Climbers" liste={ue.aufsteiger} hoch />
          <Bewegung titel="Fallers" liste={ue.absteiger} hoch={false} />
          <Glas className="p-5" verzoegerung={0.35}>
            <h3 className="font-bold text-white">Where the top 100 come from</h3>
            <ul className="mt-3 space-y-2.5">
              {ue.laender.map((l) => (
                <li key={l.land} className="flex items-center gap-2.5">
                  <img src={flagge(l.land)} alt="" className="h-5 w-5 rounded-full object-cover" />
                  <span className="w-32 truncate text-sm text-white/80">{LAENDER[l.land] ?? l.land.toUpperCase()}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><motion.div className="h-full rounded-full bg-sky-400" initial={{ width: 0 }} animate={{ width: `${(l.n / maxLand) * 100}%` }} transition={{ duration: 0.8, delay: 0.4 }} /></div>
                  <span className="w-6 text-right text-sm font-bold tabular-nums text-white">{l.n}</span>
                </li>
              ))}
            </ul>
          </Glas>
        </div>
      )}
      <Glas className="overflow-hidden" verzoegerung={0.4}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 p-4">
          <h3 className="font-bold text-white">All players</h3>
          <input value={q} onChange={(e) => { setQ(e.target.value); setSeite(1); }} placeholder="Search a player…" className="ml-auto w-64 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none" />
        </div>
        <div className="divide-y divide-white/5">
          {liste.map((s) => (
            <a key={s.id} href={`/competitive/player/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.04]">
              <span className="w-14 text-sm font-bold tabular-nums text-white/50">#{s.rank}</span>
              {s.bild ? <img src={s.bild} alt="" className="h-8 w-8 rounded-full object-cover object-top" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-white/5 text-xs text-white/30">?</span>}
              {s.land && <img src={flagge(s.land)} alt="" className="h-4 w-4 rounded-full object-cover" />}
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">{name(s)}</span>
              {s.deltaPlatz !== 0 && <span className={`w-14 text-right text-xs font-bold tabular-nums ${s.deltaPlatz > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.deltaPlatz > 0 ? '▲' : '▼'}{Math.abs(s.deltaPlatz)}</span>}
              <span className="w-20 text-right text-sm font-semibold tabular-nums text-white">{s.wertung.toLocaleString('en')}</span>
            </a>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3 border-t border-white/5 p-3 text-sm">
          <button type="button" disabled={seite <= 1} onClick={() => setSeite((x) => x - 1)} className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/5 disabled:opacity-30">← Prev</button>
          <span className="tabular-nums text-white/50">Page {seite} / {seiten}</span>
          <button type="button" disabled={seite >= seiten} onClick={() => setSeite((x) => x + 1)} className="rounded-lg px-3 py-1.5 text-white/70 hover:bg-white/5 disabled:opacity-30">Next →</button>
        </div>
      </Glas>
    </div>
  );
}
