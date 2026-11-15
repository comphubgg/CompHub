'use client';

/*
 * Auswertungen unter der Karte (Betreiber, 15.11.2026): Hoehenverlauf, Zonen-Glueck, Glueck gegen Leistung. Rechnungen in app/replays/analyse.ts.
 * Die Tafel "Glueck gegen Leistung" gibt es auch fuer ganze Spieltage (GlueckTafel, Daten von /api/replay-auswertung).
 */

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import type { RMatch, RSpieler, RWertung } from '@/app/replays/ReplayAnsicht';
import { Flagge } from '@/app/replays/Werkzeuge';
import { FORMEL_GLUECK, FORMEL_SCHAETZUNG, glueckWort, hoehenVerlauf, schaetzung, zonenGlueck, type ZonenZug } from '@/app/replays/analyse';

const uhr = (s: number) => { const v = Math.max(0, Math.round(s)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`; };
const dauer = (s: number) => { const v = Math.max(0, Math.round(s)); return v >= 60 ? `${Math.floor(v / 60)}m ${v % 60}s` : `${v}s`; };
const plus = (n: number, stellen = 0) => `${n >= 0 ? '+' : ''}${n.toFixed(stellen)}`;

interface Props {
  match: RMatch; orte: Map<number, number[][]>; tStart: number; tEnde: number; zeit: number;
  echte: RSpieler[]; nameVon: (p?: RSpieler) => string; landVon: (id?: number) => string | undefined; farbeVon: (id?: number) => string;
  springe: (t: number) => void; waehle: (id: number) => void; gewaehlt: number | null; wertung?: RWertung | null;
  /** die anderen Games des Spieltags (Auswahl im Hoehenverlauf) */
  games?: Array<{ nr: number; href: string; aktiv: boolean }>;
}

export function Info({ text }: { text: string }) {
  return <span title={text} className="inline-grid h-4 w-4 shrink-0 cursor-help place-items-center rounded-full border border-sky-400/60 text-[10px] font-bold text-sky-300">i</span>;
}

export default function Analysen(p: Props) {
  const [reiter, setReiter] = useState<'hoehe' | 'glueck' | 'vergleich'>('hoehe');
  if (!p.orte.size) return null;
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-zinc-900/50" id="auswertung">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/[0.08] p-1.5">
        {([['hoehe', 'Height timeline'], ['glueck', 'Zone luck'], ['vergleich', 'Luck vs performance']] as const).map(([k, n]) => (
          <button key={k} type="button" onClick={() => setReiter(k)}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-[0.12em] transition ${reiter === k ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}><T>{n}</T></button>
        ))}
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

/* ------------------------------------------------------------------ Zonen-Glueck */

function Glueck(p: Props) {
  const g = useMemo(() => zonenGlueck(p.match, p.orte), [p.match, p.orte]);
  const [wahl, setWahl] = useState<number | null>(p.gewaehlt);
  const liste = [...g.je.entries()].sort((a, b) => b[1].summe - a[1].summe);
  const aktiv = wahl ?? liste[0]?.[0] ?? null;
  const daten = aktiv !== null ? g.je.get(aktiv) : undefined;
  if (!liste.length) return <p className="text-sm text-slate-500"><T>No positions at the zone reveals in this replay.</T></p>;
  const max = Math.max(1, ...liste.map(([, x]) => Math.abs(x.summe)));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-slate-400">
          <T>How kind the zone pulls were to each player, compared with every other circle the game could have drawn.</T>
          <Info text={FORMEL_GLUECK} />
        </p>
        <details className="mb-2 text-[11px] text-slate-500"><summary className="cursor-pointer text-sky-300/80"><T>Formula</T></summary><p className="mt-1 leading-relaxed">{FORMEL_GLUECK}</p></details>
        <ul className="max-h-[440px] overflow-y-auto">
          {liste.map(([id, x], i) => {
            const s = p.echte.find((e) => e.id === id);
            return (
              <li key={id}>
                <button type="button" onMouseEnter={() => setWahl(id)} onFocus={() => setWahl(id)} onClick={() => { setWahl(id); p.waehle(id); }}
                  title={x.einzeln.map((e) => `Zone ${e.nr}: ${plus(e.diff)}${e.d === 0 ? ' (inside)' : ''}`).join('\n')}
                  className={`grid w-full grid-cols-[22px_1fr_80px_48px] items-center gap-2 border-b border-white/[0.04] px-1.5 py-1 text-left text-[12px] transition hover:bg-sky-500/[0.06] ${aktiv === id ? 'bg-sky-500/10' : ''}`}>
                  <span className="text-right text-[10px] tabular-nums text-slate-500">{i + 1}</span>
                  <span className="flex min-w-0 items-center gap-1.5"><Flagge land={p.landVon(id)} klein /><span className="truncate font-semibold text-slate-100">{p.nameVon(s)}</span><span className="shrink-0 text-[10px] text-slate-500">#{s?.platz ?? '–'}</span></span>
                  <Balken wert={x.summe} max={max} />
                  <span className={`text-right font-bold tabular-nums ${x.summe >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{plus(x.summe)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        {aktiv !== null && daten && (
          <>
            <p className="mb-2 text-[12px] text-slate-300">
              <b className="text-slate-50">{p.nameVon(p.echte.find((e) => e.id === aktiv))}</b> · <T>total</T> <b className={daten.summe >= 0 ? 'text-emerald-300' : 'text-rose-400'}>{plus(daten.summe)}</b>
              {' '}· <span className="rounded bg-white/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider"><T>{glueckWort(daten.summe)}</T></span>
              {' '}· <T>already inside</T> {daten.drin}/{daten.zonen}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {g.zuege.map((z) => <MiniKarte key={z.nr} z={z} id={aktiv} springe={p.springe} />)}
            </div>
            <p className="mt-2 text-[10px] text-slate-500"><T>White ring: current zone. Dashed: the new zone. Blue dot: this player; grey: the rest of the lobby. Click a card to jump there.</T></p>
          </>
        )}
      </div>
    </div>
  );
}

function Balken({ wert, max }: { wert: number; max: number }) {
  return (
    <span className="relative h-2 rounded bg-white/5">
      <span className="absolute top-0 h-full rounded" style={{ left: wert >= 0 ? '50%' : `${50 - (Math.abs(wert) / max) * 50}%`, width: `${(Math.abs(wert) / max) * 50}%`, background: wert >= 0 ? '#34d399' : '#f43f5e' }} />
      <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/30" />
    </span>
  );
}

function MiniKarte({ z, id, springe }: { z: ZonenZug; id: number; springe: (t: number) => void }) {
  const ich = z.orte.get(id);
  const diff = z.wert.get(id);
  const r = Math.max(z.alt.r * 1.15, ich ? Math.hypot(ich.x - z.alt.x, ich.y - z.alt.y) * 1.1 : 0); const x0 = z.alt.x - r; const y0 = z.alt.y - r; const sp = 2 * r;
  const px = (v: number) => ((v - x0) / sp) * 100; const py = (v: number) => ((v - y0) / sp) * 100; const pr = (v: number) => (v / sp) * 100;
  return (
    <button type="button" onClick={() => springe(z.zeit)} className="rounded-lg border border-white/[0.06] bg-black/30 p-1 text-left transition hover:border-sky-500/60">
      <span className="relative block">
        <svg viewBox="0 0 100 100" className={`block aspect-square w-full rounded bg-sky-950/70 ${ich ? '' : 'opacity-40'}`}>
          <circle cx={px(z.alt.x)} cy={py(z.alt.y)} r={pr(z.alt.r)} fill="#0c4a6e" fillOpacity=".35" stroke="#e2e8f0" strokeWidth="1" />
          <circle cx={px(z.neu.x)} cy={py(z.neu.y)} r={pr(z.neu.r)} fill="none" stroke="#fff" strokeWidth="1" strokeDasharray="3 2" />
          {[...z.orte.entries()].map(([k, o]) => (k === id ? null : <circle key={k} cx={px(o.x)} cy={py(o.y)} r="1.4" fill="#94a3b8" fillOpacity=".7" />))}
          {ich && <><line x1={px(ich.x)} y1={py(ich.y)} x2={px(z.neu.x)} y2={py(z.neu.y)} stroke="#38bdf8" strokeOpacity=".6" strokeWidth=".8" /><circle cx={px(ich.x)} cy={py(ich.y)} r="3" fill="#38bdf8" stroke="#000" strokeWidth=".8" /></>}
        </svg>
        {!ich && <span className="absolute inset-0 grid place-items-center px-2 text-center text-[10px] font-semibold text-slate-300"><T>Not alive (or no position) when this zone appeared</T></span>}
      </span>
      <p className="mt-1 flex justify-between px-0.5 text-[10px]"><span className="font-bold text-violet-300">Zone {z.nr}</span>{diff !== undefined && <span className={`font-bold tabular-nums ${diff >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{plus(diff)}</span>}</p>
    </button>
  );
}

/* ------------------------------------------------------------------ Glueck gegen Leistung (ein Game) */

function Vergleich(p: Props) {
  const g = useMemo(() => zonenGlueck(p.match, p.orte), [p.match, p.orte]);
  const sch = useMemo(() => schaetzung(p.match, p.orte), [p.match, p.orte]);
  const punkte = (s: RSpieler): number | null => {
    if (!p.wertung || !s.platz || s.platz >= 999 || !Object.keys(p.wertung.platz).length) return null;
    let x = 0; for (const [n, w] of Object.entries(p.wertung.platz)) if (Number(n) >= s.platz) x += w;
    return x + p.wertung.elim * (s.teamKills ?? s.kills ?? 0);
  };
  const zeilen: TafelZeile[] = p.echte.map((s) => {
    const gl = g.je.get(s.id); const es = sch.get(s.id);
    return {
      schluessel: String(s.id), name: p.nameVon(s), land: p.landVon(s.id), glueck: gl?.summe ?? 0, gegen: es?.gegen ?? null,
      platz: s.platz && s.platz < 999 ? s.platz : null, punkte: punkte(s), sieger: s.platz === 1, games: 1,
      swing: es?.swing ? `+${es.swing.wert} · Z${es.swing.zone}` : null, wurf: es?.throw ? `−${es.throw.wert} · Z${es.throw.zone}` : null,
      waehle: () => p.waehle(s.id), an: s.id === p.gewaehlt,
    };
  }).filter((z) => g.je.has(Number(z.schluessel)));
  return <GlueckTafel zeilen={zeilen} />;
}

/* ------------------------------------------------------------------ Tafel: Punkte + Liste (auch fuer Spieltage) */

export interface TafelZeile {
  schluessel: string; name: string; land?: string; glueck: number; gegen: number | null; platz: number | null; punkte: number | null; sieger: boolean; games: number;
  swing: string | null; wurf: string | null; waehle?: () => void; an?: boolean; href?: string;
}

export function GlueckTafel({ zeilen, kopf }: { zeilen: TafelZeile[]; kopf?: ReactNode }) {
  const [ansicht, setAnsicht] = useState<'tafel' | 'liste'>('tafel');
  const [sort, setSort] = useState<'glueck' | 'gegen' | 'platz' | 'punkte'>('gegen');
  const pkt = zeilen.filter((z) => z.gegen !== null);
  if (pkt.length < 3) return <p className="text-sm text-slate-500"><T>Not enough data for this game.</T></p>;
  const mitPunkten = zeilen.some((z) => z.punkte !== null);
  const xs = pkt.map((q) => q.glueck / q.games); const ys = pkt.map((q) => (q.gegen ?? 0) / q.games);
  const xMax = Math.max(10, ...xs.map(Math.abs)) * 1.1; const yMax = Math.max(3, ...ys.map(Math.abs)) * 1.1;
  const W = 1000; const H = 440; const RL = 44; const RB = 28;
  const sx = (v: number) => RL + ((v + xMax) / (2 * xMax)) * (W - RL - 10);
  const sy = (v: number) => 10 + (1 - (v + yMax) / (2 * yMax)) * (H - 10 - RB);
  const fx = sx(0); const fy = sy(0);
  const top10 = new Set([...pkt].sort((a, b) => (a.platz ?? 999) - (b.platz ?? 999)).slice(0, 10).map((q) => q.schluessel));
  const ecke = (text: string, x: number, y: number, anker: 'start' | 'end') => <text x={x} y={y} fontSize="13" fontWeight="700" fill="#64748b" textAnchor={anker}>{text}</text>;
  const sortiert = [...zeilen].sort((a, b) => (sort === 'glueck' ? b.glueck - a.glueck : sort === 'gegen' ? (b.gegen ?? -999) - (a.gegen ?? -999) : sort === 'platz' ? (a.platz ?? 999) - (b.platz ?? 999) : (b.punkte ?? -1) - (a.punkte ?? -1)));
  const maxG = Math.max(1, ...zeilen.map((z) => Math.abs(z.glueck)));
  const th = (k: typeof sort, text: string, info?: string) => (
    <th className="px-2 py-1.5 text-right"><button type="button" onClick={() => setSort(k)} title={info} className={`uppercase tracking-[0.12em] ${sort === k ? 'text-sky-300' : 'hover:text-slate-200'}`}><T>{text}</T></button></th>
  );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
        <span className="min-w-0 flex-1"><T>Zone luck against how a player did compared with what his state at the first measured zone promised.</T></span>
        <Info text={`${FORMEL_GLUECK}\n\n${FORMEL_SCHAETZUNG}`} />
        {kopf}
        <span className="inline-flex rounded-lg border border-white/10 p-0.5">
          {([['tafel', 'Board'], ['liste', 'List']] as const).map(([k, n]) => <button key={k} type="button" onClick={() => setAnsicht(k)} className={`rounded-md px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${ansicht === k ? 'bg-sky-500 text-white' : 'text-slate-400'}`}><T>{n}</T></button>)}
        </span>
      </div>
      <details className="mb-2 text-[11px] text-slate-500"><summary className="cursor-pointer text-sky-300/80"><T>Methodology</T></summary><p className="mt-1 leading-relaxed">{FORMEL_GLUECK}</p><p className="mt-1 leading-relaxed">{FORMEL_SCHAETZUNG}</p></details>
      {ansicht === 'tafel' ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
          <rect x={RL} y={10} width={fx - RL} height={fy - 10} fill="#0ea5e9" fillOpacity=".05" />
          <rect x={fx} y={fy} width={W - 10 - fx} height={H - RB - fy} fill="#f43f5e" fillOpacity=".04" />
          <line x1={fx} x2={fx} y1={10} y2={H - RB} stroke="#475569" />
          <line x1={RL} x2={W - 10} y1={fy} y2={fy} stroke="#475569" />
          {ecke('Unlucky but outperformed', RL + 8, 28, 'start')}{ecke('Lucky & outperformed', W - 18, 28, 'end')}
          {ecke('Unlucky & underperformed', RL + 8, H - RB - 10, 'start')}{ecke('Lucky but underperformed', W - 18, H - RB - 10, 'end')}
          <text x={(RL + W) / 2} y={H - 6} fontSize="11" fill="#64748b" textAnchor="middle">Zone luck per game →</text>
          <text x={12} y={H / 2} fontSize="11" fill="#64748b" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>Places vs estimate per game →</text>
          {pkt.map((q) => {
            const gx = q.glueck / q.games; const gy = (q.gegen ?? 0) / q.games;
            return (
              <g key={q.schluessel} className={q.waehle ? 'cursor-pointer' : undefined} onClick={q.waehle}>
                <title>{`${q.name} · final #${q.platz ?? '–'}${q.punkte !== null ? ` · ${q.punkte} pts` : ''} · luck ${plus(q.glueck)} · vs estimate ${plus(q.gegen ?? 0)}`}</title>
                <circle cx={sx(gx)} cy={sy(gy)} r={q.an || q.sieger ? 7 : 5} fill={q.sieger ? '#fbbf24' : q.an ? '#f472b6' : '#38bdf8'} fillOpacity=".85" stroke="#020617" strokeWidth="1.5" />
                {(q.an || q.sieger || top10.has(q.schluessel)) && <text x={sx(gx) > W * 0.82 ? sx(gx) - 9 : sx(gx) + 9} y={sy(gy) + 4} fontSize="11" fill="#e2e8f0" textAnchor={sx(gx) > W * 0.82 ? 'end' : 'start'}>{q.name}</text>}
              </g>
            );
          })}
        </svg>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-zinc-900 text-[10px] font-semibold text-slate-500">
              <tr className="border-b border-white/[0.08]">
                <th className="px-2 py-1.5 text-left uppercase tracking-[0.12em]"><T>Player</T></th>
                {th('glueck', 'Zone luck', FORMEL_GLUECK)}{th('gegen', 'vs estimate', FORMEL_SCHAETZUNG)}
                <th className="px-2 py-1.5 text-right uppercase tracking-[0.12em]" title="Biggest jump up in the expected placement from one zone to the next"><T>Swing</T></th>
                <th className="px-2 py-1.5 text-right uppercase tracking-[0.12em]" title="Biggest gap between an expected placement and the final placement"><T>Throw</T></th>
                {mitPunkten && th('punkte', 'Points')}{th('platz', 'Place')}
              </tr>
            </thead>
            <tbody>
              {sortiert.map((z) => (
                <tr key={z.schluessel} onClick={z.waehle} className={`border-b border-white/[0.04] ${z.waehle ? 'cursor-pointer hover:bg-sky-500/[0.06]' : ''} ${z.an ? 'bg-sky-500/10' : ''}`}>
                  <td className="px-2 py-1"><span className="flex min-w-0 items-center gap-1.5"><Flagge land={z.land} klein />{z.href ? <Link href={z.href} className="truncate font-semibold text-slate-100 hover:text-sky-300">{z.name}</Link> : <span className="truncate font-semibold text-slate-100">{z.name}</span>}{z.games > 1 && <span className="text-[10px] text-slate-500">{z.games} G</span>}</span></td>
                  <td className="px-2 py-1"><span className="flex items-center justify-end gap-2"><span className="w-16"><Balken wert={z.glueck} max={maxG} /></span><span className={`w-10 text-right font-bold tabular-nums ${z.glueck >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{plus(z.glueck)}</span></span></td>
                  <td className={`px-2 py-1 text-right font-bold tabular-nums ${(z.gegen ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>{z.gegen === null ? '–' : plus(z.gegen)}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-300">{z.swing ?? '–'}</td>
                  <td className="px-2 py-1 text-right tabular-nums text-slate-300">{z.wurf ?? '–'}</td>
                  {mitPunkten && <td className="px-2 py-1 text-right tabular-nums text-slate-200">{z.punkte ?? '–'}</td>}
                  <td className="px-2 py-1 text-right tabular-nums text-slate-400">{z.platz ? (z.games > 1 ? z.platz.toFixed(1) : `#${z.platz}`) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
