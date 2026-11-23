'use client';

/*
 * Die Diagramme des neuen Spielerprofils (Reiter "Statistik") und die kleinen
 * Bausteine fuer die Uebersicht.
 *
 * Alle zeichnen sauberes Inline-SVG aus echten Reihen - kein zusaetzliches
 * Chart-Paket. Jeder Punkt und jeder Balken zeigt beim Ueberfahren ein
 * Fenster: um welchen Cup/welches Event es geht, wann er lief und der Wert
 * (Betreiber, 22.11.2026: "wenn ich auf einen Punkt gehe, will ich sehen,
 * wofuer der ist, welcher Cup"). Wo keine Daten vorliegen, wird nichts
 * gezeichnet und nichts erfunden.
 *
 * Farben wie im freigegebenen Entwurf; Mono-Ziffern. Die Klassen (profilneu-*)
 * stehen in app/design.css.
 */

import { useState, type ReactNode } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';

const SKY = '#38bdf8';
const MUT = '#8094ad';
const MUT2 = '#56697f';
const GOLD = '#f6c863';
const POS = '#34d399';
const GRID = 'rgba(120,160,210,.10)';
const MONO = "var(--font-geist-mono), 'JetBrains Mono', monospace";
const FIG = "var(--font-figtree), sans-serif";

