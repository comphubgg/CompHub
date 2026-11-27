import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { Laedt, TEAL } from './Teile';
import Uebersicht from './Uebersicht';

/*
 * Community-Bereich (Betreiber, 26.11.2026: "alles, was fortnite.gg hat, plus genaue Details, die sonst niemand hat"; Spezifikation mit 30
 * Menuepunkten). Die Unter-Navigation: zwei Reiter-Reihen (Gruppen, darunter deren Seiten) - siehe GruppenNav. Gemountet unter /community/* (src/App.tsx), daher die eigenen Routes hier.
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
  { titel: 'Cosmetics', seiten: [
    { pfad: 'shop', titel: 'Item Shop', text: "Today's shop, last seen, history" },
    { pfad: 'cosmetics', titel: 'Cosmetics', text: 'Every cosmetic – search and filter' },
    { pfad: 'new', titel: 'New in the files', text: 'Added with the latest update' },
    { pfad: 'free', titel: 'Free Cosmetics', text: 'Free rewards and time left' },
    { pfad: 'jam-tracks', titel: 'Jam Tracks', text: "Today's tracks and the library" },
    { pfad: 'cosmetic-stats', titel: 'Cosmetic Stats', text: 'Longest wait, most shop days' },
    { pfad: 'most-used', titel: 'Most Seen', text: 'Most days in the item shop' },
  ] },
  { titel: 'Mine', seiten: [
    { pfad: 'wishlist', titel: 'My Wishlist', text: 'What you want – and when it’s in the shop' },
    { pfad: 'locker', titel: 'My Locker', text: 'What you own, value and progress' },
    { pfad: 'collections', titel: 'My Collections', text: 'Your lists of Creative maps' },
    { pfad: 'rankings', titel: 'Rankings', text: 'Rate cosmetics and seasons' },
  ] },
  { titel: 'Season', seiten: [
    { pfad: 'season', titel: 'Season Countdown', text: 'Live event and season end' },
    { pfad: 'xp', titel: 'XP Calculator', text: 'XP per day for your level goal' },
    { pfad: 'treasure-hunt', titel: 'Treasure Hunt', text: 'Rewards, chances, mark as found' },
    { pfad: 'sprites', titel: 'Sprites', text: 'Owned and mastered tracker' },
    { pfad: 'lorebook', titel: 'Lorebook', text: 'The story, chapter by chapter' },
  ] },
  { titel: 'Live', seiten: [
    { pfad: 'players', titel: 'Player Count', text: 'Online now and history' },
    { pfad: 'creative', titel: 'Creative', text: 'Most played islands' },
    { pfad: 'news', titel: 'News', text: 'Latest in-game news' },
    { pfad: 'discover', titel: 'Discover', text: 'What the Discover screen shows' },
    { pfad: 'creators', titel: 'Creators', text: 'Top Creative makers' },
    { pfad: 'social', titel: 'Community', text: 'Discord, X, Reddit and more' },
  ] },
  { titel: 'Compete', seiten: [
    { pfad: 'tournaments', titel: 'Tournaments', text: 'Upcoming cups and results' },
    { pfad: 'stats', titel: 'Stats', text: 'Look up any player' },
  ] },
];

/** Welche Seite der Liste gehoert zur aktuellen Adresse (auch Unterseiten wie weapons/<id>, cosmetics/<id>, creative/<code>)? */
function seiteAktiv(s: Eintrag, pfad: string) {
  return pfad === `/community/${s.pfad}`
    || (s.pfad === 'weapons' && /^\/community\/weapons\/(?!compare|changes)/.test(pfad)) || (s.pfad === 'assets' && pfad.startsWith('/community/assets'))
    || (s.pfad === 'cosmetics' && pfad.startsWith('/community/cosmetics/')) || (s.pfad === 'rankings' && pfad.startsWith('/community/rankings/'))
    || (s.pfad === 'creative' && pfad.startsWith('/community/creative/'));
}

/*
 * Zwei Reihen Reiter (Betreiber 27.11.2026: keine Ausklapp-Menues, in die man "hineinfahren" muss): oben die Gruppen, darunter - immer
 * sichtbar, solange man in der Gruppe ist - deren Seiten. Ein Klick auf eine Gruppe oeffnet ihre erste Seite. Die Markierung gleitet
 * (layoutId), die zweite Reihe gleitet beim Gruppenwechsel ein. Auf dem Handy scrollen beide Reihen waagerecht, der aktive Reiter rollt ins Bild.
 */
