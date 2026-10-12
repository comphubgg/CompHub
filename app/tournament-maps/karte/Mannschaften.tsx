'use client';

import { useEffect, useMemo, useState } from 'react';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import LadeSchirm from '@/app/components/LadeSchirm';
import TeamFlagge from '@/components/TeamFlagge';
import type { SolosTeam } from '@/lib/globalsSolos';

/*
 * Die Teams eines Cups als Karten (Reiter "Spieler") und die Bestenliste (Reiter "Leaderboard").
 *
 * Der Betreiber (12.10.2026): "Players soll auch so aussehen ..., dass es jeweils ein Duo ist" - eine Karte je Team mit
 * den Flaggen oben, den Namen darunter und dem Platz. Und bei der Bestenliste: "das ganze Trio, jeweilige Flagge, dann
 * mit Points, VR und Eliminations und mit der Platzierung".
 */

/** Eine Karte je Team: Flaggen oben, Namen, Platz. */
export function TeamKarten({ teams }: { teams: SolosTeam[] }) {
  const t = useT();
  const [suche, setSuche] = useState('');
  const geordnet = useMemo(() => {
    const hatRang = teams.some((x) => x.rang !== null);
    return [...teams].sort((a, b) => (hatRang ? (a.rang ?? 9999) - (b.rang ?? 9999) : 0));
  }, [teams]);
  const q = suche.trim().toLowerCase();
  const sichtbar = q ? geordnet.filter((x) => x.spieler.some((s) => s.anzeige.toLowerCase().includes(q) || (s.land ?? '').toLowerCase() === q)) : geordnet;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-300"><T>Teams</T> <span className="ml-1 text-slate-600">{teams.length}</span></h2>
        <input value={suche} onChange={(e) => setSuche(e.target.value)} placeholder={t('Spieler suchen …')}
          className="w-full max-w-[220px] rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500" />
      </div>
      {sichtbar.length === 0 ? <p className="text-sm text-slate-500"><T>Kein Spieler gefunden.</T></p> : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {sichtbar.map((x, i) => (
            <li key={x.id} className="flex flex-col items-center rounded-xl border border-white/[0.07] bg-zinc-900/50 px-3 py-4 text-center transition hover:border-sky-500/40 hover:bg-zinc-900/80">
              <span className="flex -space-x-1">
                {x.spieler.map((s) => <TeamFlagge key={s.id} groesse={26} laender={[s.land ?? undefined]} />)}
              </span>
              <span className="mt-2 text-[11px] font-black uppercase leading-snug tracking-wide text-slate-100">{x.spieler.map((s) => s.anzeige).join(' ')}</span>
              <span className="mt-1 text-[10px] font-semibold tabular-nums text-slate-600">#{x.rang ?? i + 1}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Zeile {
  rank: number; points: number; wins: number; elims: number; games: number;
  players: Array<{ id: string; name?: string; displayName?: string }>;
}

/** Die Bestenliste: Platz, das ganze Team mit Flaggen, Punkte, Siege (VR) und Eliminierungen. */
export function RangTabelle({ eventId, windowId, laender }: { eventId: string | null; windowId: string; laender: Map<string, string | null> }) {
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState(false);

  useEffect(() => {
    if (!eventId) { setFehler(true); return undefined; }
    let weg = false;
    fetch(`/api/cup-leaderboard?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&limit=100`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (weg) return; if (Array.isArray(j?.entries)) setZeilen(j.entries); else setFehler(true); })
      .catch(() => { if (!weg) setFehler(true); });
    return () => { weg = true; };
  }, [eventId, windowId]);

  if (fehler) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;
  if (!zeilen) return <LadeSchirm />;
  if (!zeilen.length) return <p className="text-sm text-slate-500"><T>Für diesen Spieltag liegt noch keine Bestenliste vor.</T></p>;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-900/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.08] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <th className="w-12 px-3 py-2">#</th><th className="px-3 py-2"><T>Team</T></th>
            <th className="w-16 px-3 py-2 text-right">Pts</th><th className="w-14 px-3 py-2 text-right" title="Victory Royales">VR</th><th className="w-16 px-3 py-2 text-right">Elims</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.slice(0, 100).map((z) => (
            <tr key={z.rank} className="border-b border-white/[0.04] transition hover:bg-sky-500/[0.05]">
              <td className="px-3 py-2 text-[11px] font-bold tabular-nums text-slate-500">{z.rank}</td>
              <td className="px-3 py-2">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {z.players.map((p) => (
                    <span key={p.id} className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-100">
                      <TeamFlagge groesse={14} laender={[laender.get(p.id) ?? undefined]} />
                      {p.displayName || p.name || '—'}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-100">{z.points}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.wins}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-300">{z.elims}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
