import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

/* Die Unterseiten von Competitive - jede eine eigene Seite im Hub (Betreiber, 26.11.2026: "einzelne Seiten, nicht alles auf eine Seite"). */
export const COMP_SEITEN = [
  { pfad: '', titel: 'Overview' },
  { pfad: 'rankings', titel: 'Rankings' },
  { pfad: 'events', titel: 'Events' },
  { pfad: 'maps', titel: 'Maps' },
  { pfad: 'statistics', titel: 'Statistics' },
  { pfad: 'deep-stats', titel: 'Deep Stats' },
  { pfad: 'match-finder', titel: 'Match Finder' },
  { pfad: 'replays', titel: 'Replays' },
  { pfad: 'tierlist', titel: 'Tierlist' },
  { pfad: 'fncs', titel: 'FNCS' },
  { pfad: 'globals', titel: 'Globals' },
];

/*
 * Der Rest steht im Glas-Menue "More" (die Leiste wurde zu lang). Gruppiert, mit kurzer Zeile je Seite; auf dem Handy als Tafel ueber die
 * ganze Breite. Der Knopf zeigt den Namen der offenen Seite, wenn sie im Menue steht.
 */
export const MEHR_SEITEN: Array<{ gruppe: string; seiten: Array<{ pfad: string; titel: string; text: string; farbe: string }> }> = [
  { gruppe: 'Competition', seiten: [
    { pfad: 'globals-solos', titel: 'Globals Solos', text: 'Heats, qualified players, drop map', farbe: '#fbbf24' },
    { pfad: 'predictions', titel: 'Predictions', text: 'Pick the winners, climb the board', farbe: '#a78bfa' },
    { pfad: 'scrims', titel: 'Scrims', text: 'Scrim lobbies and results', farbe: '#34d399' },
    { pfad: 'maps/view', titel: 'Tournament maps', text: 'Live drop maps from the map tool', farbe: '#38bdf8' },
  ] },
  { gruppe: 'Community', seiten: [
    { pfad: 'awards', titel: 'Awards', text: 'The CompHub Awards — vote', farbe: '#f472b6' },
    { pfad: 'orgs', titel: 'Orgs', text: 'Teams and their rosters', farbe: '#2dd4bf' },
    { pfad: 'posts', titel: 'Posts', text: 'Daily posts and graphics', farbe: '#fb923c' },
  ] },
  { gruppe: 'Watch & learn', seiten: [
    { pfad: 'pov', titel: 'POV', text: 'Pro POV streams in one place', farbe: '#f87171' },
    { pfad: 'how-it-works', titel: 'How it works', text: 'How CompHub counts everything', farbe: '#94a3b8' },
  ] },
];

