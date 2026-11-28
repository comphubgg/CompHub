import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Laedt } from '../../../ds/Bausteine';
import { flagge } from '../../../teile/Glas';
import { zahl } from './gemeinsam';
import { type LbSpieler, spielerName } from './Bestenliste';

/*
 * Die einzelnen Runden eines Spieltags (/api/cup-matches), neu gesetzt: je Spiel eine Zeile mit Nummer in der Titelschrift, Uhrzeit, Dauer,
 * dem Sieger (ohne Fotos, dichte Zeilen), Lobby-Groesse und Elims - aufklappbar mit allen Teams. Laeuft ein Spiel, steht dort, wie viele noch leben.
 */

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
  if (!spiele) return <Laedt text="Loading matches" />;
  if (!spiele.length) return <p className="p-10 text-center text-sm text-white/50">No matches recorded for this match day yet.</p>;

  const name = (p: { id: string; name: string }) => { const i = spielerInfo.get(p.id); return i ? spielerName(i) : p.name; };
  return (
    <div>
      {spiele.slice(0, zeige).map((s, i) => {
        const sieger = s.teams.find((t) => t.platz === 1);
        const auf = offen === s.id;
        return (
          <motion.div key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 15) * 0.02 }} className="border-b border-white/[0.045]">
            <button type="button" aria-expanded={auf} onClick={() => setOffen(auf ? null : s.id)}
              className="grid w-full grid-cols-[52px_minmax(0,1fr)_20px] items-center gap-3 px-3 py-2.5 text-left transition hover:bg-white/[0.035] sm:grid-cols-[64px_110px_minmax(0,1fr)_84px_84px_20px] sm:gap-4 sm:px-5">
              <span><span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-white/35">Game</span><span className="titel zahl block text-3xl">{s.nummer}</span></span>
              <span className="zahl hidden text-xs text-white/50 sm:block">{new Date(s.beginn ?? s.ende).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{s.dauer ? ` · ${Math.round(s.dauer / 60)} min` : ''}</span>
              <span className="flex min-h-[40px] min-w-0 items-center gap-3 text-sm">
                {s.live ? <span className="rounded-full bg-red-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-red-300 ring-1 ring-red-400/40">Live · {s.verbleibend ?? '?'} left</span>
                  : sieger ? (
                    <>
                      <span className="min-w-0">
                        <span className="block text-[9px] font-bold uppercase tracking-[0.2em] text-amber-300">Winner · {sieger.elims} elims</span>
                        <span className="block truncate font-semibold text-white">{sieger.spieler.map(name).join(' · ')}</span>
                      </span>
                    </>
                  ) : <span className="text-white/40">No winner published</span>}
              </span>
              <span className="zahl hidden text-right text-xs text-white/50 sm:block">{s.lobby ? `${s.lobby} teams` : ''}</span>
              <span className="zahl hidden text-right text-xs text-white/50 sm:block">{zahl(s.teams.reduce((a, t) => a + (t.elims || 0), 0))} elims</span>
              <span className={`text-white/40 transition ${auf ? 'rotate-180' : ''}`}>▾</span>
            </button>
            <AnimatePresence initial={false}>
              {auf && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="zahl px-3 pb-2 text-xs text-white/45 sm:hidden">{new Date(s.beginn ?? s.ende).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{s.dauer ? ` · ${Math.round(s.dauer / 60)} min` : ''}{s.lobby ? ` · ${s.lobby} teams` : ''}</p>
                  <div className="grid gap-1.5 px-3 pb-4 sm:px-5 md:grid-cols-2 2xl:grid-cols-3">
                    {[...s.teams].sort((a, b) => a.platz - b.platz).map((t) => (
                      <div key={t.teamId} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${t.platz === 1 ? 'border-amber-300/30 bg-amber-300/[0.06]' : 'border-white/[0.06] bg-black/30'}`}>
                        <span className={`titel zahl w-8 text-xl ${t.platz === 1 ? '!text-amber-300' : '!text-white/50'}`}>{t.platz}</span>
                        <span className="flex min-w-0 flex-1 flex-wrap gap-x-2.5 text-sm">
                          {t.spieler.map((p) => {
                            const info = spielerInfo.get(p.id);
                            const land = info?.land || info?.spielLand;
                            return (
                              <Link key={p.id} to={`/competitive/player/${p.id}`} className="flex min-w-0 items-center gap-1 text-white/85 transition hover:text-akz">
                                {land && <img src={flagge(land)} alt="" className="h-2.5 w-[15px] rounded-[2px] object-cover" />}<span className="truncate">{name(p)}</span>
                              </Link>
                            );
                          })}
                        </span>
                        <span className="zahl text-xs text-white/55">{t.elims} el.</span>
                        {typeof t.punkte === 'number' && <span className="zahl w-12 text-right text-xs font-bold text-akz">{t.punkte} pts</span>}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
      {spiele.length > zeige && <div className="flex justify-center p-4"><button type="button" onClick={() => setZeige((z) => z + 50)} className="knopf">Show more games ({spiele.length - zeige})</button></div>}
    </div>
  );
}
