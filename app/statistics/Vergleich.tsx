'use client';

/*
 * Der Vergleich - zwei Spieler (oder zwei Duos, zwei Trios) gegeneinander, wie beim Vorbild.
 *
 * Der Betreiber (13.10.2026): die Vergleichsseite soll aussehen wie beim Vorbild ("Comparison"): oben zwei Spieler mit Fotos,
 * darunter wahlweise Board (Balken) oder Radar und Form; Solo, Duos und Trios, ein Reset-Knopf, Saison oder All-Time - und nur
 * Zahlen ab Chapter 5 Season 3, denn davor liegen keine Spielwerte vor.
 *
 * Alle Zahlen sind echt: die Spielwerte je Spieltag aus der Szene-Quelle (/api/szene-stats?spieler=). Ein "Rating" gibt es dort
 * nicht und wird auch nicht erfunden. Bei Duos und Trios zaehlen nur die Spieltage, an denen alle Gewaehlten gespielt haben;
 * die Werte sind die Summe der Teammitglieder, Quoten werden aus den Summen neu gerechnet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import TeamFlagge from '@/components/TeamFlagge';

export interface VglSpieler { epicId: string; anzeige: string; land: string | null; bild: string | null; gepflegt?: boolean; matches?: number }

interface Werte {
  eliminations?: number; damageDealt?: number; damageTakenFromPlayers?: number; headshots?: number; hitsToPlayers?: number; shots?: number;
  rebootsAndRevives?: number; matchesPlayed?: number; timeAlive?: number;
  woodFarmed?: number; stoneFarmed?: number; metalFarmed?: number;
  woodBuildsPlaced?: number; stoneBuildsPlaced?: number; metalBuildsPlaced?: number;
}
interface Zeile { event: string; windowId: string; season: string; datum?: number; platz?: number | null; werte?: Werte; nurEpic?: boolean }

/** Gerechnete Werte einer Seite (Spieler oder Team) ueber die gewaehlten Spieltage. */
interface Summe {
  matches: number; elims: number; damage: number; genommen: number; headshots: number; hits: number; shots: number;
  zeit: number; builds: number; mats: number; reboots: number; spieltage: number;
}

const ERSTE_SAISON = 30;
const nrVon = (k: string) => Number(k.replace(/\D/g, '')) || 0;
const n0 = (x: number | undefined) => (Number.isFinite(x) ? (x as number) : 0);

const FARBE_LINKS = '#e2e8f0';
const FARBE_RECHTS = '#38bdf8';

/** Spieltage, an denen alle Mitglieder einer Seite gespielt haben - mit den Zeilen je Mitglied. */
function gemeinsam(zeilenJe: Zeile[][]): Map<string, Zeile[]> {
  const raus = new Map<string, Zeile[]>();
  if (!zeilenJe.length || zeilenJe.some((z) => !z.length)) return raus;
  const nach = zeilenJe.map((z) => new Map(z.filter((x) => x.werte && !x.nurEpic).map((x) => [x.windowId, x] as const)));
  for (const [w, z] of nach[0]) {
    const alle = nach.map((m) => m.get(w));
    if (alle.every(Boolean)) raus.set(w, alle as Zeile[]);
  }
  return raus;
}

function summiere(tage: Array<[string, Zeile[]]>): Summe {
  const s: Summe = { matches: 0, elims: 0, damage: 0, genommen: 0, headshots: 0, hits: 0, shots: 0, zeit: 0, builds: 0, mats: 0, reboots: 0, spieltage: 0 };
  for (const [, mitglieder] of tage) {
    s.spieltage += 1;
    s.matches += Math.max(...mitglieder.map((z) => n0(z.werte?.matchesPlayed)));
    for (const z of mitglieder) {
      const w = z.werte ?? {};
      s.elims += n0(w.eliminations); s.damage += n0(w.damageDealt); s.genommen += n0(w.damageTakenFromPlayers);
      s.headshots += n0(w.headshots); s.hits += n0(w.hitsToPlayers); s.shots += n0(w.shots); s.zeit += n0(w.timeAlive);
      s.builds += n0(w.woodBuildsPlaced) + n0(w.stoneBuildsPlaced) + n0(w.metalBuildsPlaced);
      s.mats += n0(w.woodFarmed) + n0(w.stoneFarmed) + n0(w.metalFarmed);
      s.reboots += n0(w.rebootsAndRevives);
    }
  }
  return s;
}