function GruppenNav() {
  const ort = useLocation();
  const geh = useNavigate();
  const pfad = ort.pathname.replace(/\/$/, '');
  const gruppe = GRUPPEN.find((g) => g.seiten.some((s) => seiteAktiv(s, pfad)));
  const uebersicht = pfad === '/community';
  const reihe1 = useRef<HTMLDivElement>(null); const reihe2 = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const r of [reihe1, reihe2]) r.current?.querySelector('[data-aktiv="1"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [pfad]);
  const reiter = 'relative shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors';
  return (
    <div className="sticky top-[57px] z-30 border-b border-white/5 bg-[#06080f]/75 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-4 pt-2 sm:px-6 lg:px-10">
        <nav ref={reihe1} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ titel: 'Overview', ziel: '/community', aktiv: uebersicht }, ...GRUPPEN.map((g) => ({ titel: g.titel, ziel: `/community/${g.seiten[0].pfad}`, aktiv: g === gruppe }))].map((g) => (
            <button key={g.titel} type="button" data-aktiv={g.aktiv ? '1' : '0'} onClick={() => geh(g.ziel)} className={`${reiter} ${g.aktiv ? 'text-white' : 'text-white/50 hover:text-white'}`}>
              {g.aktiv && <motion.span layoutId="komm-gruppe" className="absolute inset-0 rounded-xl" style={{ background: `rgba(${TEAL},0.16)`, boxShadow: `inset 0 0 0 1px rgba(${TEAL},0.4)` }} transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{g.titel}</span>
            </button>
          ))}
        </nav>
        <NavLink to="/community/notifications" title="Notifications" className={({ isActive }) => `${reiter} ${isActive ? 'bg-teal-300/15 text-white ring-1 ring-teal-300/40' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" /></svg>
        </NavLink>
      </div>
      <AnimatePresence initial={false} mode="wait">
        {gruppe ? (
          <motion.nav key={gruppe.titel} ref={reihe2} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center gap-1 overflow-x-auto px-4 pb-0 pt-1 [scrollbar-width:none] sm:px-6 lg:px-10 [&::-webkit-scrollbar]:hidden">
            {gruppe.seiten.map((s, i) => {
              const an = seiteAktiv(s, pfad);
              return (
                <motion.div key={s.pfad} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.025, duration: 0.2 }} className="shrink-0">
                  <Link to={`/community/${s.pfad}`} data-aktiv={an ? '1' : '0'} title={s.text} className={`relative block px-3 pb-2.5 pt-1.5 text-[13px] font-medium transition-colors ${an ? 'text-white' : 'text-white/45 hover:text-white/85'}`}>
                    {s.titel}
                    {an && <motion.span layoutId="komm-seite" className="absolute inset-x-2 bottom-0 h-[2px] rounded-full" style={{ background: `rgb(${TEAL})`, boxShadow: `0 0 12px rgba(${TEAL},0.7)` }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  </Link>
                </motion.div>
              );
            })}
          </motion.nav>
        ) : <motion.div key="leer" initial={{ height: 0 }} animate={{ height: 8 }} exit={{ height: 0 }} />}
      </AnimatePresence>
    </div>
  );
}

export default function Community() {
  // Schluessel fuer den Seitenwechsel: die Seite ohne Unterpfad (Wechsel innerhalb einer Waffe/eines Kosmetikteils blendet nicht neu ein)
  const seitenSchluessel = useLocation().pathname.replace(/^\/community\/?/, '').split('/').slice(0, 2).join('/');
  return (
    <div className="min-h-screen">
      <Kopf bereich="community" />
      <GruppenNav />
      <main className="px-4 py-8 sm:px-6 lg:px-10">
        <MotionConfig reducedMotion="user">
        <Suspense fallback={<Laedt farbe={TEAL} />}>
          {/* Seitenwechsel: kurz einblenden und hochgleiten (kein Warten auf ein Ausblenden - fuehlt sich schneller an) */}
          <motion.div key={seitenSchluessel} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
          <Routes>
            <Route index element={<Uebersicht />} />
            <Route path="map" element={<Karte />} />
            <Route path="map-evolution" element={<Entwicklung />} />
            <Route path="weapons/*" element={<Waffen />} />
            <Route path="assets/*" element={<Assets />} />
            <Route path="*" element={<Seiten />} />
          </Routes>
          </motion.div>
        </Suspense>
        </MotionConfig>
      </main>
    </div>
  );
}
