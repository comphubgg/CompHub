import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from '../../../teile/Glas';
import { zahl } from './gemeinsam';

/* Die Bestenliste eines Spieltags (/api/cup-leaderboard): Teams mit Fotos, Flaggen und Anzeigenamen, Qualifikationslinie, Rangwechsel aufleuchtend. */

export interface LbSpieler { id: string; name: string; anzeige?: string | null; img?: string | null; land?: string | null; spielLand?: string | null }
export interface LbRunde { sessionId: string; endTime: string; placement: number; elims: number; timeAlive?: number; wins?: number; punktePlatz?: number; punkteElim?: number }
export interface Eintrag {
  rank: number; points: number; elims: number; games: number; wins: number; avgPlace?: number; bestPlace?: number;
  teamId: string; players: LbSpieler[]; matches?: LbRunde[];
}
export const spielerName = (p: { anzeige?: string | null; name: string }) => p.anzeige || p.name;

/** Kleines Hochformat-Foto (nie runde, ueberlappende Kreise). Ohne Foto: nichts. */
export function Avatar({ p, klein }: { p: LbSpieler; klein?: boolean }) {
  const [kaputt, setKaputt] = useState(false);
  if (!p.img || kaputt) return null;
  return <img src={p.img} alt="" loading="lazy" onError={() => setKaputt(true)} className={`${klein ? 'h-9 w-7 rounded-md' : 'h-12 w-9 rounded-lg'} shrink-0 border border-white/10 object-cover object-top`} />;
}

export const SPALTEN = 'grid grid-cols-[56px_minmax(0,1fr)_84px_64px_64px_56px_72px] items-center gap-3';

function Zeile({ e, wechsel, offen, umschalten, qualiZone }: { e: Eintrag; wechsel?: number; offen: boolean; umschalten: () => void; qualiZone: boolean }) {
  const farbe = e.rank === 1 ? 'text-amber-300' : e.rank === 2 ? 'text-slate-200' : e.rank === 3 ? 'text-orange-300' : 'text-white/55';
  return (
    <motion.div layout="position" transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className={`border-b border-white/[0.04] transition-colors duration-[1500ms] ${wechsel ? (wechsel > 0 ? 'bg-emerald-400/[0.08]' : 'bg-rose-400/[0.07]') : qualiZone ? 'bg-sky-400/[0.025]' : ''}`}>
      <div role="button" tabIndex={0} onClick={umschalten} onKeyDown={(k) => k.key === 'Enter' && umschalten()} className={`${SPALTEN} cursor-pointer px-4 py-2 hover:bg-white/[0.03]`}>
        <div className="flex items-center gap-1.5">
          <span className={`text-base font-extrabold tabular-nums ${farbe}`}>{e.rank}</span>
          <AnimatePresence>{wechsel ? (
            <motion.span initial={{ opacity: 0, y: wechsel > 0 ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`text-[10px] font-bold tabular-nums ${wechsel > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{wechsel > 0 ? '▲' : '▼'}{Math.abs(wechsel)}</motion.span>
          ) : null}</AnimatePresence>
        </div>
        <div className="flex min-h-[48px] min-w-0 items-center gap-3">
          {e.players.every((p) => p.img) && <div className="flex shrink-0 gap-1">{e.players.map((p) => <Avatar key={p.id} p={p} />)}</div>}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            {e.players.map((p) => (
              <Link key={p.id} to={`/competitive/player/${p.id}`} onClick={(x) => x.stopPropagation()} className="group flex min-w-0 items-center gap-1.5">
                {(p.land || p.spielLand) && <img src={flagge(p.land || p.spielLand)} alt="" className="h-3.5 w-3.5 shrink-0 rounded-full object-cover" />}
                <span className="truncate text-sm font-semibold text-white group-hover:text-sky-300">{spielerName(p)}</span>
              </Link>
            ))}
          </div>
        </div>
        <span className="text-right text-base font-extrabold tabular-nums text-white">{zahl(e.points)}</span>
        <span className="text-right text-sm tabular-nums text-white/75">{zahl(e.elims)}</span>
        <span className="text-right text-sm tabular-nums text-white/60">{zahl(e.games)}</span>
        <span className={`text-right text-sm tabular-nums ${e.wins ? 'font-bold text-amber-300' : 'text-white/35'}`}>{zahl(e.wins)}</span>
        <span className="text-right text-sm tabular-nums text-white/60">{typeof e.avgPlace === 'number' ? zahl(e.avgPlace, 1) : '—'}</span>
      </div>
      <AnimatePresence initial={false}>
        {offen && e.matches?.length ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap gap-2 px-4 pb-4 pl-[84px]">
              {[...e.matches].sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime)).map((m, i) => (
                <div key={m.sessionId + i} className={`rounded-xl border px-3 py-2 text-xs ${m.placement === 1 ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/[0.03]'}`}>
                  <p className="text-[10px] uppercase tracking-wider text-white/40">Game {i + 1} · {new Date(m.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="mt-0.5 font-bold tabular-nums text-white">#{m.placement} <span className="font-normal text-white/55">· {m.elims} elims</span></p>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export default function Bestenliste({ tabelle, wechsel, schnitt, schnittText, suche }: {
  tabelle: Eintrag[]; wechsel: Record<string, number>; schnitt: number; schnittText: string; suche: string;
}) {
  const [zeige, setZeige] = useState(100);
  const [offen, setOffen] = useState<string | null>(null);
  const q = suche.trim().toLowerCase();
  const liste = useMemo(() => (q ? tabelle.filter((e) => e.players.some((p) => `${p.name} ${p.anzeige ?? ''}`.toLowerCase().includes(q))) : tabelle), [tabelle, q]);
  const sichtbar = liste.slice(0, zeige);
  return (
    <div>
      <div className={`${SPALTEN} border-b border-white/10 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40`}>
        <span>Rank</span><span>Team</span><span className="text-right">Points</span><span className="text-right">Elims</span><span className="text-right">Games</span><span className="text-right">Wins</span><span className="text-right">Avg pl.</span>
      </div>
      {sichtbar.map((e) => (
        <div key={e.teamId}>
          <Zeile e={e} wechsel={wechsel[e.teamId]} offen={offen === e.teamId} umschalten={() => setOffen((o) => (o === e.teamId ? null : e.teamId))} qualiZone={!!schnitt && e.rank <= schnitt} />
          {!q && schnitt > 0 && e.rank === schnitt && (
            <div className="relative flex items-center gap-3 px-4 py-1.5">
              <div className="h-px flex-1 bg-gradient-to-r from-sky-400 via-sky-400/60 to-transparent" />
              <span className="rounded-full border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300">{schnittText}</span>
              <div className="h-px flex-1 bg-gradient-to-l from-sky-400 via-sky-400/60 to-transparent" />
            </div>
          )}
        </div>
      ))}
      {!liste.length && <p className="p-10 text-center text-sm text-white/45">{q ? 'No player matches this search.' : 'No results yet.'}</p>}
      {liste.length > zeige && (
        <div className="flex justify-center p-4"><button type="button" onClick={() => setZeige((z) => z + 200)} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-semibold text-white/80 hover:border-sky-400/40 hover:text-white">Show more ({zahl(liste.length - zeige)} more teams)</button></div>
      )}
    </div>
  );
}
