'use client';

/*
 * Placement Progression (Betreiber, 15.11.2026): wie sich die besten zehn Teams Spiel fuer Spiel in der Wertung bewegt haben - Linien (Platz nach Spiel 1, 2, ...),
 * darunter die Tabelle je Spiel (Platz im Match, Punkte, Stand) und "Top 10 als CSV".
 *
 * Punkte je Spiel: Epics eigene Punkte je Match (punktePlatz + punkteElim aus /api/cup-leaderboard), sonst aus der Wertung des Cups (preise.wertung). Der Stand nach Spiel k ist der Platz unter allen
 * geladenen Teams nach ihrem k-ten Spiel. Gezeigt wird nur, wenn die Summe dieser Punkte fuer die zehn Teams genau Epics Punkte ergibt - sonst passt die Wertung
 * nicht (z. B. Spielzahl-Grenze, Sonderregeln), und eine erfundene Kurve waere schlechter als keine.
 */

import { useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useSprache } from '@/app/components/SprachProvider';
import { ortVon } from '@/app/lib/ort';

interface Match { placement?: number; elims?: number; endTime?: string; punktePlatz?: number; punkteElim?: number }
interface Team { rank: number; points: number; players: Array<{ id: string; name: string }>; matches: Match[]; matchesWeg?: boolean }
interface Regel { was: string; schwelle: number; regel: string; punkte: number; jeStueck: boolean }

/** Punkte eines Spiels nach Epics Regeln: jede erreichte Platz-Schwelle zaehlt, Elims je Stueck oder als Schwelle. */
export function spielPunkte(m: Match, wertung: Regel[]): number {
  // Epics eigene Punkte je Match (lib/epicCups: punktePlatz, punkteElim), wo die Bestenliste sie fuehrt - sonst aus der Wertung des Cups.
  if (typeof m.punktePlatz === 'number' || typeof m.punkteElim === 'number') return (m.punktePlatz ?? 0) + (m.punkteElim ?? 0);
  let p = 0;
  for (const r of wertung) {
    if (r.was === 'Placement' && r.regel === 'lte' && typeof m.placement === 'number' && m.placement <= r.schwelle) p += r.punkte;
    else if (r.was === 'Elimination') p += r.jeStueck ? (m.elims ?? 0) * r.punkte : (m.elims ?? 0) >= r.schwelle ? r.punkte : 0;
  }
  return p;
}

const FARBEN = ['#38bdf8', '#7dd3fc', '#0ea5e9', '#bae6fd', '#0284c7', '#93c5fd', '#60a5fa', '#3b82f6', '#a5b4fc', '#cbd5e1'];

