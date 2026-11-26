import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { Laedt, TEAL } from './Teile';
import Uebersicht from './Uebersicht';

/*
 * Community-Bereich (Betreiber, 26.11.2026: "alles, was fortnite.gg hat, plus genaue Details, die sonst niemand hat"; Spezifikation mit 30
 * Menuepunkten). Die Unter-Navigation ist in Gruppen geordnet (Island, Loot, Season, Live, Compete) - jede Gruppe klappt beim Darueberfahren
 * oder Antippen ihre Seiten auf. Gemountet unter /community/* (src/App.tsx), daher die eigenen Routes hier.
 */
const Karte = lazy(() => import('./Karte'));
const Waffen = lazy(() => import('./Waffen'));
const Entwicklung = lazy(() => import('./Entwicklung'));
const Assets = lazy(() => import('./Assets'));
const Seiten = lazy(() => import('./Seiten'));

interface Eintrag { pfad: string; titel: string; text: string }
export const GRUPPEN: Array<{ titel: string; seiten: Eintrag[] }> = [
  { titel: 'Island', seiten: [
    { pfad: 'map', titel: 'Map', text: 'Every chest, ammo box and more' },
    { pfad: 'map-evolution', titel: 'Map Evolution', text: 'Compare the island across patches' },
    { pfad: 'rotation', titel: 'Map Rotation', text: 'Reload & Blitz – live and up next' },
  ] },
  { titel: 'Loot', seiten: [
    { pfad: 'weapons', titel: 'Loot Pool', text: 'All weapons with real stats' },
    { pfad: 'weapons/compare', titel: 'Compare', text: 'Up to four weapons side by side' },
    { pfad: 'weapons/changes', titel: 'Changes', text: 'What changed per patch' },
    { pfad: 'assets', titel: 'Asset Studio', text: 'Weapon & item images – recolour, download' },
  ] },
  { titel: 'Season', seiten: [
    { pfad: 'season', titel: 'Season Countdown', text: 'Live event and season end' },
    { pfad: 'xp', titel: 'XP Calculator', text: 'XP per day for your level goal' },
  ] },
  { titel: 'Live', seiten: [
    { pfad: 'players', titel: 'Player Count', text: 'Online now and history' },
    { pfad: 'creative', titel: 'Creative', text: 'Most played islands' },
    { pfad: 'news', titel: 'News', text: 'Latest in-game news' },
  ] },
  { titel: 'Compete', seiten: [
    { pfad: 'tournaments', titel: 'Tournaments', text: 'Upcoming cups and results' },
    { pfad: 'stats', titel: 'Stats', text: 'Look up any player' },
  ] },
];

function GruppenNav() {
  const ort = useLocation();
  const [offen, setOffen] = useState<string | null>(null);
  const istAktiv = (s: Eintrag) => ort.pathname === `/community/${s.pfad}`
    || (s.pfad === 'weapons' && /^\/community\/weapons\/(?!compare|changes)/.test(ort.pathname)) || (s.pfad === 'assets' && ort.pathname.startsWith('/community/assets'));
  const knopf = (aktiv: boolean) => `relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${aktiv ? 'text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`;
  const stil = (aktiv: boolean) => (aktiv ? { background: `rgba(${TEAL},0.16)`, boxShadow: `inset 0 0 0 1px rgba(${TEAL},0.35)` } : undefined);
  return (
    <div className="sticky top-[57px] z-30 border-b border-white/5 bg-[#06080f]/70 backdrop-blur-xl" onMouseLeave={() => setOffen(null)}>
      <nav className="flex items-center gap-1 overflow-x-auto px-6 py-2 lg:px-10">
        <NavLink to="/community" end className={({ isActive }) => knopf(isActive)} style={({ isActive }) => stil(isActive)}>Overview</NavLink>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        {GRUPPEN.map((g) => {
          const aktiv = g.seiten.find(istAktiv);
          return (
            <button key={g.titel} type="button" onMouseEnter={() => setOffen(g.titel)} onClick={() => setOffen((o) => (o === g.titel ? null : g.titel))} className={knopf(!!aktiv)} style={stil(!!aktiv)}>
              <span className="text-white/45">{g.titel}</span>{aktiv ? <span className="ml-1.5">{aktiv.titel}</span> : null}
              <span className={`ml-1.5 inline-block text-[10px] text-white/40 transition ${offen === g.titel ? 'rotate-180' : ''}`}>▾</span>
            </button>
          );
        })}
        <NavLink to="/community/notifications" title="Notifications" className={({ isActive }) => `ml-auto ${knopf(isActive)}`} style={({ isActive }) => stil(isActive)}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" /></svg>
        </NavLink>
      </nav>
      <AnimatePresence>
        {offen && (
          <motion.div key={offen} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="absolute inset-x-0 top-full border-b border-white/5 bg-[#06080f]/95 px-6 py-3 backdrop-blur-xl lg:px-10">
            <div className="flex flex-wrap items-center gap-2">
              <p className="mr-2 text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: `rgb(${TEAL})` }}>{offen}</p>
              {GRUPPEN.find((g) => g.titel === offen)!.seiten.map((s) => (
                <NavLink key={s.pfad} to={`/community/${s.pfad}`} onClick={() => setOffen(null)}
                  className={`min-w-[200px] rounded-2xl border px-4 py-2.5 transition ${istAktiv(s) ? 'border-teal-300/40 bg-teal-300/10' : 'border-white/10 bg-white/[0.03] hover:border-teal-300/30 hover:bg-white/[0.06]'}`}>
                  <p className="text-sm font-bold text-white">{s.titel}</p>
                  <p className="text-[11px] text-white/45">{s.text}</p>
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Community() {
  return (
    <div className="min-h-screen">
      <Kopf bereich="community" />
      <GruppenNav />
      <main className="px-6 py-8 lg:px-10">
        <Suspense fallback={<Laedt farbe={TEAL} />}>
          <Routes>
            <Route index element={<Uebersicht />} />
            <Route path="map" element={<Karte />} />
            <Route path="map-evolution" element={<Entwicklung />} />
            <Route path="weapons/*" element={<Waffen />} />
            <Route path="assets/*" element={<Assets />} />
            <Route path="*" element={<Seiten />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
