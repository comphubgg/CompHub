import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from '../../../teile/Glas';
import { zahl } from './gemeinsam';

/*
 * Die Bestenliste eines Spieltags (/api/cup-leaderboard), neu gesetzt (Design-System 3.0): Rang in der Titelschrift, Medaillenkante fuer die
 * ersten drei, Flaggen und Anzeigenamen - bewusst OHNE Fotos (Betreiber: dichte, saubere Zeilen), Punkte gross, Qualifikationslinie in der
 * Akzentfarbe, Rangwechsel aufleuchtend. Ein Klick klappt die einzelnen Runden des Teams auf. Auf dem Handy bleiben Rang, Team, Punkte, Elims.
 */

export interface LbSpieler { id: string; name: string; anzeige?: string | null; img?: string | null; land?: string | null; spielLand?: string | null }
export interface LbRunde { sessionId: string; endTime: string; placement: number; elims: number; timeAlive?: number; wins?: number; punktePlatz?: number; punkteElim?: number }
export interface Eintrag {
  rank: number; points: number; elims: number; games: number; wins: number; avgPlace?: number; bestPlace?: number;
  teamId: string; players: LbSpieler[]; matches?: LbRunde[];
}
export const spielerName = (p: { anzeige?: string | null; name: string }) => p.anzeige || p.name;

export const SPALTEN = 'grid grid-cols-[34px_minmax(0,1fr)_54px_40px] sm:grid-cols-[52px_minmax(0,1fr)_84px_60px_60px_52px_68px] items-center gap-2 sm:gap-3';
const MEDAILLE = ['#facc15', '#cbd5e1', '#f59e0b'];

function Zeile({ e, wechsel, offen, umschalten, qualiZone }: { e: Eintrag; wechsel?: number; offen: boolean; umschalten: () => void; qualiZone: boolean }) {
  const medaille = MEDAILLE[e.rank - 1];
  return (
    <motion.div layout="position" transition={{ type: 'spring', stiffness: 380, damping: 36 }}
      className={`relative border-b border-white/[0.045] transition-colors duration-[1500ms] ${wechsel ? (wechsel > 0 ? 'bg-emerald-400/[0.08]' : 'bg-red-400/[0.07]') : qualiZone ? 'bg-akz/[0.028]' : ''}`}>
      {medaille && <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: medaille }} />}
      <div role="button" tabIndex={0} aria-expanded={offen} onClick={umschalten} onKeyDown={(k) => k.key === 'Enter' && umschalten()} className={`${SPALTEN} cursor-pointer px-3 py-1 transition hover:bg-white/[0.035] sm:px-5`}>
        <div className="flex items-baseline gap-1">
          <span className="titel zahl text-xl" style={medaille ? { color: medaille } : { color: 'rgba(255,255,255,0.6)' }}>{e.rank}</span>
          <AnimatePresence>{wechsel ? (
            <motion.span initial={{ opacity: 0, y: wechsel > 0 ? 6 : -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`zahl text-[10px] font-bold ${wechsel > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{wechsel > 0 ? '▲' : '▼'}{Math.abs(wechsel)}</motion.span>
          ) : null}</AnimatePresence>
        </div>
        <div className="flex min-w-0 items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            {e.players.map((p) => (
              <Link key={p.id} to={`/competitive/player/${p.id}`} onClick={(x) => x.stopPropagation()} className="group flex min-w-0 items-center gap-1.5">
                {(p.land || p.spielLand) && <img src={flagge(p.land || p.spielLand)} alt="" className="h-3 w-[18px] shrink-0 rounded-[3px] object-cover" />}
                <span className="truncate text-[13px] font-semibold text-white transition group-hover:text-akz sm:text-sm">{spielerName(p)}</span>
              </Link>
            ))}
          </div>
        </div>
        <span className="titel zahl text-right text-xl">{zahl(e.points)}</span>
        <span className="zahl text-right text-sm text-white/75">{zahl(e.elims)}</span>
        <span className="zahl hidden text-right text-sm text-white/55 sm:block">{zahl(e.games)}</span>
        <span className={`zahl hidden text-right text-sm sm:block ${e.wins ? 'font-bold text-amber-300' : 'text-white/30'}`}>{zahl(e.wins)}</span>
        <span className="zahl hidden text-right text-sm text-white/55 sm:block">{typeof e.avgPlace === 'number' ? zahl(e.avgPlace, 1) : '—'}</span>
      </div>
      <AnimatePresence initial={false}>
        {offen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap gap-2 px-3 pb-4 sm:px-5 sm:pl-[84px]">
              {/* auf dem Handy stehen Spiele, Siege und Schnitt hier, weil die Spalten dafuer fehlen */}
              <div className="rounded-xl border border-white/[0.07] bg-black/30 px-3 py-2 text-xs sm:hidden">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Day total</p>
                <p className="zahl mt-0.5 font-bold text-white">{e.games} games <span className="font-normal text-white/55">· {e.wins} wins{typeof e.avgPlace === 'number' ? ` · avg #${zahl(e.avgPlace, 1)}` : ''}</span></p>
              </div>
              {[...(e.matches ?? [])].sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime)).map((m, i) => (
                <div key={m.sessionId + i} className={`rounded-xl border px-3 py-2 text-xs ${m.placement === 1 ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/[0.07] bg-black/30'}`}>
                  <p className="zahl text-[10px] uppercase tracking-wider text-white/40">Game {i + 1} · {new Date(m.endTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p className="zahl mt-0.5 font-bold text-white">#{m.placement} <span className="font-normal text-white/55">· {m.elims} elims</span>
                    {typeof m.punktePlatz === 'number' && typeof m.punkteElim === 'number' && <span className="font-semibold text-akz"> · {m.punktePlatz + m.punkteElim} pts</span>}</p>
                </div>
              ))}
              {!e.matches?.length && <p className="py-1 text-xs text-white/40">No single games published for this team.</p>}
            </div>
          </motion.div>
        )}
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
      <div className={`${SPALTEN} border-b border-white/[0.07] px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40 sm:px-5`}>
        <span>#</span><span>Team</span><span className="text-right">Points</span><span className="text-right">Elims</span>
        <span className="hidden text-right sm:block">Games</span><span className="hidden text-right sm:block">Wins</span><span className="hidden text-right sm:block">Avg pl.</span>
      </div>
      {sichtbar.map((e) => (
        <div key={e.teamId}>
          <Zeile e={e} wechsel={wechsel[e.teamId]} offen={offen === e.teamId} umschalten={() => setOffen((o) => (o === e.teamId ? null : e.teamId))} qualiZone={!!schnitt && e.rank <= schnitt} />
          {!q && schnitt > 0 && e.rank === schnitt && (
            <div className="relative flex items-center gap-3 px-3 py-2 sm:px-5">
              <div className="h-px flex-1 bg-gradient-to-r from-akz via-akz/60 to-transparent" />
              <span className="rounded-full border border-akz/40 bg-akz/10 px-3 py-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-akz">{schnittText}</span>
              <div className="h-px flex-1 bg-gradient-to-l from-akz via-akz/60 to-transparent" />
            </div>
          )}
        </div>
      ))}
      {!liste.length && <p className="p-10 text-center text-sm text-white/45">{q ? 'No player matches this search.' : 'No results yet.'}</p>}
      {liste.length > zeige && (
        <div className="flex justify-center p-4"><button type="button" onClick={() => setZeige((z) => z + 200)} className="knopf">Show more ({zahl(liste.length - zeige)} more teams)</button></div>
      )}
    </div>
  );
}