function ortVon(s: 'de' | 'en') { return s === 'en' ? 'en-US' : 'de-DE'; }
function geld(n: number, s: 'de' | 'en') { return `$${Math.round(n).toLocaleString(ortVon(s))}`; }
function kurzGeld(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}
function datumText(ms: number, s: 'de' | 'en') {
  return ms ? new Date(ms).toLocaleDateString(ortVon(s), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function leer(text: string) {
  return <p className="py-10 text-center text-[11px] tracking-[0.14em] text-slate-600"><T>{text}</T></p>;
}

/* Ein schwebendes Fenster ueber einem Punkt/Balken - prozentual gesetzt, wie bei den anderen Kurven. */
function Fenster({ xPct, yPct, children }: { xPct: number; yPct: number; children: ReactNode }) {
  const waagerecht = xPct < 16 ? '0' : xPct > 84 ? '-100%' : '-50%';
  const unten = yPct < 32;
  return (
    <div className="pointer-events-none absolute z-20 w-52 rounded-xl border border-zinc-700 bg-zinc-950/95 px-3 py-2 shadow-xl"
      style={{ left: `${xPct}%`, top: `${yPct}%`, transform: `translate(${waagerecht}, ${unten ? '14px' : 'calc(-100% - 14px)'})` }}>
      {children}
    </div>
  );
}

/* ----------------------------------------------------- Sparkline (Kacheln) */

export function Spark({ werte, hot = false }: { werte: number[]; hot?: boolean }) {
  if (!werte.length) return <div className="profilneu-spark" />;
  const max = Math.max(...werte, 1);
  return (
    <div className="profilneu-spark">
      {werte.map((w, i) => (
        <i key={i} className={hot && i === werte.length - 1 ? 'hot' : ''}
          style={{ height: `${Math.max(8, Math.round((w / max) * 100))}%` }} />
      ))}
    </div>
  );
}

/* ------------------------------------------------- Verdienst ueber die Zeit (kumulativ) */

export function EarningsVerlauf({ posten }: {
  posten: Array<{ datum: number; betrag: number; event: string }>;
}) {
  const { sprache } = useSprache();
  const [aktiv, setAktiv] = useState<number | null>(null);
  const gueltig = posten.filter((p) => p.datum && p.betrag > 0).sort((a, b) => a.datum - b.datum);
  if (gueltig.length < 2) return leer('Zu wenige Preisgeld-Daten.');

  // Kumulativ: die Summe waechst von links nach rechts - immer lesbar, kein flacher Strich mit einer Spitze.
  const pkt: Array<{ datum: number; betrag: number; event: string; kum: number }> = [];
  let run = 0;
  for (const p of gueltig) { run += p.betrag; pkt.push({ ...p, kum: run }); }
  const total = run;

  const W = 1312, H = 300, L = 62, R = 16, MT = 18, B = 34;
  const t0 = pkt[0].datum, t1 = pkt[pkt.length - 1].datum;
  const spanne = Math.max(1, t1 - t0);
  const x = (ms: number) => L + ((ms - t0) / spanne) * (W - L - R);
  const stufe = total <= 50000 ? 10000 : total <= 200000 ? 50000 : total <= 1_000_000 ? 200000 : 500000;
  const obergrenze = Math.max(stufe, Math.ceil(total / stufe) * stufe);
  const y = (v: number) => MT + (1 - v / obergrenze) * (H - MT - B);

  const linie = pkt.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.datum).toFixed(1)} ${y(p.kum).toFixed(1)}`).join(' ');
  const flaeche = `${linie} L${x(t1).toFixed(1)} ${y(0).toFixed(1)} L${x(t0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const gitter: number[] = [];
  for (let v = 0; v <= obergrenze + 1; v += stufe) gitter.push(v);
  // Jahresgitter: senkrechte Linie zum 1. Januar jedes Jahres im Zeitraum.
  const j0 = new Date(t0).getUTCFullYear(), j1 = new Date(t1).getUTCFullYear();
  const jahre: Array<{ jahr: number; ms: number }> = [];
  for (let j = j0; j <= j1; j++) jahre.push({ jahr: j, ms: Date.UTC(j, 0, 1) });

  const a = aktiv !== null ? pkt[aktiv] : null;
  return (
    <div className="relative">
      {a && (
        <Fenster xPct={Math.min(92, Math.max(8, (x(a.datum) / W) * 100))} yPct={(y(a.kum) / H) * 100}>
          <p className="truncate text-xs font-bold text-slate-100">{a.event}</p>
          {a.datum > 0 && <p className="mt-0.5 text-[10px] text-slate-500">{datumText(a.datum, sprache)}</p>}
          <p className="mt-1.5 text-[11px]"><span className="font-bold tabular-nums text-emerald-400">+{geld(a.betrag, sprache)}</span> <span className="text-slate-500"><T>dieser Cup</T></span></p>
          <p className="text-[10px] tabular-nums text-slate-400">{geld(a.kum, sprache)} <T>gesamt bis hier</T></p>
        </Fenster>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Preisgeld">
        <defs>
          <linearGradient id="egrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SKY} stopOpacity="0.42" /><stop offset="1" stopColor={SKY} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gitter.map((v) => (
          <g key={v}>
            <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={GRID} />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fill={MUT2} fontSize="11" fontFamily={MONO}>{kurzGeld(v)}</text>
          </g>
        ))}
        {jahre.map(({ jahr, ms }) => {
          const px = x(Math.max(t0, ms));
          return (
            <g key={jahr}>
              {ms > t0 && <line x1={px} y1={MT} x2={px} y2={H - B} stroke="rgba(120,160,210,.16)" strokeDasharray="3 4" />}
              <text x={Math.max(px, L + 2)} y={H - 10} textAnchor={ms > t0 ? 'middle' : 'start'} fill={MUT} fontSize="12" fontWeight="700" fontFamily={FIG} letterSpacing="2">{jahr}</text>
            </g>
          );
        })}
        <path d={flaeche} fill="url(#egrad)" />
        <path d={linie} fill="none" stroke={SKY} strokeWidth="2.4" strokeLinejoin="round" />
        {aktiv !== null && <line x1={x(pkt[aktiv].datum)} y1={MT} x2={x(pkt[aktiv].datum)} y2={H - B} stroke={SKY} strokeOpacity="0.35" strokeDasharray="3 4" />}
        {pkt.map((p, i) => (
          <circle key={i} cx={x(p.datum)} cy={y(p.kum)} r={aktiv === i ? 5 : 3} fill={SKY} stroke="#070b14" strokeWidth="1.5" />
        ))}
        {/* grosse unsichtbare Greifflaechen */}
        {pkt.map((p, i) => (
          <circle key={`g${i}`} cx={x(p.datum)} cy={y(p.kum)} r="16" fill="transparent"
            onMouseEnter={() => setAktiv(i)} onMouseLeave={() => setAktiv(null)} />
        ))}
      </svg>
    </div>
  );
}

/* --------------------------------------------- Platzierungs-Verteilung (Histogramm) */

export function PlatzVerteilung({ platzierungen }: { platzierungen: number[] }) {
  const { sprache } = useSprache();
  const [aktiv, setAktiv] = useState<number | null>(null);
  const p = platzierungen.filter((x) => x > 0);
  if (!p.length) return leer('Keine Platzierungen erfasst.');
  const eimer: Array<[string, (x: number) => boolean, string]> = [
    ['Sieg #1', (x) => x === 1, SKY],
    ['Top 3', (x) => x >= 2 && x <= 3, SKY],
    ['Top 5', (x) => x >= 4 && x <= 5, '#59c6f5'],
    ['Top 10', (x) => x >= 6 && x <= 10, '#7dd3fc'],
    ['Top 25', (x) => x >= 11 && x <= 25, '#4a6b86'],
    ['25+', (x) => x > 25, '#3a5370'],
  ];
  const werte = eimer.map(([l, f, c]) => [l, p.filter(f).length, c] as [string, number, string]);
  const W = 612, H = 286, L = 30, R = 14, MT = 16, B = 46;
  const max = Math.max(...werte.map((w) => w[1]), 1);
  const stufe = max <= 10 ? 5 : max <= 30 ? 10 : max <= 60 ? 20 : 50;
  const obergrenze = Math.max(stufe, Math.ceil(max / stufe) * stufe);
  const breite = (W - L - R) / werte.length;
  const barB = breite * 0.62;
  const y = (v: number) => MT + (1 - v / obergrenze) * (H - MT - B);
  const gitter: number[] = [];
  for (let v = 0; v <= obergrenze + 1; v += stufe) gitter.push(v);
  const top10 = Math.round((p.filter((x) => x <= 10).length / p.length) * 100);
  const a = aktiv !== null ? werte[aktiv] : null;

  return (
    <div className="relative">
      {a && (
        <Fenster xPct={((L + breite * aktiv! + breite / 2) / W) * 100} yPct={(y(a[1]) / H) * 100}>
          <p className="text-xs font-bold text-slate-100">{a[0]}</p>
          <p className="mt-1 text-[11px]"><span className="font-bold tabular-nums text-sky-400">{a[1]}</span> <span className="text-slate-500">{a[1] === 1 ? 'Event' : 'Events'}</span> · <span className="tabular-nums text-slate-400">{Math.round((a[1] / p.length) * 100)}%</span></p>
        </Fenster>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Platzierungen">
        {gitter.map((v) => (
          <g key={v}>
            <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={GRID} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fill={MUT2} fontSize="10.5" fontFamily={MONO}>{v}</text>
          </g>
        ))}
        {werte.map(([l, v, c], i) => {
          const cx = L + breite * i + (breite - barB) / 2;
          return (
            <g key={l} onMouseEnter={() => setAktiv(i)} onMouseLeave={() => setAktiv(null)}>
              <rect x={L + breite * i} y={MT} width={breite} height={H - MT - B} fill="transparent" />
              <rect x={cx} y={y(v)} width={barB} height={Math.max(0, y(0) - y(v))} rx="2" fill={c} opacity={aktiv === null || aktiv === i ? 1 : 0.5} />
              <text x={cx + barB / 2} y={y(v) - 7} textAnchor="middle" fill="#e6eefb" fontSize="13" fontWeight="700" fontFamily={MONO}>{v}</text>
              <text x={cx + barB / 2} y={H - 26} textAnchor="middle" fill={MUT} fontSize="11" fontWeight="700" fontFamily={FIG} letterSpacing="1">{l.toUpperCase()}</text>
            </g>
          );
        })}
        <text x={L} y={H - 6} fill={MUT2} fontSize="10.5" fontFamily={MONO}>{`n = ${p.length} ${sprache === 'en' ? 'events' : 'Events'} · ${top10}% Top-10`}</text>
      </svg>
    </div>
  );
}

/* ----------------------------------------------- Elims je Match - Verlauf */

export function ElimsVerlauf({ serie }: {
  serie: Array<{ event: string; datum: number; wert: number }>;
}) {
  const { sprache } = useSprache();
  const [aktiv, setAktiv] = useState<number | null>(null);
  const s = serie.filter((x) => Number.isFinite(x.wert));
  if (s.length < 2) return leer('Zu wenige Spieltage mit Werten.');
  const W = 612, H = 286, L = 46, R = 14, MT = 16, B = 40;
  const werte = s.map((x) => x.wert);
  const min = Math.min(...werte), max = Math.max(...werte);
  const pad = Math.max(1, (max - min) * 0.2);
  const u = Math.max(0, min - pad), o = max + pad;
  const avg = werte.reduce((a, b) => a + b, 0) / werte.length;
  const x = (i: number) => L + (i / Math.max(1, s.length - 1)) * (W - L - R);
  const y = (v: number) => MT + (1 - (v - u) / Math.max(0.01, o - u)) * (H - MT - B);
  const linie = s.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.wert).toFixed(1)}`).join(' ');
  const flaeche = `${linie} L${x(s.length - 1).toFixed(1)} ${(H - B).toFixed(1)} L${x(0).toFixed(1)} ${(H - B).toFixed(1)} Z`;
  const trend = werte[werte.length - 1] - werte[0];
  const gitter = Array.from({ length: 5 }, (_, i) => u + ((o - u) * i) / 4);
  const a = aktiv !== null ? s[aktiv] : null;

  return (
    <div className="relative">
      {a && (
        <Fenster xPct={Math.min(92, Math.max(8, (x(aktiv!) / W) * 100))} yPct={(y(a.wert) / H) * 100}>
          <p className="truncate text-xs font-bold text-slate-100">{a.event}</p>
          {a.datum > 0 && <p className="mt-0.5 text-[10px] text-slate-500">{datumText(a.datum, sprache)}</p>}
          <p className="mt-1.5 text-[11px]"><span className="font-bold tabular-nums text-sky-400">{a.wert.toFixed(1)}</span> <span className="text-slate-500"><T>Elims je Match</T></span></p>
          <p className="text-[10px] tabular-nums text-slate-500"><T>Schnitt</T> {avg.toFixed(1)}</p>
        </Fenster>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Elims je Match">
        <defs>
          <linearGradient id="elgrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SKY} stopOpacity="0.30" /><stop offset="1" stopColor={SKY} stopOpacity="0.015" />
          </linearGradient>
        </defs>
        {gitter.map((v, i) => (
          <g key={i}>
            <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={GRID} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fill={MUT2} fontSize="10.5" fontFamily={MONO}>{v.toFixed(1)}</text>
          </g>
        ))}
        <line x1={L} y1={y(avg)} x2={W - R} y2={y(avg)} stroke={GOLD} strokeWidth="1.3" strokeDasharray="5 4" opacity="0.8" />
        <text x={W - R} y={y(avg) - 6} textAnchor="end" fill={GOLD} fontSize="10.5" fontFamily={MONO}>{`${sprache === 'en' ? 'avg' : 'Ø'} ${avg.toFixed(1)}`}</text>
        <path d={flaeche} fill="url(#elgrad)" />
        <path d={linie} fill="none" stroke={SKY} strokeWidth="2.2" strokeLinejoin="round" />
        {aktiv !== null && <line x1={x(aktiv)} y1={MT} x2={x(aktiv)} y2={H - B} stroke={SKY} strokeOpacity="0.35" strokeDasharray="3 4" />}
        {s.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.wert)} r={aktiv === i ? 4.4 : 2.8} fill={SKY} stroke="#070b14" strokeWidth="1.3" />)}
        {s.map((p, i) => <circle key={`g${i}`} cx={x(i)} cy={y(p.wert)} r="14" fill="transparent" onMouseEnter={() => setAktiv(i)} onMouseLeave={() => setAktiv(null)} />)}
        <text x={L} y={H - 6} fill={MUT2} fontSize="10.5" fontFamily={MONO}>{`${s.length} ${sprache === 'en' ? 'match days' : 'Spieltage'}`}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fill={trend >= 0 ? POS : '#f87171'} fontSize="10.5" fontFamily={MONO}>
          {`${trend >= 0 ? '▲' : '▼'} ${trend >= 0 ? '+' : ''}${trend.toFixed(1)}`}
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------ Radar */

export function SpielerRadar({ achsen }: {
  achsen: Array<{ label: string; wert: number }>;
}) {
  const { sprache } = useSprache();
  const [aktiv, setAktiv] = useState<number | null>(null);
  const a = achsen.filter((x) => Number.isFinite(x.wert));
  if (a.length < 3) return leer('Zu wenige Perzentile.');
  const W = 612, H = 320, cx = 306, cy = 150, R = 104;
  const n = a.length;
  const winkel = (i: number) => (-Math.PI / 2) + (i / n) * Math.PI * 2;
  const punkt = (i: number, r: number) => [cx + Math.cos(winkel(i)) * r, cy + Math.sin(winkel(i)) * r] as const;
  const ringe = [0.25, 0.5, 0.75, 1];
  const poly = (r: number | ((i: number) => number)) =>
    a.map((_, i) => punkt(i, typeof r === 'function' ? r(i) : r * R).map((v) => v.toFixed(1)).join(',')).join(' ');
  const daten = poly((i) => (Math.max(0, Math.min(100, a[i].wert)) / 100) * R);
  const akt = aktiv !== null ? a[aktiv] : null;

  return (
    <div className="relative">
      {akt && (() => {
        const [px, py] = punkt(aktiv!, (Math.max(0, Math.min(100, akt.wert)) / 100) * R);
        return (
          <Fenster xPct={(px / W) * 100} yPct={(py / H) * 100}>
            <p className="text-xs font-bold text-slate-100"><T>{akt.label}</T></p>
            <p className="mt-1 text-[11px] text-slate-400">{sprache === 'en' ? `Better than ${Math.round(akt.wert)}% of players` : `Besser als ${Math.round(akt.wert)} % der Spieler`}</p>
          </Fenster>
        );
      })()}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label="Staerkenprofil">
        {ringe.map((r) => <polygon key={r} points={poly(r)} fill="none" stroke="rgba(120,160,210,.13)" />)}
        {a.map((_, i) => { const [px, py] = punkt(i, R); return <line key={i} x1={cx} y1={cy} x2={px.toFixed(1)} y2={py.toFixed(1)} stroke="rgba(120,160,210,.13)" />; })}
        <polygon points={daten} fill="rgba(56,189,248,.22)" stroke={SKY} strokeWidth="2" />
        {a.map((ax, i) => {
          const [dx, dy] = punkt(i, (Math.max(0, Math.min(100, ax.wert)) / 100) * R);
          const [lx, ly] = punkt(i, R + 30);
          const anchor = Math.abs(lx - cx) < 24 ? 'middle' : lx > cx ? 'start' : 'end';
          return (
            <g key={ax.label} onMouseEnter={() => setAktiv(i)} onMouseLeave={() => setAktiv(null)}>
              <circle cx={dx.toFixed(1)} cy={dy.toFixed(1)} r={aktiv === i ? 5 : 3} fill={SKY} />
              <circle cx={dx.toFixed(1)} cy={dy.toFixed(1)} r="14" fill="transparent" />
              <text x={lx.toFixed(1)} y={(ly - 3).toFixed(1)} textAnchor={anchor} fill={MUT} fontSize="11.5" fontWeight="700" fontFamily={FIG} letterSpacing="0.5">
                {sprache === 'en' ? ({ 'Eliminierungen': 'Eliminations', 'Schaden': 'Damage', 'Trefferquote': 'Accuracy', 'Überleben': 'Survival', 'Schadensquote': 'Damage ratio' } as Record<string, string>)[ax.label] ?? ax.label : ax.label}
              </text>
              <text x={lx.toFixed(1)} y={(ly + 11).toFixed(1)} textAnchor={anchor} fill={SKY} fontSize="11" fontFamily={MONO}>{Math.round(ax.wert)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* -------------------------------------- Perzentile in Klartext (Balken) */

export function IndexBalken({ achsen }: { achsen: Array<{ label: string; wert: number }> }) {
  const { sprache } = useSprache();
  const a = achsen.filter((x) => Number.isFinite(x.wert));
  if (!a.length) return leer('Keine Perzentile.');
  return (
    <div className="py-1.5">
      {a.map((ax) => (
        <div key={ax.label} className="profilneu-ibar">
          <div className="profilneu-ibar-l"><T>{ax.label}</T></div>
          <div className="profilneu-ibar-track"><div style={{ width: `${Math.max(0, Math.min(100, ax.wert))}%` }} /></div>
          <div className="profilneu-ibar-v" style={{ whiteSpace: 'nowrap' }}>
            {sprache === 'en' ? `top ${Math.max(1, 100 - Math.round(ax.wert))}%` : `Top ${Math.max(1, 100 - Math.round(ax.wert))} %`}
          </div>
        </div>
      ))}
    </div>
  );
}