export default function CompNav() {
  const ort = useLocation();
  const [offen, setOffen] = useState(false);
  const huelle = useRef<HTMLDivElement | null>(null);
  useEffect(() => { setOffen(false); }, [ort.pathname]);
  useEffect(() => {
    if (!offen) return undefined;
    const weg = (e: MouseEvent) => { if (huelle.current && !huelle.current.contains(e.target as Node)) setOffen(false); };
    const taste = (e: KeyboardEvent) => { if (e.key === 'Escape') setOffen(false); };
    document.addEventListener('mousedown', weg); window.addEventListener('keydown', taste);
    return () => { document.removeEventListener('mousedown', weg); window.removeEventListener('keydown', taste); };
  }, [offen]);

  const rest = ort.pathname.replace(/^\/competitive\/?/, '');
  const aktivMehr = MEHR_SEITEN.flatMap((g) => g.seiten).sort((a, b) => b.pfad.length - a.pfad.length)
    .find((s) => rest === s.pfad || rest.startsWith(`${s.pfad}/`) || (s.pfad === 'orgs' && rest.startsWith('team/')));
  const istHaupt = (pfad: string) => !aktivMehr && (pfad === '' ? rest === '' : rest === pfad || rest.startsWith(`${pfad}/`));
  // Handy: der aktive Reiter rollt ins Bild (wie die Community-Reiter)
  const reihe = useRef<HTMLElement | null>(null); const reihe2 = useRef<HTMLElement | null>(null);
  useEffect(() => {
    for (const r of [reihe, reihe2]) r.current?.querySelector('[data-aktiv="1"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [ort.pathname]);

  return (
    <div ref={huelle} className="sticky top-[57px] z-20 border-b border-white/10 bg-[#06080f]/90 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl">
      <div className="flex items-center gap-1 px-6 py-2 lg:px-10">
        <nav ref={reihe} className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {COMP_SEITEN.map((s) => (
            <NavLink key={s.pfad} to={`/competitive${s.pfad ? `/${s.pfad}` : ''}`} data-aktiv={istHaupt(s.pfad) ? '1' : '0'}
              className={`relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${istHaupt(s.pfad) ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
              {s.titel}
            </NavLink>
          ))}
        </nav>
        <button type="button" onClick={() => setOffen((v) => !v)} aria-expanded={offen}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-semibold transition ${aktivMehr || offen ? 'border-sky-400/40 bg-sky-400/10 text-sky-200' : 'border-white/10 text-white/70 hover:border-white/20 hover:text-white'}`}>
          <span className="max-w-[9rem] truncate">{aktivMehr ? aktivMehr.titel : 'More'}</span>
          <motion.svg animate={{ rotate: offen ? 180 : 0 }} viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></motion.svg>
        </button>
      </div>
      {/* Zweite Reihe (wie Community): steht man auf einer Seite aus "More", sind deren Geschwister sichtbar - kein Menue noetig, um zu wechseln */}
      {aktivMehr && (
        <nav ref={reihe2} className="flex items-center gap-1 overflow-x-auto px-6 pb-0 [scrollbar-width:none] lg:px-10 [&::-webkit-scrollbar]:hidden">
          {MEHR_SEITEN.flatMap((g) => g.seiten).map((s) => {
            const an = aktivMehr.pfad === s.pfad;
            return (
              <Link key={s.pfad} to={`/competitive/${s.pfad}`} data-aktiv={an ? '1' : '0'} title={s.text}
                className={`relative block shrink-0 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors ${an ? 'text-white' : 'text-white/45 hover:text-white/85'}`}>
                {s.titel}
                {an && <motion.span layoutId="comp-mehr" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.7)]" />}
              </Link>
            );
          })}
        </nav>
      )}
      <AnimatePresence>
        {offen && (
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-4 right-4 top-full mt-2 origin-top-right overflow-hidden rounded-3xl border border-white/10 bg-[#0a0e18]/90 shadow-2xl shadow-black/60 backdrop-blur-2xl sm:left-auto sm:right-6 sm:w-[min(760px,calc(100vw-48px))] lg:right-10">
            <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-sky-500/15 blur-3xl" />
            <div className="relative grid gap-5 p-5 sm:grid-cols-3">
              {MEHR_SEITEN.map((g, gi) => (
                <div key={g.gruppe}>
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-white/35">{g.gruppe}</p>
                  <ul className="space-y-1">
                    {g.seiten.map((s, i) => (
                      <motion.li key={s.pfad} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: gi * 0.05 + i * 0.03 }}>
                        <Link to={`/competitive/${s.pfad}`}
                          className={`group flex items-start gap-3 rounded-2xl px-2.5 py-2 transition hover:bg-white/[0.06] ${aktivMehr?.pfad === s.pfad ? 'bg-white/[0.07]' : ''}`}>
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full transition group-hover:scale-125" style={{ background: s.farbe, boxShadow: `0 0 12px ${s.farbe}` }} />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-white">{s.titel}</span>
                            <span className="block text-xs text-white/45">{s.text}</span>
                          </span>
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