/** Die Zeilen der Tafel: Titel, Wert, Nachkommastellen, "weniger ist besser". */
interface Reihe { key: string; titel: string; wert: (s: Summe) => number; nk: number; weniger?: boolean; suffix?: string }
const REIHEN: Reihe[] = [
  { key: 'elims', titel: 'Eliminierungen', wert: (s) => s.elims, nk: 0 },
  { key: 'damage', titel: 'Schaden', wert: (s) => s.damage, nk: 0 },
  { key: 'quote', titel: 'Schadensquote', wert: (s) => (s.genommen > 0 ? s.damage / s.genommen : 0), nk: 2 },
  { key: 'headshots', titel: 'Kopftreffer', wert: (s) => s.headshots, nk: 0 },
  { key: 'hits', titel: 'Treffer auf Spieler', wert: (s) => s.hits, nk: 0 },
  { key: 'genauigkeit', titel: 'Genauigkeit', wert: (s) => (s.shots > 0 ? (s.hits / s.shots) * 100 : 0), nk: 1, suffix: '%' },
  { key: 'dpm', titel: 'Schaden pro Minute', wert: (s) => (s.zeit > 0 ? s.damage / (s.zeit / 60) : 0), nk: 0 },
  { key: 'tpm', titel: 'Erlittener Schaden pro Minute', wert: (s) => (s.zeit > 0 ? s.genommen / (s.zeit / 60) : 0), nk: 0, weniger: true },
  { key: 'builds', titel: 'Gesetzte Bauteile', wert: (s) => s.builds, nk: 0 },
  { key: 'mats', titel: 'Gesammeltes Material', wert: (s) => s.mats, nk: 0 },
  { key: 'reboots', titel: 'Reboots & Revives', wert: (s) => s.reboots, nk: 0 },
  { key: 'matches', titel: 'Gespielte Matches', wert: (s) => s.matches, nk: 0 },
];

/** Die Achsen des Radars - je Match gerechnet, damit wenige und viele Spieltage vergleichbar bleiben. */
interface Achse { titel: string; wert: (s: Summe) => number }
const ACHSEN: Achse[] = [
  { titel: 'ELIMS', wert: (s) => (s.matches ? s.elims / s.matches : 0) },
  { titel: 'DAMAGE', wert: (s) => (s.matches ? s.damage / s.matches : 0) },
  { titel: 'DMG RATIO', wert: (s) => (s.genommen > 0 ? s.damage / s.genommen : 0) },
  { titel: 'ACCURACY', wert: (s) => (s.shots > 0 ? s.hits / s.shots : 0) },
  { titel: 'HEADSHOTS', wert: (s) => (s.matches ? s.headshots / s.matches : 0) },
  { titel: 'BUILDS', wert: (s) => (s.matches ? s.builds / s.matches : 0) },
  { titel: 'MATS', wert: (s) => (s.matches ? s.mats / s.matches : 0) },
  { titel: 'HITS', wert: (s) => (s.matches ? s.hits / s.matches : 0) },
];

/** Die Kurven der Form: ein Wert je Spieltag. */
interface Kurve { key: string; titel: string; wert: (s: Summe) => number | null; nk: number }
const KURVEN: Kurve[] = [
  { key: 'elims', titel: 'Eliminierungen pro Match', wert: (s) => (s.matches ? s.elims / s.matches : null), nk: 2 },
  { key: 'damage', titel: 'Schaden pro Match', wert: (s) => (s.matches ? s.damage / s.matches : null), nk: 0 },
  { key: 'quote', titel: 'Schadensquote', wert: (s) => (s.genommen > 0 ? s.damage / s.genommen : null), nk: 2 },
];

/* ------------------------------------------------------------------ Spielerwahl */