export default function PlatzVerlauf({ tabelle, wertung, name }: { tabelle: Team[]; wertung: Regel[]; name: string }) {
  const { sprache } = useSprache();
  const ort = ortVon(sprache);
  const [offen, setOffen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const daten = useMemo(() => {
    const mit = tabelle.filter((e) => !e.matchesWeg && e.matches?.length);
    const epicPunkte = mit.some((e) => e.matches.some((m) => typeof m.punktePlatz === 'number'));
    if ((!wertung.length && !epicPunkte) || mit.length < 10) return null;
    const verlauf = mit.map((e) => {
      const spiele = [...e.matches].sort((a, b) => Date.parse(a.endTime ?? '') - Date.parse(b.endTime ?? ''));
      let summe = 0;
      const punkte = spiele.map((m) => +spielPunkte(m, wertung).toFixed(2));
      const kum = punkte.map((p) => (summe += p));
      return { e, spiele, punkte, kum };
    });
    const top = verlauf.filter((v) => v.e.rank <= 10).sort((a, b) => a.e.rank - b.e.rank).slice(0, 10);
    // Aus der Wertung gerechnet: nur wenn die Summe Epics Punkte trifft. Epics eigene Punkte je Match gelten so, wie Epic sie fuehrt.
    if (top.length < 10 || (!epicPunkte && top.some((v) => Math.abs(v.kum[v.kum.length - 1] - v.e.points) > 0.5))) return null;
    const n = Math.max(...top.map((v) => v.spiele.length));
    // Stand nach Spiel k: Platz nach Punkten unter allen geladenen Teams (wer weniger Spiele hat, mit seinem letzten Stand).
    const stand = (k: number) => {
      const werte = verlauf.map((v) => v.kum[Math.min(k, v.kum.length) - 1] ?? 0).sort((a, b) => b - a);
      return (p: number) => 1 + werte.findIndex((w) => w <= p);
    };
    const staende = Array.from({ length: n }, (_, i) => stand(i + 1));
    const linien = top.map((v) => ({ ...v, plaetze: v.kum.map((p, i) => staende[i](p)) }));
    return { linien, n };
  }, [tabelle, wertung]);

  if (!daten) return null;
  const { linien, n } = daten;
  const W = 900; const H = 320; const l = 40; const r = 170; const o = 14; const u = 30;
  const maxPlatz = Math.max(10, ...linien.flatMap((x) => x.plaetze));
  const sx = (i: number) => l + (n <= 1 ? 0 : (i / (n - 1)) * (W - l - r));
  const sy = (p: number) => o + ((Math.min(p, maxPlatz) - 1) / Math.max(1, maxPlatz - 1)) * (H - o - u);
  const teamName = (e: Team) => e.players.map((p) => p.name).join(' / ');
  // Namen am Ende der Linien: untereinander mit mindestens 15 px Abstand, damit sie sich nicht ueberdecken.
  const etikettY = new Map<number, number>();
  [...linien].map((x, j) => ({ j, y: sy(x.plaetze[x.plaetze.length - 1]) })).sort((a, b) => a.y - b.y)
    .reduce((vorher, { j, y }) => { const neu = Math.max(y, vorher + 15); etikettY.set(j, neu); return neu; }, -Infinity);

  const csv = () => {
    const kopf = ['Rank', 'Team', 'Points', ...Array.from({ length: n }, (_, i) => [`G${i + 1} Place`, `G${i + 1} Elims`, `G${i + 1} Points`, `G${i + 1} Standing`]).flat()];
    const zeilen = linien.map((x) => [x.e.rank, teamName(x.e), x.e.points, ...Array.from({ length: n }, (_, i) => [x.spiele[i]?.placement ?? '', x.spiele[i]?.elims ?? '', x.punkte[i] ?? '', x.plaetze[i] ?? '']).flat()]);
    const text = [kopf, ...zeilen].map((z) => z.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-top10.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="border-b border-zinc-800 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOffen((x) => !x)} aria-expanded={offen}
          className={`rounded-lg border px-3 py-1 text-xs font-semibold transition ${offen ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-zinc-700 text-slate-300 hover:border-sky-500/60 hover:text-sky-300'}`}>
          Placement Progression · Top 10
        </button>
        <button type="button" onClick={csv} className="rounded-lg border border-zinc-700 px-3 py-1 text-xs font-semibold text-slate-300 transition hover:border-sky-500/60 hover:text-sky-300">
          <T>Top 10 als CSV</T>
        </button>
      </div>
      {offen && (
        <div className="mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Placement progression of the top 10">
            {Array.from({ length: n }, (_, i) => (
              <g key={i}><line x1={sx(i)} x2={sx(i)} y1={o} y2={H - u} stroke="rgba(255,255,255,.06)" /><text x={sx(i)} y={H - 10} textAnchor="middle" fontSize="12" fill="#64748b">G{i + 1}</text></g>
            ))}
            {[1, 5, 10, 20, 50, 100].filter((p) => p <= maxPlatz).map((p) => (
              <text key={p} x={l - 8} y={sy(p) + 4} textAnchor="end" fontSize="11" fill="#64748b">#{p}</text>
            ))}
            {linien.map((x, j) => {
              const an = hover === null || hover === j;
              const pfad = x.plaetze.map((p, i) => `${i ? 'L' : 'M'}${sx(i)},${sy(p)}`).join(' ');
              const letzte = x.plaetze.length - 1;
              return (
                <g key={x.e.rank} opacity={an ? 1 : 0.18} onMouseEnter={() => setHover(j)} onMouseLeave={() => setHover(null)}>
                  <path d={pfad} fill="none" stroke={FARBEN[j]} strokeWidth={hover === j ? 3.5 : 2} />
                  {x.plaetze.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p)} r={3} fill={FARBEN[j]}><title>{`${teamName(x.e)} · G${i + 1}: #${x.spiele[i]?.placement ?? '–'} in game, ${x.punkte[i]} pts, standing #${p}`}</title></circle>)}
                  <text x={sx(letzte) + 8} y={(etikettY.get(j) ?? sy(x.plaetze[letzte])) + 4} fontSize="12" fill={FARBEN[j]}>{`${x.e.rank}. ${teamName(x.e)}`.slice(0, 22)}</text>
                </g>
              );
            })}
          </svg>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs tabular-nums">
              <thead className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <tr><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Team</th><th className="px-2 py-1.5">Pts</th>
                  {Array.from({ length: n }, (_, i) => <th key={i} className="px-2 py-1.5">G{i + 1}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-slate-300">
                {linien.map((x, j) => (
                  <tr key={x.e.rank} onMouseEnter={() => setHover(j)} onMouseLeave={() => setHover(null)} className={hover === j ? 'bg-sky-500/[0.06]' : ''}>
                    <td className="px-2 py-1.5 font-bold" style={{ color: FARBEN[j] }}>{x.e.rank}</td>
                    <td className="max-w-[220px] truncate px-2 py-1.5 text-slate-100">{teamName(x.e)}</td>
                    <td className="px-2 py-1.5 font-semibold">{x.e.points.toLocaleString(ort)}</td>
                    {Array.from({ length: n }, (_, i) => (
                      <td key={i} className="px-2 py-1.5" title={`Standing after G${i + 1}: #${x.plaetze[i] ?? '–'}`}>
                        {x.spiele[i] ? <><span className={x.spiele[i].placement === 1 ? 'font-bold text-sky-300' : ''}>#{x.spiele[i].placement ?? '–'}</span><span className="text-slate-500"> · {x.punkte[i]}</span></> : '–'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-slate-600"><T>Je Spiel: Platz im Match · Punkte. Linie: Stand in der Wertung nach dem jeweiligen Spiel des Teams.</T></p>
        </div>
      )}
    </div>
  );
}
