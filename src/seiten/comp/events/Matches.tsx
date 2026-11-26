import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { flagge } from '../../../teile/Glas';
import { zahl } from './gemeinsam';
import { type LbSpieler, spielerName } from './Bestenliste';

/* Die einzelnen Runden eines Spieltags (/api/cup-matches): je Spiel Lobby, Dauer, Sieger - aufklappbar mit allen Teams. */

interface MTeam { platz: number; teamId: string; spieler: Array<{ id: string; name: string }>; elims: number; punkte?: number; timeAlive?: number }
interface Spiel { id: string; nummer: number; beginn?: string; ende: string; dauer?: number; lobby?: number; live?: boolean; abgesagt?: boolean; verbleibend?: number; teams: MTeam[] }

export default function Matches({ eventId, windowId, live, spielerInfo }: { eventId: string; windowId: string; live: boolean; spielerInfo: Map<string, LbSpieler> }) {
  const [spiele, setSpiele] = useState<Spiel[] | null>(null);
  const [fehler, setFehler] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [zeige, setZeige] = useState(30);

  useEffect(() => {
    let weg = false;
    const holen = () => fetch(`/api/cup-matches?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&limit=500`)
      .then((r) => r.json()).then((j) => { if (!weg) setSpiele(((j?.spiele ?? []) as Spiel[]).filter((s) => !s.abgesagt).sort((a, b) => b.nummer - a.nummer)); })
      .catch(() => { if (!weg) setFehler(true); });
    setSpiele(null); setFehler(false); holen();
    const i = live ? setInterval(holen, 30_000) : undefined;
    return () => { weg = true; if (i) clearInterval(i); };
  }, [eventId, windowId, live]);

  if (fehler && !spiele) return <p className="p-10 text-center text-sm text-white/50">The matches aren't reachable right now.</p>;
  if (!spiele) return <div className="space-y-1.5 p-4">{[...Array(8)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-white/[0.03]" />)}</div>;
  if (!spiele.length) return <p className="p-10 text-center text-sm text-white/50">No matches recorded for this match day yet.</p>;

  const name = (p: { id: string; name: string }) => { const i = spielerInfo.get(p.id); return i ? spielerName(i) : p.name; };
  return (
    <div className="divide-y divide-white/[0.05]">
      {spiele.slice(0, zeige).map((s, i) => {
        const sieger = s.teams.find((t) => t.platz === 1);
        const auf = offen === s.id;
        return (
          <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }}>
            <button type="button" onClick={() => setOffen(auf ? null : s.id)} className="grid w-full grid-cols-[80px_120px_minmax(0,1fr)_90px_90px_24px] items-center gap-4 px-4 py-3 text-left transition hover:bg-white/[0.03]">
              <span className="text-sm font-extrabold tabular-nums text-white">Game {s.nummer}</span>
              <span className="text-xs tabular-nums text-white/50">{new Date(s.beginn ?? s.ende).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{s.dauer ? ` · ${Math.round(s.dauer / 60)} min` : ''}</span>
              <span className="flex min-w-0 items-center gap-2 text-sm">
                {s.live ? <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-300">Live · {s.verbleibend ?? '?'} left</span>
                  : sieger ? <><span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Winner</span><span className="truncate font-semibold text-white">{sieger.spieler.map(name).join(' · ')}</span><span className="shrink-0 text-xs text-white/45">{sieger.elims} elims</span></> : <span className="text-white/40">—</span>}
              </span>
              <span className="text-right text-xs tabular-nums text-white/50">{s.lobby ? `${s.lobby} teams` : ''}</span>
              <span className="text-right text-xs tabular-nums text-white/50">{zahl(s.teams.reduce((a, t) => a + (t.elims || 0), 0))} elims</span>
              <span className={`text-white/40 transition ${auf ? 'rotate-180' : ''}`}>▾</span>
            </button>
            <AnimatePresence initial={false}>
              {auf && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="grid gap-1.5 px-4 pb-4 md:grid-cols-2 2xl:grid-cols-3">
                    {[...s.teams].sort((a, b) => a.platz - b.platz).map((t) => (
                      <div key={t.teamId} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.025] px-3 py-2">
                        <span className={`w-8 text-sm font-extrabold tabular-nums ${t.platz === 1 ? 'text-amber-300' : 'text-white/50'}`}>#{t.platz}</span>
                        <span className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 text-sm">
                          {t.spieler.map((p) => {
                            const info = spielerInfo.get(p.id);
                            const land = info?.land || info?.spielLand;
                            return (
                              <Link key={p.id} to={`/competitive/player/${p.id}`} className="flex min-w-0 items-center gap-1 text-white/85 hover:text-sky-300">
                                {land && <img src={flagge(land)} alt="" className="h-3 w-3 rounded-full object-cover" />}<span className="truncate">{name(p)}</span>
                              </Link>
                            );
                          })}
                        </span>
                        <span className="text-xs tabular-nums text-white/55">{t.elims} el.</span>
                        {typeof t.punkte === 'number' && <span className="w-12 text-right text-xs font-bold tabular-nums text-sky-300">{t.punkte} pts</span>}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
      {spiele.length > zeige && <div className="flex justify-center p-4"><button type="button" onClick={() => setZeige((z) => z + 50)} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-2 text-sm font-semibold text-white/80 hover:border-sky-400/40">Show more games ({spiele.length - zeige})</button></div>}
    </div>
  );
}