function Slot({ wer, nr, onWahl, belegt }: { wer: VglSpieler | null; nr: number; onWahl: (s: VglSpieler | null) => void; belegt: Set<string> }) {
  const t = useT();
  const [offen, setOffen] = useState(false);
  const [q, setQ] = useState('');
  const [treffer, setTreffer] = useState<VglSpieler[]>([]);
  const feld = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!offen) return undefined;
    feld.current?.focus();
    const text = q.trim();
    if (text.length < 2) { setTreffer([]); return undefined; }
    let weg = false;
    const uhr = setTimeout(() => {
      fetch(`/api/szene-stats?ansicht=suche&q=${encodeURIComponent(text)}`)
        .then((r) => r.json())
        .then((j) => { if (!weg) setTreffer(Array.isArray(j?.spieler) ? j.spieler.slice(0, 8) : []); })
        .catch(() => { if (!weg) setTreffer([]); });
    }, 220);
    return () => { weg = true; clearTimeout(uhr); };
  }, [q, offen]);

  if (wer) {
    return (
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.1] bg-zinc-900/60 px-3 py-2.5">
        <TeamFlagge groesse={18} laender={[wer.land ?? undefined]} />
        <span className="min-w-0 flex-1 truncate text-sm font-black uppercase tracking-wide text-slate-50">{wer.anzeige}</span>
        <button type="button" onClick={() => onWahl(null)} aria-label={t('Entfernen')}
          className="shrink-0 rounded-md px-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-100">×</button>
      </div>
    );
  }
  return (
    <div className="relative min-w-0">
      {offen ? (
        <input ref={feld} value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setOffen(false), 160)}
          placeholder={t('Spieler suchen …')}
          className="w-full rounded-xl border border-sky-500/60 bg-zinc-900/80 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600" />
      ) : (
        <button type="button" onClick={() => { setOffen(true); setQ(''); }}
          className="w-full rounded-xl border border-dashed border-white/[0.15] bg-white/[0.02] px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-sky-500/60 hover:text-sky-300">
          + {t('Spieler {n}').replace('{n}', String(nr))}
        </button>
      )}
      {offen && treffer.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-white/[0.1] bg-zinc-950 shadow-2xl">
          {treffer.filter((x) => !belegt.has(x.epicId)).map((x) => (
            <button key={x.epicId} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onWahl(x); setOffen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-zinc-900">
              <TeamFlagge groesse={16} laender={[x.land ?? undefined]} />
              <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase text-slate-200">{x.anzeige}</span>
              {x.matches != null && <span className="shrink-0 text-[10px] text-slate-600">{x.matches} <T>Matches</T></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Anzeigen */

function Foto({ s, rechts, klein }: { s: VglSpieler; rechts: boolean; klein: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/[0.1] bg-zinc-900 ${klein ? 'aspect-[3/4] w-[96px] sm:w-[130px]' : 'aspect-[3/4] w-[150px] sm:w-[190px]'}`}>
      {s.bild
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={s.bild} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
        : <span className="absolute inset-0 grid place-items-center text-4xl font-black text-zinc-700">{s.anzeige.slice(0, 1).toUpperCase()}</span>}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
      <span className={`absolute inset-x-0 bottom-0 flex items-center gap-1.5 px-2.5 pb-2 ${rechts ? 'justify-end' : ''}`}>
        <TeamFlagge groesse={14} laender={[s.land ?? undefined]} />
        <span className="min-w-0 truncate text-[11px] font-black uppercase tracking-wide text-slate-50">{s.anzeige}</span>
      </span>
    </div>
  );
}

const fmt = (x: number, nk: number, loc: string) => x.toLocaleString(loc, { minimumFractionDigits: nk, maximumFractionDigits: nk });

function Board({ links, rechts, nameL, nameR, loc }: { links: Summe; rechts: Summe; nameL: string; nameR: string; loc: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/70 px-4 py-5 sm:px-8">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
        <span className="min-w-0 truncate text-lg font-black uppercase tracking-wide text-slate-50 sm:text-2xl">{nameL}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">vs</span>
        <span className="min-w-0 truncate text-right text-lg font-black uppercase tracking-wide text-slate-50 sm:text-2xl">{nameR}</span>
      </div>
      <div className="space-y-3.5">
        {REIHEN.map((r) => {
          const a = r.wert(links); const b = r.wert(rechts);
          const gross = Math.max(a, b, 0.0001);
          // Verglichen wird, was auf der Tafel steht: zwei gleiche Anzeigen sind gleichauf, nicht eine gruen und eine rot.
          const ra = Number(a.toFixed(r.nk)); const rb = Number(b.toFixed(r.nk));
          const vorn = ra === rb ? 0 : ((r.weniger ? ra < rb : ra > rb) ? -1 : 1);
          const farbe = (seite: -1 | 1) => (vorn === 0 ? 'bg-sky-400' : vorn === seite ? 'bg-emerald-400' : 'bg-rose-400');
          const text = (seite: -1 | 1) => (vorn === seite ? 'font-black text-emerald-400' : vorn === 0 ? 'font-bold text-slate-200' : 'font-semibold text-slate-500');
          return (
            <div key={r.key} className="grid grid-cols-[64px_1fr_minmax(88px,160px)_1fr_64px] items-center gap-2 sm:grid-cols-[84px_1fr_minmax(140px,200px)_1fr_84px] sm:gap-3">
              <span className={`text-right text-sm tabular-nums ${text(-1)}`}>{fmt(a, r.nk, loc)}{r.suffix ?? ''}</span>
              <span className="flex h-2 justify-end overflow-hidden rounded-full bg-white/[0.06]">
                <span className={`h-full rounded-full ${farbe(-1)}`} style={{ width: `${(a / gross) * 100}%` }} />
              </span>
              <span className="text-center text-[10px] font-black uppercase leading-tight tracking-[0.14em] text-slate-300"><T>{r.titel}</T></span>
              <span className="flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <span className={`h-full rounded-full ${farbe(1)}`} style={{ width: `${(b / gross) * 100}%` }} />
              </span>
              <span className={`text-left text-sm tabular-nums ${text(1)}`}>{fmt(b, r.nk, loc)}{r.suffix ?? ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Radar({ links, rechts, nameL, nameR }: { links: Summe; rechts: Summe; nameL: string; nameR: string }) {
  const n = ACHSEN.length;
  const R = 130;
  const mitteX = 240;
  const mitteY = 210;
  const punkt = (i: number, anteil: number) => {
    const w = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [mitteX + Math.cos(w) * R * anteil, mitteY + Math.sin(w) * R * anteil] as const;
  };
  // Jede Achse hat ihren eigenen Massstab: der Hoehere erreicht 92 Prozent, der andere sein Verhaeltnis dazu.
  const anteile = ACHSEN.map((a) => {
    const x = a.wert(links); const y = a.wert(rechts); const m = Math.max(x, y, 0.0001);
    return [x / m * 0.92, y / m * 0.92] as const;
  });
  const flaeche = (seite: 0 | 1) => anteile.map((p, i) => punkt(i, Math.max(0.04, p[seite])).join(',')).join(' ');
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/70 px-4 py-5 sm:px-8">
      <div className="mb-2 flex items-center justify-between gap-4 border-b border-white/[0.07] pb-4">
        <span className="min-w-0 truncate text-lg font-black uppercase tracking-wide text-slate-50 sm:text-2xl">{nameL}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">vs</span>
        <span className="min-w-0 truncate text-right text-lg font-black uppercase tracking-wide text-slate-50 sm:text-2xl">{nameR}</span>
      </div>
      <svg viewBox="0 0 480 420" className="mx-auto block w-full max-w-[560px]" role="img" aria-label="Radar">
        {[0.25, 0.5, 0.75, 1].map((s) => (
          <polygon key={s} points={ACHSEN.map((_, i) => punkt(i, s).join(',')).join(' ')} fill="none" stroke="currentColor" className="text-white/[0.1]" strokeWidth="1" />
        ))}
        {ACHSEN.map((a, i) => {
          const [x, y] = punkt(i, 1); const [lx, ly] = punkt(i, 1.17);
          return (
            <g key={a.titel}>
              <line x1={mitteX} y1={mitteY} x2={x} y2={y} stroke="currentColor" className="text-white/[0.08]" />
              <text x={lx} y={ly} textAnchor={Math.abs(lx - mitteX) < 8 ? 'middle' : lx > mitteX ? 'start' : 'end'} dominantBaseline="middle"
                className="fill-slate-300" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1 }}>{a.titel}</text>
            </g>
          );
        })}
        <polygon points={flaeche(1)} fill={FARBE_RECHTS} fillOpacity=".16" stroke={FARBE_RECHTS} strokeWidth="2.4" strokeLinejoin="round" />
        <polygon points={flaeche(0)} fill={FARBE_LINKS} fillOpacity=".1" stroke={FARBE_LINKS} strokeWidth="2.4" strokeLinejoin="round" />
        {anteile.map((p, i) => (
          <g key={ACHSEN[i].titel}>
            <circle cx={punkt(i, Math.max(0.04, p[1]))[0]} cy={punkt(i, Math.max(0.04, p[1]))[1]} r="4" fill={FARBE_RECHTS} />
            <circle cx={punkt(i, Math.max(0.04, p[0]))[0]} cy={punkt(i, Math.max(0.04, p[0]))[1]} r="4" fill={FARBE_LINKS} />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-6 text-[11px] font-bold uppercase tracking-wide text-slate-300">
        <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-5" style={{ background: FARBE_LINKS }} />{nameL}</span>
        <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-5" style={{ background: FARBE_RECHTS }} />{nameR}</span>
      </div>
      <p className="mt-3 text-center text-[10px] text-slate-600"><T>Jede Achse ist auf den Höheren der beiden skaliert; Werte je Match.</T></p>
    </div>
  );
}

interface Punkt { fenster: string; event: string; datum: number; a: number | null; b: number | null }

function Form({ punkte, kurve, setKurve, nameL, nameR, loc }: {
  punkte: Punkt[]; kurve: string; setKurve: (k: string) => void; nameL: string; nameR: string; loc: string;
}) {
  const k = KURVEN.find((x) => x.key === kurve) ?? KURVEN[0];
  const B = 760, H = 300, links = 46, rechts = 16, oben = 18, unten = 34;
  const werte = punkte.flatMap((p) => [p.a, p.b]).filter((x): x is number => x !== null);
  const hoechst = Math.max(...werte, 0.0001) * 1.1;
  const x = (i: number) => links + (punkte.length < 2 ? (B - links - rechts) / 2 : (i / (punkte.length - 1)) * (B - links - rechts));
  const y = (v: number) => oben + (1 - v / hoechst) * (H - oben - unten);
  const linie = (seite: 'a' | 'b') => {
    const teile: string[] = []; let offen = false;
    punkte.forEach((p, i) => {
      const v = p[seite];
      if (v === null) { offen = false; return; }
      teile.push(`${offen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`); offen = true;
    });
    return teile.join(' ');
  };
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/70 px-4 py-5 sm:px-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-4">
        <div className="flex flex-wrap gap-1.5">
          {KURVEN.map((c) => (
            <button key={c.key} type="button" onClick={() => setKurve(c.key)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition ${c.key === k.key ? 'bg-sky-500 text-white' : 'border border-white/10 text-slate-400 hover:text-slate-100'}`}>
              <T>{c.titel}</T>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-wide text-slate-300">
          <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-5" style={{ background: FARBE_LINKS }} />{nameL}</span>
          <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-5" style={{ background: FARBE_RECHTS }} />{nameR}</span>
        </div>
      </div>
      {punkte.length === 0 ? <p className="py-10 text-center text-sm text-slate-500"><T>Keine gemeinsamen Spieltage im gewählten Zeitraum.</T></p> : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${B} ${H}`} className="block w-full min-w-[560px]" role="img" aria-label="Form">
            {[0, 0.25, 0.5, 0.75, 1].map((s) => {
              const wert = hoechst * s;
              return (
                <g key={s}>
                  <line x1={links} x2={B - rechts} y1={y(wert)} y2={y(wert)} stroke="currentColor" className="text-white/[0.07]" />
                  <text x={links - 8} y={y(wert)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500" style={{ fontSize: 10 }}>{fmt(wert, k.nk > 1 ? 1 : 0, loc)}</text>
                </g>
              );
            })}
            <path d={linie('b')} fill="none" stroke={FARBE_RECHTS} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            <path d={linie('a')} fill="none" stroke={FARBE_LINKS} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
            {punkte.map((p, i) => (
              <g key={p.fenster}>
                {p.b !== null && <circle cx={x(i)} cy={y(p.b)} r="3.6" fill={FARBE_RECHTS}><title>{`${p.event}: ${fmt(p.b, k.nk, loc)}`}</title></circle>}
                {p.a !== null && <circle cx={x(i)} cy={y(p.a)} r="3.6" fill={FARBE_LINKS}><title>{`${p.event}: ${fmt(p.a, k.nk, loc)}`}</title></circle>}
              </g>
            ))}
            {punkte.length > 1 && (
              <>
                <text x={links} y={H - 10} className="fill-slate-500" style={{ fontSize: 10 }}>{new Date(punkte[0].datum).toLocaleDateString(loc, { month: 'short', year: 'numeric' })}</text>
                <text x={B - rechts} y={H - 10} textAnchor="end" className="fill-slate-500" style={{ fontSize: 10 }}>{new Date(punkte[punkte.length - 1].datum).toLocaleDateString(loc, { month: 'short', year: 'numeric' })}</text>
              </>
            )}
          </svg>
        </div>
      )}
      <p className="mt-2 text-center text-[10px] text-slate-600"><T>Ein Punkt je gemeinsamem Spieltag - Maus darüber für den Cup.</T></p>
    </div>
  );
}

/* ------------------------------------------------------------------ Die Seite */

type Modus = 'solo' | 'duo' | 'trio';
const ANZAHL: Record<Modus, number> = { solo: 1, duo: 2, trio: 3 };

export default function Vergleich({ saisons, sprache }: { saisons: Array<{ kennung: string; name: string }>; sprache: string }) {
  const t = useT();
  const loc = sprache === 'en' ? 'en-GB' : 'de-DE';
  const [modus, setModus] = useState<Modus>('solo');
  const [links, setLinks] = useState<Array<VglSpieler | null>>([null, null, null]);
  const [rechts, setRechts] = useState<Array<VglSpieler | null>>([null, null, null]);
  const [saison, setSaison] = useState('alle');
  const [ansicht, setAnsicht] = useState<'board' | 'radar' | 'form'>('board');
  const [kurve, setKurve] = useState('elims');
  const [ohne, setOhne] = useState<Set<string>>(new Set());
  const [eventsOffen, setEventsOffen] = useState(false);
  const [daten, setDaten] = useState<Record<string, Zeile[]>>({});
  const [laedt, setLaedt] = useState(false);

  const n = ANZAHL[modus];
  const mitL = links.slice(0, n).filter((x): x is VglSpieler => !!x);
  const mitR = rechts.slice(0, n).filter((x): x is VglSpieler => !!x);
  const beideKomplett = mitL.length === n && mitR.length === n;

  const saisonListe = useMemo(() => saisons.filter((s) => nrVon(s.kennung) >= ERSTE_SAISON).sort((a, b) => nrVon(b.kennung) - nrVon(a.kennung)), [saisons]);

  // Zeilen nachladen: fuer jeden Gewaehlten in der gewaehlten Saison.
  const ids = useMemo(() => [...mitL, ...mitR].map((x) => x.epicId), [mitL, mitR]);
  useEffect(() => {
    const fehlen = ids.filter((id) => !daten[`${id}|${saison}`]);
    if (!fehlen.length) return undefined;
    let weg = false;
    setLaedt(true);
    Promise.all(fehlen.map((id) => fetch(`/api/szene-stats?spieler=${id}&saison=${saison}`).then((r) => r.json()).then((j) => [id, (j?.verlauf ?? []) as Zeile[]] as const).catch(() => [id, [] as Zeile[]] as const)))
      .then((paare) => { if (!weg) setDaten((d) => ({ ...d, ...Object.fromEntries(paare.map(([id, z]) => [`${id}|${saison}`, z])) })); })
      .finally(() => { if (!weg) setLaedt(false); });
    return () => { weg = true; };
  }, [ids, saison, daten]);

  const zeilenVon = useCallback((s: VglSpieler) => (daten[`${s.epicId}|${saison}`] ?? []).filter((z) => nrVon(z.season) >= ERSTE_SAISON), [daten, saison]);
  const tageL = useMemo(() => gemeinsam(mitL.map(zeilenVon)), [mitL, zeilenVon]);
  const tageR = useMemo(() => gemeinsam(mitR.map(zeilenVon)), [mitR, zeilenVon]);

  // Die Cups, die zur Wahl stehen: alle Spieltage, an denen mindestens eine Seite gespielt hat.
  const events = useMemo(() => {
    const m = new Map<string, { windowId: string; event: string; datum: number }>();
    for (const [w, z] of [...tageL, ...tageR]) if (!m.has(w)) m.set(w, { windowId: w, event: z[0].event, datum: z[0].datum ?? 0 });
    return [...m.values()].sort((a, b) => a.datum - b.datum);
  }, [tageL, tageR]);
  const aktiv = (w: string) => !ohne.has(w);

  const summeL = useMemo(() => summiere([...tageL].filter(([w]) => aktiv(w))), [tageL, ohne]); // eslint-disable-line react-hooks/exhaustive-deps
  const summeR = useMemo(() => summiere([...tageR].filter(([w]) => aktiv(w))), [tageR, ohne]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameVon = (s: Array<VglSpieler | null>) => s.slice(0, n).filter(Boolean).map((x) => (x as VglSpieler).anzeige).join(' + ');
  const nameL = nameVon(links); const nameR = nameVon(rechts);

  // Form: je Spieltag, an dem mindestens eine Seite gespielt hat.
  const k = KURVEN.find((x) => x.key === kurve) ?? KURVEN[0];
  const formPunkte: Punkt[] = useMemo(() => events.filter((e) => aktiv(e.windowId)).map((e) => ({
    fenster: e.windowId, event: e.event, datum: e.datum,
    a: tageL.has(e.windowId) ? k.wert(summiere([[e.windowId, tageL.get(e.windowId) as Zeile[]]])) : null,
    b: tageR.has(e.windowId) ? k.wert(summiere([[e.windowId, tageR.get(e.windowId) as Zeile[]]])) : null,
  })), [events, tageL, tageR, k, ohne]); // eslint-disable-line react-hooks/exhaustive-deps

  const zuruecksetzen = () => { setLinks([null, null, null]); setRechts([null, null, null]); setOhne(new Set()); setSaison('alle'); setAnsicht('board'); };
  const tauschen = () => { setLinks(rechts); setRechts(links); };
  const wechsleModus = (m: Modus) => { setModus(m); setOhne(new Set()); };
  const setzeSlot = (seite: 'l' | 'r', i: number, s: VglSpieler | null) => {
    (seite === 'l' ? setLinks : setRechts)((alt) => alt.map((x, j) => (j === i ? s : x)));
    setOhne(new Set());
  };
  const belegt = new Set([...links, ...rechts].filter(Boolean).map((x) => (x as VglSpieler).epicId));

  const knopf = (an: boolean) => `rounded-lg px-4 py-2 text-[11px] font-black uppercase tracking-[0.14em] transition ${an ? 'bg-white text-zinc-900' : 'text-slate-400 hover:text-slate-100'}`;
  const saisonName = saison === 'alle' ? t('Alle Saisons') : (saisonListe.find((s) => s.kennung === saison)?.name ?? saison);
  const hatDaten = beideKomplett && (summeL.matches > 0 || summeR.matches > 0);

  return (
    <div>
      {/* Werkzeugleiste: Cups, Modus, Reset, Saison */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button type="button" onClick={() => setEventsOffen((v) => !v)} disabled={!events.length}
            className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 py-2 text-xs font-bold transition hover:border-sky-500/60 disabled:opacity-50">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Cups</T></span>
            <span className="text-slate-100">{ohne.size ? t('Auswahl') : t('Alle Cups')}</span>
            <span className="tabular-nums text-slate-500">{events.length - [...ohne].filter((w) => events.some((e) => e.windowId === w)).length}/{events.length}</span>
          </button>
          {eventsOffen && (
            <div className="absolute left-0 top-full z-30 mt-1 w-[320px] max-w-[90vw] rounded-xl border border-white/[0.1] bg-zinc-950 p-2 shadow-2xl">
              <div className="mb-1 flex gap-2 px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <button type="button" className="hover:text-sky-300" onClick={() => setOhne(new Set())}><T>Alle</T></button>
                <button type="button" className="hover:text-sky-300" onClick={() => setOhne(new Set(events.map((e) => e.windowId)))}><T>Keine</T></button>
                <button type="button" className="ml-auto hover:text-sky-300" onClick={() => setEventsOffen(false)}>×</button>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {events.map((e) => (
                  <label key={e.windowId} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-300 hover:bg-white/[0.05]">
                    <input type="checkbox" checked={aktiv(e.windowId)} className="accent-sky-500"
                      onChange={() => setOhne((alt) => { const x = new Set(alt); if (x.has(e.windowId)) x.delete(e.windowId); else x.add(e.windowId); return x; })} />
                    <span className="min-w-0 flex-1 truncate">{e.event}</span>
                    {e.datum > 0 && <span className="shrink-0 text-[10px] tabular-nums text-slate-600">{new Date(e.datum).toLocaleDateString(loc, { day: '2-digit', month: '2-digit' })}</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
            {([['solo', 'Solo'], ['duo', 'Duos'], ['trio', 'Trios']] as const).map(([k2, titel]) => (
              <button key={k2} type="button" onClick={() => wechsleModus(k2)} className={knopf(modus === k2)}>{titel}</button>
            ))}
          </div>
          <button type="button" onClick={zuruecksetzen}
            className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-300 transition hover:border-rose-500/60 hover:text-rose-300">Reset</button>
          <label className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 py-1.5 text-xs font-bold">
            <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500"><T>Saison</T></span>
            <select value={saison} onChange={(e) => { setSaison(e.target.value); setOhne(new Set()); }} className="cursor-pointer bg-transparent py-1 text-slate-100 outline-none">
              <option value="alle" className="bg-zinc-900">{t('Alle Saisons')}</option>
              {saisonListe.map((s) => <option key={s.kennung} value={s.kennung} className="bg-zinc-900">{s.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Die Wahl: links und rechts je 1 bis 3 Spieler */}
      <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="space-y-2">{Array.from({ length: n }, (_, i) => <Slot key={`l${i}`} wer={links[i]} nr={i + 1} belegt={belegt} onWahl={(s) => setzeSlot('l', i, s)} />)}</div>
        <button type="button" onClick={tauschen} aria-label={t('Seiten tauschen')} title={t('Seiten tauschen')}
          className="mx-auto hidden h-10 w-10 place-items-center rounded-full border border-white/[0.12] bg-white/[0.04] text-slate-300 transition hover:border-sky-500/60 hover:text-sky-300 md:grid">⇄</button>
        <div className="space-y-2">{Array.from({ length: n }, (_, i) => <Slot key={`r${i}`} wer={rechts[i]} nr={i + 1} belegt={belegt} onWahl={(s) => setzeSlot('r', i, s)} />)}</div>
      </div>

      {!beideKomplett ? (
        <div className="mt-4 grid min-h-[200px] place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 text-center">
          <p className="text-sm text-slate-500">{n === 1 ? t('Wähle auf beiden Seiten einen Spieler.') : t('Wähle auf beiden Seiten alle Spieler des Teams.')}</p>
        </div>
      ) : (
        <>
          {/* Die Fotos oben */}
          <div className="mt-4 flex items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-transparent px-3 py-6 sm:gap-8">
            <div className="flex gap-2">{mitL.map((s) => <Foto key={s.epicId} s={s} rechts={false} klein={n > 1} />)}</div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/[0.15] bg-zinc-950 text-xs font-black tracking-widest text-slate-300">VS</span>
            <div className="flex gap-2">{mitR.map((s) => <Foto key={s.epicId} s={s} rechts klein={n > 1} />)}</div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-black/30 p-1">
              {([['board', 'Board'], ['radar', 'Radar'], ['form', 'Form']] as const).map(([k2, titel]) => (
                <button key={k2} type="button" onClick={() => setAnsicht(k2)} className={knopf(ansicht === k2)}>{titel}</button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">
              {saisonName}
              {laedt && <span className="ml-2 text-sky-400"><T>lädt …</T></span>}
            </span>
          </div>

          <div className="mt-3">
            {!hatDaten && !laedt ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-12 text-center">
                <p className="text-sm text-slate-400">
                  {n === 1 ? t('Mindestens einer der beiden ist im gewählten Zeitraum nicht angetreten.') : t('Dieses Team hat im gewählten Zeitraum nicht zusammen gespielt.')}
                </p>
                <p className="mt-1 text-[11px] text-slate-600"><T>Spielwerte gibt es ab Chapter 5 Season 3. Oben eine andere Saison wählen oder jemand anderen suchen.</T></p>
              </div>
            ) : ansicht === 'board' ? <Board links={summeL} rechts={summeR} nameL={nameL} nameR={nameR} loc={loc} />
              : ansicht === 'radar' ? <Radar links={summeL} rechts={summeR} nameL={nameL} nameR={nameR} />
                : <Form punkte={formPunkte} kurve={kurve} setKurve={setKurve} nameL={nameL} nameR={nameR} loc={loc} />}
          </div>

          {/* Die Platzierungen je Cup, beide nebeneinander */}
          {hatDaten && (
            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-zinc-950/70 px-4 py-5 sm:px-8">
              <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{saisonName} · <T>Platzierungen</T></p>
              <div className="max-h-[420px] overflow-y-auto">
                {events.filter((e) => aktiv(e.windowId)).slice().reverse().map((e) => {
                  const pl = (tage: Map<string, Zeile[]>) => { const z = tage.get(e.windowId)?.[0]; return z?.platz ?? null; };
                  const a = pl(tageL); const b = pl(tageR);
                  const farbe = (x: number | null, y: number | null) => (x === null ? 'text-slate-700' : y === null || x < y ? 'font-black text-emerald-400' : x === y ? 'font-bold text-slate-200' : 'font-semibold text-slate-400');
                  return (
                    <div key={e.windowId} className="grid grid-cols-[56px_1fr_56px] items-center gap-3 border-b border-white/[0.04] py-1.5 last:border-b-0">
                      <span className={`text-right text-sm tabular-nums ${farbe(a, b)}`}>{a === null ? '–' : `${a}.`}</span>
                      <span className="truncate text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">{e.event}</span>
                      <span className={`text-left text-sm tabular-nums ${farbe(b, a)}`}>{b === null ? '–' : `${b}.`}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
