'use client';

/*
 * Die Diagramme des neuen Spielerprofils (Reiter "Stats") und die kleinen
 * Bausteine fuer die Uebersicht.
 *
 * Alle zeichnen sauberes Inline-SVG aus echten Reihen - kein zusaetzliches
 * Chart-Paket (der Betreiber will keine schwere Abhaengigkeit fuer ein paar
 * Kurven). Jede Komponente bekommt bereits aufbereitete Zahlen und gibt
 * nichts aus, wo keine Daten vorliegen: lieber eine Zeile "keine Daten" als
 * eine erfundene Kurve.
 *
 * Farben wie im freigegebenen Entwurf: Himmelblau #38bdf8 als Akzent, tiefes
 * Marineblau als Grund, Mono-Ziffern. Die Klassen (profilneu-*) stehen in
 * design.css.
 */

import { useId } from 'react';

const SKY = '#38bdf8';
const MUT = '#8094ad';
const MUT2 = '#56697f';
const GOLD = '#f6c863';
const POS = '#34d399';
const GRID = 'rgba(120,160,210,.10)';
const MONO = "var(--font-geist-mono), 'JetBrains Mono', monospace";
const FIG = "var(--font-figtree), sans-serif";

/** $452.4K - kurz, fuer Achsen. */
function kurzGeld(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

function leer(text: string) {
  return <p className="py-10 text-center text-[11px] tracking-[0.14em] text-slate-600">{text}</p>;
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

/* ------------------------------------------------- Verdienst ueber die Zeit */

export function EarningsVerlauf({ posten, label }: {
  posten: Array<{ datum: number; betrag: number }>;
  label: string;
}) {
  const gid = useId().replace(/:/g, '');
  const gueltig = posten.filter((p) => p.datum && p.betrag > 0).sort((a, b) => a.datum - b.datum);
  if (gueltig.length < 2) return leer('Zu wenige Preisgeld-Daten.');

  // Nach Monat buendeln.
  const proMonat = new Map<string, number>();
  for (const p of gueltig) {
    const d = new Date(p.datum);
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    proMonat.set(k, (proMonat.get(k) ?? 0) + p.betrag);
  }
  // Luecken fuellen, damit die Zeitachse stimmt.
  const keys = [...proMonat.keys()].sort();
  const [y0, m0] = keys[0].split('-').map(Number);
  const [y1, m1] = keys[keys.length - 1].split('-').map(Number);
  const reihe: Array<{ k: string; v: number; jahr: number }> = [];
  for (let y = y0, m = m0; y < y1 || (y === y1 && m <= m1);) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    reihe.push({ k, v: proMonat.get(k) ?? 0, jahr: y });
    m++; if (m > 12) { m = 1; y++; }
  }

  const W = 1312, H = 300, L = 58, R = 14, T = 18, B = 34;
  const max = Math.max(...reihe.map((r) => r.v), 1);
  const stufe = max <= 20000 ? 5000 : max <= 60000 ? 20000 : max <= 200000 ? 50000 : 100000;
  const obergrenze = Math.ceil(max / stufe) * stufe;
  const x = (i: number) => L + (i / Math.max(1, reihe.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / obergrenze) * (H - T - B);

  const linie = reihe.map((r, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(r.v).toFixed(1)}`).join(' ');
  const flaeche = `${linie} L${x(reihe.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const gitter: number[] = [];
  for (let v = 0; v <= obergrenze + 1; v += stufe) gitter.push(v);
  // Jahresmarken.
  const jahre = [...new Set(reihe.map((r) => r.jahr))];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`eg${gid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={SKY} stopOpacity="0.42" />
          <stop offset="1" stopColor={SKY} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gitter.map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={GRID} />
          <text x={L - 10} y={y(v) + 4} textAnchor="end" fill={MUT2} fontSize="11" fontFamily={MONO}>{kurzGeld(v)}</text>
        </g>
      ))}
      {jahre.map((j) => {
        const idx = reihe.findIndex((r) => r.jahr === j);
        const mitte = reihe.reduce((a, r, i) => r.jahr === j ? { s: a.s + i, n: a.n + 1 } : a, { s: 0, n: 0 });
        return (
          <g key={j}>
            {idx > 0 && <line x1={x(idx)} y1={T} x2={x(idx)} y2={H - B} stroke="rgba(120,160,210,.16)" strokeDasharray="3 4" />}
            <text x={x(mitte.s / Math.max(1, mitte.n))} y={H - 10} textAnchor="middle" fill={MUT} fontSize="12" fontWeight="700" fontFamily={FIG} letterSpacing="2">{j}</text>
          </g>
        );
      })}
      <path d={flaeche} fill={`url(#eg${gid})`} />
      <path d={linie} fill="none" stroke={SKY} strokeWidth="2.4" strokeLinejoin="round" />
      {reihe.map((r, i) => r.v > 0 ? (
        <circle key={i} cx={x(i)} cy={y(r.v)} r="3.2" fill={SKY} stroke="#070b14" strokeWidth="1.5">
          <title>{`${r.k}: ${kurzGeld(r.v)}`}</title>
        </circle>
      ) : null)}
    </svg>
  );
}

/* --------------------------------------------- Platzierungs-Verteilung (Histogramm) */

export function PlatzVerteilung({ platzierungen, label }: { platzierungen: number[]; label: string }) {
  const p = platzierungen.filter((x) => x > 0);
  if (!p.length) return leer('Keine Platzierungen erfasst.');
  const eimer: Array<[string, (x: number) => boolean, string]> = [
    ['SIEG #1', (x) => x === 1, SKY],
    ['TOP 3', (x) => x >= 2 && x <= 3, SKY],
    ['TOP 5', (x) => x >= 4 && x <= 5, '#59c6f5'],
    ['TOP 10', (x) => x >= 6 && x <= 10, '#7dd3fc'],
    ['TOP 25', (x) => x >= 11 && x <= 25, '#4a6b86'],
    ['25+', (x) => x > 25, '#3a5370'],
  ];
  const werte = eimer.map(([l, f, c]) => [l, p.filter(f).length, c] as [string, number, string]);
  const W = 612, H = 286, L = 30, R = 14, T = 16, B = 46;
  const max = Math.max(...werte.map((w) => w[1]), 1);
  const stufe = max <= 10 ? 5 : max <= 30 ? 10 : max <= 60 ? 20 : 50;
  const obergrenze = Math.max(stufe, Math.ceil(max / stufe) * stufe);
  const breite = (W - L - R) / werte.length;
  const barB = breite * 0.62;
  const y = (v: number) => T + (1 - v / obergrenze) * (H - T - B);
  const gitter: number[] = [];
  for (let v = 0; v <= obergrenze + 1; v += stufe) gitter.push(v);
  const top10 = Math.round((p.filter((x) => x <= 10).length / p.length) * 100);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={label}>
      {gitter.map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke={GRID} />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" fill={MUT2} fontSize="10.5" fontFamily={MONO}>{v}</text>
        </g>
      ))}
      {werte.map(([l, v, c], i) => {
        const cx = L + breite * i + (breite - barB) / 2;
        return (
          <g key={l}>
            <rect x={cx} y={y(v)} width={barB} height={Math.max(0, y(0) - y(v))} rx="2" fill={c} />
            <text x={cx + barB / 2} y={y(v) - 7} textAnchor="middle" fill="#e6eefb" fontSize="13" fontWeight="700" fontFamily={MONO}>{v}</text>
            <text x={cx + barB / 2} y={H - 26} textAnchor="middle" fill={MUT} fontSize="11" fontWeight="700" fontFamily={FIG} letterSpacing="1">{l}</text>
          </g>
        );
      })}
      <text x={L} y={H - 6} fill={MUT2} fontSize="10.5" fontFamily={MONO}>{`n = ${p.length} · ${top10}% Top-10`}</text>
    </svg>
  );
}

/* ----------------------------------------------- Elims je Match - Verlauf */

export function ElimsVerlauf({ serie, label }: {
  serie: Array<{ label: string; wert: number }>;
  label: string;
}) {
  const gid = useId().replace(/:/g, '');
  const s = serie.filter((x) => Number.isFinite(x.wert));
  if (s.length < 2) return leer('Zu wenige Spieltage mit Werten.');
  const W = 612, H = 286, L = 46, R = 14, T = 16, B = 40;
  const werte = s.map((x) => x.wert);
  const min = Math.min(...werte), max = Math.max(...werte);
  const pad = Math.max(1, (max - min) * 0.2);
  const u = Math.max(0, min - pad), o = max + pad;
  const avg = werte.reduce((a, b) => a + b, 0) / werte.length;
  const x = (i: number) => L + (i / Math.max(1, s.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - u) / Math.max(0.01, o - u)) * (H - T - B);
  const linie = s.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.wert).toFixed(1)}`).join(' ');
  const flaeche = `${linie} L${x(s.length - 1).toFixed(1)} ${(H - B).toFixed(1)} L${x(0).toFixed(1)} ${(H - B).toFixed(1)} Z`;
  const trend = werte[werte.length - 1] - werte[0];
  const ticks = 5;
  const gitter = Array.from({ length: ticks }, (_, i) => u + ((o - u) * i) / (ticks - 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`el${gid}`} x1="0" x2="0" y1="0" y2="1">
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
      <text x={W - R} y={y(avg) - 6} textAnchor="end" fill={GOLD} fontSize="10.5" fontFamily={MONO}>{`avg ${avg.toFixed(1)}`}</text>
      <path d={flaeche} fill={`url(#el${gid})`} />
      <path d={linie} fill="none" stroke={SKY} strokeWidth="2.2" strokeLinejoin="round" />
      {s.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.wert)} r="2.8" fill={SKY} stroke="#070b14" strokeWidth="1.3">
          <title>{`${p.label}: ${p.wert.toFixed(1)}`}</title>
        </circle>
      ))}
      <text x={L} y={H - 6} fill={MUT2} fontSize="10.5" fontFamily={MONO}>{`${s.length} Spieltage`}</text>
      <text x={W - R} y={H - 6} textAnchor="end" fill={trend >= 0 ? POS : '#f87171'} fontSize="10.5" fontFamily={MONO}>
        {`${trend >= 0 ? '▲' : '▼'} ${trend >= 0 ? '+' : ''}${trend.toFixed(1)} Trend`}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------ Radar */

