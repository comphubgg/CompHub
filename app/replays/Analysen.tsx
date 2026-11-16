'use client';

/*
 * Auswertung unter der Karte (Betreiber, 15.11.2026): Hoehenverlauf. Rechnung in app/replays/analyse.ts.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import type { RMatch, RSpieler } from '@/app/replays/ReplayAnsicht';
import { Flagge } from '@/app/replays/Werkzeuge';
import { hoehenVerlauf } from '@/app/replays/analyse';

const uhr = (s: number) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const dauer = (s: number) => { const v = Math.max(0, Math.round(s)); return v >= 60 ? `${Math.floor(v / 60)}m ${v % 60}s` : `${v}s`; };

interface Props {
  match: RMatch; orte: Map<number, number[][]>; tStart: number; tEnde: number; zeit: number;
  echte: RSpieler[]; nameVon: (p?: RSpieler) => string; landVon: (id?: number) => string | undefined; farbeVon: (id?: number) => string;
  springe: (t: number) => void; waehle: (id: number) => void; gewaehlt: number | null;
  /** die anderen Games des Spieltags (Auswahl im Hoehenverlauf) */
  games?: Array<{ nr: number; href: string; aktiv: boolean }>;
}

export default function Analysen(p: Props) {
  if (!p.orte.size) return null;
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50" id="auswertung">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] p-1.5">
        <h2 className="px-2 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-100"><T>Height timeline</T></h2>
        {p.games && p.games.length > 1 && (
          <span className="ml-auto flex flex-wrap items-center gap-1 pr-1 text-[11px] text-slate-500">
            <T>Game</T>
            {p.games.map((g) => (
              <Link key={g.nr} href={`${g.href}#auswertung`} className={`rounded-md px-2 py-1 font-bold tabular-nums transition ${g.aktiv ? 'bg-white/10 text-slate-50' : 'text-slate-400 hover:text-sky-300'}`}>{g.nr}</Link>
            ))}
          </span>
        )}
      </div>
      <div className="p-3">
        <Hoehe {...p} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Hoehenverlauf */

function Hoehe(p: Props) {
  // Ab dem Ende des Absprungs (letzter Absprung + 25 s Fallschirm), sonst ab dem Beginn der Zeitleiste.
  const ab = useMemo(() => {
    const b = p.match.bus?.[0];
    return typeof p.match.busAb === 'number' && b ? Math.max(p.tStart, p.match.busAb + (b.sprungBis ?? 30) + 25) : p.tStart;
  }, [p.match, p.tStart]);
  const v = useMemo(() => hoehenVerlauf(p.match, p.orte, ab, p.tEnde), [p.match, p.orte, ab, p.tEnde]);
  const [zeiger, setZeiger] = useState<number | null>(null);
  const sieger = p.echte.filter((s) => s.platz === 1);
  const W = 1000; const H = 280; const R = 40;
  const top = Math.ceil(Math.min(v.maxM, 250) / 10) * 10 || 10; const unten = Math.floor(Math.min(0, v.minM) / 10) * 10;
  const x = (t: number) => R + ((t - v.ab) / Math.max(1, v.bis - v.ab)) * (W - R - 4);
  const y = (m: number) => 8 + (1 - (Math.min(m, top) - unten) / (top - unten)) * (H - 30);
  const tAus = (px: number) => v.ab + ((px - R) / (W - R - 4)) * (v.bis - v.ab);
  const pfad = (werte: Array<number | null>, nurWo?: (i: number) => boolean) => {
    let d = ''; let offen = false;
    werte.forEach((w, i) => {
      if (w === null || (nurWo && !nurWo(i))) { offen = false; return; }
      d += `${offen ? 'L' : 'M'}${x(v.ab + i * v.schritt).toFixed(1)},${y(w).toFixed(1)}`; offen = true;
    });
    return d;
  };
  const markiert = p.gewaehlt;
  const zonen = p.match.zonen.map((z, i) => ({ nr: i + 1, t: z.schrumpftAb ?? 0 })).filter((z) => z.t > v.ab && z.t < v.bis);
  const name = (id: number | null) => p.nameVon(p.echte.find((s) => s.id === id));
  // Zeiger: Zeit, der Hoechste und seine Hoehe.
  const zi = zeiger === null ? -1 : Math.max(0, Math.min(v.hoechster.length - 1, Math.round((zeiger - v.ab) / v.schritt)));
  const hoch = zi >= 0 ? v.hoechster[zi] : null;
  const hochM = hoch !== null && zi >= 0 ? v.linien.get(hoch)?.[zi] ?? null : null;
  return (
    <div>
      <p className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
        <T>Height above sea level of every player over the game. Gold: the winner. Blue: whoever stood highest during each zone, with how long he held it.</T>
        {sieger.map((s) => <span key={s.id} className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-bold text-amber-200"><Flagge land={p.landVon(s.id)} klein />{p.nameVon(s)}</span>)}
      </p>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full cursor-crosshair"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const t = tAus(((e.clientX - r.left) / r.width) * W); setZeiger(t >= v.ab && t <= v.bis ? t : null); }}
          onMouseLeave={() => setZeiger(null)}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); p.springe(tAus(((e.clientX - r.left) / r.width) * W)); }}>
          {[unten, (top + unten) / 2, top].map((m) => (
            <g key={m}><line x1={R} x2={W} y1={y(m)} y2={y(m)} stroke="#334155" strokeDasharray="3 4" /><text x={R - 4} y={y(m) + 3} fontSize="10" fill="#64748b" textAnchor="end">{Math.round(m)} m</text></g>
          ))}
          {zonen.map((z) => (
            <g key={z.nr}><line x1={x(z.t)} x2={x(z.t)} y1={8} y2={H - 22} stroke="#8b5cf6" strokeOpacity=".45" /><text x={x(z.t)} y={H - 8} fontSize="10" fill="#a78bfa" textAnchor="middle">Z{z.nr}</text></g>
          ))}
          {[...v.linien.entries()].map(([id, w]) => (sieger.some((s) => s.id === id) || id === markiert ? null : <path key={id} d={pfad(w)} fill="none" stroke="#94a3b8" strokeOpacity=".22" strokeWidth="1" />))}
          {v.abschnitte.map((a, k) => (a.wer === null ? null : (
            <path key={`h${k}`} d={pfad(v.linien.get(a.wer) ?? [], (i) => { const t = v.ab + i * v.schritt; return t >= a.von && t < a.bis; })} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
          )))}
          {sieger.map((s) => <path key={`s${s.id}`} d={pfad(v.linien.get(s.id) ?? [])} fill="none" stroke="#fbbf24" strokeWidth="2" />)}
          {markiert !== null && !sieger.some((s) => s.id === markiert) && <path d={pfad(v.linien.get(markiert) ?? [])} fill="none" stroke="#f472b6" strokeWidth="2" />}
          {/* Beschriftung je Zone: "NAME (4m 7s)" ueber dem Abschnitt, wenn er breit genug ist */}
          {v.abschnitte.map((a, k) => (a.wer === null || x(a.bis) - x(a.von) < 70 ? null : (
            <text key={`l${k}`} x={(x(a.von) + x(a.bis)) / 2} y={18} fontSize="10" fill="#7dd3fc" textAnchor="middle">{name(a.wer).slice(0, 14)} ({dauer(a.sek)})</text>
          )))}
          {p.zeit >= v.ab && <line x1={x(p.zeit)} x2={x(p.zeit)} y1={4} y2={H - 22} stroke="#fff" strokeWidth="1.5" />}
          {zeiger !== null && <line x1={x(zeiger)} x2={x(zeiger)} y1={4} y2={H - 22} stroke="#38bdf8" strokeDasharray="2 3" />}
          {zeiger !== null && hochM !== null && <circle cx={x(zeiger)} cy={y(hochM)} r="4" fill="#38bdf8" stroke="#020617" strokeWidth="1.5" />}
        </svg>
        {zeiger !== null && hoch !== null && hochM !== null && (
          <div className="pointer-events-none absolute top-1 rounded-md border border-white/10 bg-zinc-950/95 px-2 py-1 text-[11px] text-slate-200 shadow-xl"
            style={{ left: `${(x(zeiger) / W) * 100}%`, transform: x(zeiger) > W * 0.7 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)' }}>
            <span className="tabular-nums text-slate-400">{uhr(zeiger - p.tStart)}</span> · <T>highest</T> <b className="text-sky-200">{name(hoch)}</b> <span className="tabular-nums">{Math.round(hochM)} m</span>
          </div>
        )}
      </div>
      <ul className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
        {v.abschnitte.filter((a) => a.wer !== null && a.sek > 0).map((a, k) => (
          <li key={k}>
            <button type="button" onClick={() => { p.springe(a.von); if (a.wer !== null) p.waehle(a.wer); }} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 text-left hover:border-sky-500/50">
              <span className="w-14 shrink-0 font-bold text-violet-300">{a.nr ? `Zone ${a.nr}` : <T>Landing</T>}</span>
              <Flagge land={p.landVon(a.wer ?? undefined)} klein />
              <span className="min-w-0 flex-1 truncate font-semibold text-sky-200">{name(a.wer)}</span>
              <span className="shrink-0 tabular-nums text-slate-400">{dauer(a.sek)} / {dauer(a.bis - a.von)}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-amber-400 align-middle" /><T>Winner</T></span>
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-sky-400 align-middle" /><T>Highest player in the zone</T></span>
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-pink-400 align-middle" /><T>Selected player</T></span>
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-slate-500 align-middle" /><T>Everyone else</T></span>
      </p>
    </div>
  );
}
