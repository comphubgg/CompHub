'use client';

/*
 * Auswertungen unter der Karte (Betreiber, 15.11.2026): Hoehenverlauf, Zonen-Glueck, Glueck gegen Leistung. Rechnungen in app/replays/analyse.ts.
 */

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import type { RMatch, RSpieler, RWertung } from '@/app/replays/ReplayAnsicht';
import { Flagge } from '@/app/replays/Werkzeuge';
import { D_MAX, GLUECK_AB_KREIS, MIN_RADIUS, hoehenVerlauf, zonenGlueck, type ZonenZug } from '@/app/replays/analyse';

const uhr = (s: number) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };

interface Props {
  match: RMatch; orte: Map<number, number[][]>; tStart: number; tEnde: number; zeit: number;
  echte: RSpieler[]; nameVon: (p?: RSpieler) => string; landVon: (id?: number) => string | undefined; farbeVon: (id?: number) => string;
  springe: (t: number) => void; waehle: (id: number) => void; gewaehlt: number | null; wertung?: RWertung | null;
}

export default function Analysen(p: Props) {
  const [reiter, setReiter] = useState<'hoehe' | 'glueck' | 'vergleich'>('hoehe');
  if (!p.orte.size) return null;
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50">
      <div className="flex flex-wrap gap-1 border-b border-white/[0.08] p-1.5">
        {([['hoehe', 'Height timeline'], ['glueck', 'Zone luck'], ['vergleich', 'Luck vs performance']] as const).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setReiter(k)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}><T>{n}</T></button>
        ))}
      </div>
      <div className="p-3">
        {reiter === 'hoehe' && <Hoehe {...p} />}
        {reiter === 'glueck' && <Glueck {...p} />}
        {reiter === 'vergleich' && <Vergleich {...p} />}
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
  const sieger = p.echte.filter((s) => s.platz === 1).map((s) => s.id);
  const W = 1000; const H = 260; const R = 34;
  const top = Math.ceil(Math.min(v.maxM, 250) / 10) * 10 || 10; const unten = Math.floor(Math.min(0, v.minM) / 10) * 10;
  const x = (t: number) => R + ((t - v.ab) / Math.max(1, v.bis - v.ab)) * (W - R - 4);
  const y = (m: number) => 8 + (1 - (Math.min(m, top) - unten) / (top - unten)) * (H - 30);
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
  return (
    <div>
      <p className="mb-2 text-[12px] text-slate-400"><T>Height above sea level of every player over the game (grey). Gold: the winner. Blue segments: who stood highest during each zone; the label says for how long.</T></p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full cursor-pointer" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const t = v.ab + (((e.clientX - r.left) / r.width) * W - R) / (W - R - 4) * (v.bis - v.ab); p.springe(t); }}>
        {[unten, (top + unten) / 2, top].map((m) => (
          <g key={m}><line x1={R} x2={W} y1={y(m)} y2={y(m)} stroke="#334155" strokeDasharray="3 4" /><text x={R - 4} y={y(m) + 3} fontSize="10" fill="#64748b" textAnchor="end">{Math.round(m)} m</text></g>
        ))}
        {zonen.map((z) => (
          <g key={z.nr}><line x1={x(z.t)} x2={x(z.t)} y1={8} y2={H - 22} stroke="#8b5cf6" strokeOpacity=".45" /><text x={x(z.t)} y={H - 8} fontSize="10" fill="#a78bfa" textAnchor="middle">Z{z.nr}</text></g>
        ))}
        {[...v.linien.entries()].map(([id, w]) => (sieger.includes(id) || id === markiert ? null : <path key={id} d={pfad(w)} fill="none" stroke="#94a3b8" strokeOpacity=".22" strokeWidth="1" />))}
        {v.abschnitte.map((a, k) => (a.wer === null ? null : (
          <path key={`h${k}`} d={pfad(v.linien.get(a.wer) ?? [], (i) => { const t = v.ab + i * v.schritt; return t >= a.von && t < a.bis; })} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
        )))}
        {sieger.map((id) => <path key={`s${id}`} d={pfad(v.linien.get(id) ?? [])} fill="none" stroke="#fbbf24" strokeWidth="2" />)}
        {markiert !== null && !sieger.includes(markiert) && <path d={pfad(v.linien.get(markiert) ?? [])} fill="none" stroke="#f472b6" strokeWidth="2" />}
        {p.zeit >= v.ab && <line x1={x(p.zeit)} x2={x(p.zeit)} y1={4} y2={H - 22} stroke="#fff" strokeWidth="1.5" />}
      </svg>
      <ul className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
        {v.abschnitte.filter((a) => a.wer !== null && a.sek > 0).map((a, k) => {
          const s = p.echte.find((x) => x.id === a.wer);
          return (
            <li key={k}>
              <button type="button" onClick={() => { p.springe(a.von); if (a.wer !== null) p.waehle(a.wer); }} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1 text-left hover:border-sky-500/50">
                <span className="w-14 shrink-0 font-bold text-violet-300">{a.nr ? `Zone ${a.nr}` : <T>Landing</T>}</span>
                <Flagge land={p.landVon(a.wer ?? undefined)} klein />
                <span className="min-w-0 flex-1 truncate font-semibold text-sky-200">{p.nameVon(s)}</span>
                <span className="shrink-0 tabular-nums text-slate-400">{uhr(a.sek)} / {uhr(a.bis - a.von)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-amber-400 align-middle" /><T>Winner</T></span>
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-sky-400 align-middle" /><T>Highest player in the zone</T></span>
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-pink-400 align-middle" /><T>Selected player</T></span>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ Zonen-Glueck */

const FORMEL = `For every zone from zone ${GLUECK_AB_KREIS} on: at the moment the new circle appears (the previous one has finished closing), d = distance of the player to the centre of the new circle ÷ radius of the circle he is standing in (capped at ${D_MAX}; circles under ${MIN_RADIUS / 100} m are skipped). Lobby = median of d over all living players with a known position (within 30 s). Luck per zone = (lobby median − d) × 100. Score = mean over all zones the player was alive for. Positive = the zone came closer to him than to the lobby.`;

function Glueck(p: Props) {
  const g = useMemo(() => zonenGlueck(p.match, p.orte), [p.match, p.orte]);
  const [wahl, setWahl] = useState<number | null>(p.gewaehlt);
  const liste = [...g.je.entries()].sort((a, b) => b[1].score - a[1].score);
  const aktiv = wahl ?? liste[0]?.[0] ?? null;
  const daten = aktiv !== null ? g.je.get(aktiv) : undefined;
  if (!liste.length) return <p className="text-sm text-slate-500"><T>No positions at the zone reveals in this replay.</T></p>;
  const max = Math.max(1, ...liste.map(([, x]) => Math.abs(x.score)));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-slate-400">
          <T>How favourable the zone pulls were for each player, compared with the lobby.</T>
          <span title={FORMEL} className="grid h-4 w-4 cursor-help place-items-center rounded-full border border-sky-400/60 text-[10px] font-bold text-sky-300">i</span>
        </p>
        <details className="mb-2 text-[11px] text-slate-500"><summary className="cursor-pointer text-sky-300/80"><T>Formula</T></summary><p className="mt-1 leading-relaxed">{FORMEL}</p></details>
        <ul className="max-h-[420px] overflow-y-auto">
          {liste.map(([id, x], i) => {
            const s = p.echte.find((e) => e.id === id);
            return (
              <li key={id}>
                <button type="button" onMouseEnter={() => setWahl(id)} onClick={() => { setWahl(id); p.waehle(id); }}
                  title={x.einzeln.map((e) => `Zone ${e.nr}: ${e.diff >= 0 ? '+' : ''}${e.diff.toFixed(0)} (d=${e.d.toFixed(2)})`).join('\n')}
                  className={`grid w-full grid-cols-[22px_1fr_90px_40px] items-center gap-2 border-b border-white/[0.04] px-1.5 py-1 text-left text-[12px] transition hover:bg-sky-500/[0.06] ${aktiv === id ? 'bg-sky-500/10' : ''}`}>
                  <span className="text-right text-[10px] tabular-nums text-slate-500">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-1.5"><Flagge land={p.landVon(id)} klein /><span className="truncate font-semibold text-slate-100">{p.nameVon(s)}</span><span className="shrink-0 text-[10px] text-slate-500">#{s?.platz ?? '–'}</span></span>
                  <span className="relative h-2 rounded bg-white/5">
                    <span className="absolute top-0 h-full rounded" style={{ left: x.score >= 0 ? '50%' : `${50 - (Math.abs(x.score) / max) * 50}%`, width: `${(Math.abs(x.score) / max) * 50}%`, background: x.score >= 0 ? '#34d399' : '#f43f5e' }} />
                    <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/30" />
                  </span>
                  <span className={`text-right font-bold tabular-nums ${x.score >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{x.score >= 0 ? '+' : ''}{x.score.toFixed(0)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        {aktiv !== null && daten && (
          <>
            <p className="mb-2 text-[12px] text-slate-300"><b className="text-slate-50">{p.nameVon(p.echte.find((e) => e.id === aktiv))}</b> · <T>score</T> <b className={daten.score >= 0 ? 'text-emerald-300' : 'text-rose-400'}>{daten.score >= 0 ? '+' : ''}{daten.score.toFixed(0)}</b> · {daten.zonen} <T>zones</T></p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.zuege.filter((z) => z.wert.has(aktiv)).map((z) => <MiniKarte key={z.nr} z={z} id={aktiv} diff={daten.einzeln.find((e) => e.nr === z.nr)?.diff ?? 0} springe={p.springe} />)}
            </div>
            <p className="mt-2 text-[10px] text-slate-500"><T>White ring: current zone. Dashed: the new zone. Blue dot: this player; grey: the rest of the lobby.</T></p>
          </>
        )}
      </div>
    </div>
  );
}

function MiniKarte({ z, id, diff, springe }: { z: ZonenZug; id: number; diff: number; springe: (t: number) => void }) {
  // Ausschnitt: der alte Kreis mit etwas Rand.
  const ich = z.orte.get(id);
  const r = Math.max(z.alt.r * 1.15, ich ? Math.hypot(ich.x - z.alt.x, ich.y - z.alt.y) * 1.1 : 0); const x0 = z.alt.x - r; const y0 = z.alt.y - r; const sp = 2 * r;
  const px = (v: number) => ((v - x0) / sp) * 100; const py = (v: number) => ((v - y0) / sp) * 100; const pr = (v: number) => (v / sp) * 100;
  return (
    <button type="button" onClick={() => springe(z.zeit)} className="rounded-lg border border-white/[0.06] bg-black/30 p-1 text-left transition hover:border-sky-500/60">
      <svg viewBox="0 0 100 100" className="block aspect-square w-full rounded bg-sky-950/70">
        <circle cx={px(z.alt.x)} cy={py(z.alt.y)} r={pr(z.alt.r)} fill="#0c4a6e" fillOpacity=".35" stroke="#e2e8f0" strokeWidth="1" />
        <circle cx={px(z.neu.x)} cy={py(z.neu.y)} r={pr(z.neu.r)} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="3 2" />
        {[...z.orte.entries()].map(([k, o]) => (k === id ? null : <circle key={k} cx={px(o.x)} cy={py(o.y)} r="1.4" fill="#94a3b8" fillOpacity=".7" />))}
        {ich && <><line x1={px(ich.x)} y1={py(ich.y)} x2={px(z.neu.x)} y2={py(z.neu.y)} stroke="#38bdf8" strokeOpacity=".6" strokeWidth=".8" /><circle cx={px(ich.x)} cy={py(ich.y)} r="3" fill="#38bdf8" stroke="#000" strokeWidth=".8" /></>}
      </svg>
      <p className="mt-1 flex justify-between px-0.5 text-[10px]"><span className="font-bold text-violet-300">Zone {z.nr}</span><span className={`font-bold tabular-nums ${diff >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{diff >= 0 ? '+' : ''}{diff.toFixed(0)}</span></p>
    </button>
  );
}

/* ------------------------------------------------------------------ Glueck gegen Leistung */

function Vergleich(p: Props) {
  const g = useMemo(() => zonenGlueck(p.match, p.orte), [p.match, p.orte]);
  // Leistung: Punkte nach der Wertung des Cups, wo es sie gibt; sonst der Platz.
  const punkte = (s: RSpieler): number | null => {
    if (!p.wertung || !s.platz || s.platz >= 999) return null;
    let x = 0; for (const [n, w] of Object.entries(p.wertung.platz)) if (Number(n) >= s.platz) x += w;
    return x + p.wertung.elim * (s.teamKills ?? s.kills ?? 0);
  };
  const mitPunkten = Boolean(p.wertung && Object.keys(p.wertung.platz).length);
  const pkt = [...g.je.entries()].map(([id, x]) => {
    const s = p.echte.find((e) => e.id === id);
    return s && s.platz && s.platz < 999 ? { id, s, glueck: x.score, leistung: mitPunkten ? punkte(s) ?? 0 : s.platz } : null;
  }).filter((x): x is NonNullable<typeof x> => x !== null);
  if (pkt.length < 3) return <p className="text-sm text-slate-500"><T>Not enough data for this game.</T></p>;
  const xs = pkt.map((q) => q.glueck); const ls = pkt.map((q) => q.leistung);
  const xMax = Math.max(10, ...xs.map(Math.abs)) * 1.1;
  const lMin = Math.min(...ls); const lMax = Math.max(...ls);
  const mitte = [...ls].sort((a, b) => a - b)[Math.floor(ls.length / 2)];
  const W = 1000; const H = 420; const RL = 40; const RB = 26;
  const sx = (v: number) => RL + ((v + xMax) / (2 * xMax)) * (W - RL - 10);
  // Oben = gut: bei Punkten viel, beim Platz wenig.
  const gut = (l: number) => (mitPunkten ? (l - lMin) / Math.max(1, lMax - lMin) : (lMax - l) / Math.max(1, lMax - lMin));
  const sy = (l: number) => 10 + (1 - gut(l)) * (H - 10 - RB);
  const fx = sx(0); const fy = sy(mitte);
  const ecke = (text: string, x: number, y: number, anker: 'start' | 'end') => <text x={x} y={y} fontSize="13" fontWeight="700" fill="#64748b" textAnchor={anker}>{text}</text>;
  return (
    <div>
      <p className="mb-2 text-[12px] text-slate-400"><T>Each dot is a player: zone luck (left = unlucky, right = lucky) against the result (up = better). Above the line did better than the median.</T> {mitPunkten ? <T>Result = points in this game.</T> : <T>Result = placement.</T>}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
        <rect x={RL} y={10} width={fx - RL} height={fy - 10} fill="#0ea5e9" fillOpacity=".05" />
        <rect x={fx} y={fy} width={W - 10 - fx} height={H - RB - fy} fill="#f43f5e" fillOpacity=".04" />
        <line x1={fx} x2={fx} y1={10} y2={H - RB} stroke="#475569" />
        <line x1={RL} x2={W - 10} y1={fy} y2={fy} stroke="#475569" />
        {ecke('Unlucky but good', RL + 8, 28, 'start')}{ecke('Lucky & good', W - 18, 28, 'end')}
        {ecke('Unlucky & struggling', RL + 8, H - RB - 10, 'start')}{ecke('Lucky but struggling', W - 18, H - RB - 10, 'end')}
        <text x={(RL + W) / 2} y={H - 6} fontSize="11" fill="#64748b" textAnchor="middle">Zone luck →</text>
        <text x={12} y={H / 2} fontSize="11" fill="#64748b" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>{mitPunkten ? 'Points →' : 'Placement →'}</text>
        {pkt.map((q) => {
          const an = q.id === p.gewaehlt; const sieg = q.s.platz === 1;
          return (
            <g key={q.id} className="cursor-pointer" onClick={() => p.waehle(q.id)}>
              <title>{`${p.nameVon(q.s)} · #${q.s.platz} · luck ${q.glueck.toFixed(0)}${mitPunkten ? ` · ${q.leistung} pts` : ''}`}</title>
              <circle cx={sx(q.glueck)} cy={sy(q.leistung)} r={an || sieg ? 7 : 5} fill={sieg ? '#fbbf24' : an ? '#f472b6' : '#38bdf8'} fillOpacity=".85" stroke="#020617" strokeWidth="1.5" />
              {(an || sieg || q.s.platz! <= 3) && <text x={sx(q.glueck) + 9} y={sy(q.leistung) + 4} fontSize="11" fill="#e2e8f0">{p.nameVon(q.s)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