export function SpielerRadar({ achsen, label }: {
  achsen: Array<{ label: string; wert: number }>;
  label: string;
}) {
  const a = achsen.filter((x) => Number.isFinite(x.wert));
  if (a.length < 3) return leer('Zu wenige Perzentile.');
  const W = 612, H = 300, cx = 276, cy = 156, R = 108;
  const n = a.length;
  const winkel = (i: number) => (-Math.PI / 2) + (i / n) * Math.PI * 2;
  const punkt = (i: number, r: number) => [cx + Math.cos(winkel(i)) * r, cy + Math.sin(winkel(i)) * r] as const;
  const ringe = [0.25, 0.5, 0.75, 1];
  const poly = (r: number | ((i: number) => number)) =>
    a.map((_, i) => punkt(i, typeof r === 'function' ? r(i) : r * R).map((v) => v.toFixed(1)).join(',')).join(' ');
  const daten = poly((i) => (Math.max(0, Math.min(100, a[i].wert)) / 100) * R);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} role="img" aria-label={label}>
      {ringe.map((r) => <polygon key={r} points={poly(r)} fill="none" stroke="rgba(120,160,210,.13)" />)}
      {a.map((_, i) => {
        const [px, py] = punkt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={px.toFixed(1)} y2={py.toFixed(1)} stroke="rgba(120,160,210,.13)" />;
      })}
      <polygon points={daten} fill="rgba(56,189,248,.22)" stroke={SKY} strokeWidth="2" />
      {a.map((ax, i) => {
        const [dx, dy] = punkt(i, (Math.max(0, Math.min(100, ax.wert)) / 100) * R);
        const [lx, ly] = punkt(i, R + 26);
        const anchor = Math.abs(lx - cx) < 20 ? 'middle' : lx > cx ? 'start' : 'end';
        return (
          <g key={ax.label}>
            <circle cx={dx.toFixed(1)} cy={dy.toFixed(1)} r="3" fill={SKY} />
            <text x={lx.toFixed(1)} y={(ly - 4).toFixed(1)} textAnchor={anchor} fill={MUT} fontSize="11" fontWeight="700" fontFamily={FIG} letterSpacing="1">{ax.label}</text>
            <text x={lx.toFixed(1)} y={(ly + 9).toFixed(1)} textAnchor={anchor} fill={SKY} fontSize="11" fontFamily={MONO}>{Math.round(ax.wert)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------------------------------------------------- Index-Balken */

export function IndexBalken({ achsen }: { achsen: Array<{ label: string; wert: number }> }) {
  const a = achsen.filter((x) => Number.isFinite(x.wert));
  if (!a.length) return leer('Keine Perzentile.');
  return (
    <div className="py-1.5">
      {a.map((ax) => (
        <div key={ax.label} className="profilneu-ibar">
          <div className="profilneu-ibar-l">{ax.label}</div>
          <div className="profilneu-ibar-track"><div style={{ width: `${Math.max(0, Math.min(100, ax.wert))}%` }} /></div>
          <div className="profilneu-ibar-v">{Math.round(ax.wert)}</div>
        </div>
      ))}
    </div>
  );
}
