import { motion, MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { Laedt, TEAL } from './Teile';
import Uebersicht from './Uebersicht';

/*
 * Community-Bereich (Betreiber, 26.11.2026: "alles, was fortnite.gg hat, plus genaue Details, die sonst niemand hat"; Spezifikation mit 30
 * Menuepunkten). Die Unter-Navigation: eine Reiter-Reihe mit allen Seiten - siehe GruppenNav. Gemountet unter /community/* (src/App.tsx), daher die eigenen Routes hier.
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
    { pfad: 'weapons', titel: 'Weapons', text: 'All weapons with real stats' },
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
    { pfad: 'most-used', titel: 'Most Used', text: 'The cosmetics seen most often' },
  ] },
  { titel: 'Mine', seiten: [
    { pfad: 'wishlist', titel: 'Wishlist', text: 'What you want – and when it’s in the shop' },
    { pfad: 'locker', titel: 'Locker', text: 'What you own, value and progress' },
    { pfad: 'collections', titel: 'Collections', text: 'Your lists of Creative maps' },
    { pfad: 'rankings', titel: 'Rankings', text: 'Rate cosmetics and seasons' },
  ] },
  { titel: 'Season', seiten: [
    { pfad: 'season', titel: 'Season', text: 'Live event and season end' },
    { pfad: 'xp', titel: 'XP', text: 'XP per day for your level goal' },
    { pfad: 'treasure-hunt', titel: 'Treasure Hunt', text: 'Rewards, chances, mark as found' },
    { pfad: 'sprites', titel: 'Sprites', text: 'Owned and mastered tracker' },
    { pfad: 'lorebook', titel: 'Lorebook', text: 'The story, chapter by chapter' },
  ] },
  { titel: 'Live', seiten: [
    { pfad: 'players', titel: 'Player Count', text: 'Online now and history' },
    { pfad: 'creative', titel: 'Creative', text: 'Most played islands' },
    { pfad: 'discover', titel: 'Discover', text: 'What the Discover screen shows' },
    { pfad: 'creators', titel: 'Creators', text: 'Top Creative makers' },
    { pfad: 'news', titel: 'News', text: 'Latest in-game news' },
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
 * EINE Reiter-Reihe mit allen Community-Seiten nebeneinander (Betreiber 27.11.2026: keine zwei Reihen, kein Umschalten, keine Ausklapp-
 * Menues). Duenne Trennstriche zwischen den Gruppen, waagerecht scrollbar (Leiste versteckt, Rand blendet aus), die aktive Seite traegt die
 * gleitende Pille (layoutId) und rollt ins Bild. Klebt oben mit dichtem, dunklem Grund - nichts scheint durch.
 */
function GruppenNav() {
  const ort = useLocation();
  const pfad = ort.pathname.replace(/\/$/, '');
  const reihe = useRef<HTMLElement>(null);
  const [rand, setRand] = useState({ links: false, rechts: false });
  const randPruefen = () => {
    const r = reihe.current; if (!r) return;
    setRand({ links: r.scrollLeft > 4, rechts: r.scrollLeft + r.clientWidth < r.scrollWidth - 4 });
  };
  useEffect(() => {
    const r = reihe.current; if (!r) return;
    const a = r.querySelector<HTMLElement>('[data-aktiv="1"]');
    // nur waagerecht rollen (scrollIntoView wuerde auch die Seite verschieben)
    if (a) r.scrollTo({ left: a.offsetLeft - r.clientWidth / 2 + a.offsetWidth / 2, behavior: 'smooth' });
    randPruefen();
  }, [pfad]);
  useEffect(() => { window.addEventListener('resize', randPruefen); return () => window.removeEventListener('resize', randPruefen); }, []);
  const reiter = (an: boolean) => `relative block shrink-0 whitespace-nowrap rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-colors ${an ? 'text-white' : 'text-white/50 hover:text-white'}`;
  const pille = <motion.span layoutId="komm-reiter" className="absolute inset-0 rounded-xl" style={{ background: `rgba(${TEAL},0.18)`, boxShadow: `inset 0 0 0 1px rgba(${TEAL},0.45)` }} transition={{ type: 'spring', stiffness: 500, damping: 40 }} />;
  const blende = 'pointer-events-none absolute inset-y-0 z-10 w-12 transition-opacity duration-200';
  return (
    <div className="sticky top-[57px] z-30 border-b border-white/[0.06] bg-[#05070d] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
      <div className="flex items-center gap-2 px-6 py-2 lg:px-10">
        <div className="relative min-w-0 flex-1">
          <div className={`${blende} left-0 bg-gradient-to-r from-[#05070d] to-transparent ${rand.links ? 'opacity-100' : 'opacity-0'}`} />
          <div className={`${blende} right-0 bg-gradient-to-l from-[#05070d] to-transparent ${rand.rechts ? 'opacity-100' : 'opacity-0'}`} />
          <nav ref={reihe} onScroll={randPruefen} className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Link to="/community" data-aktiv={pfad === '/community' ? '1' : '0'} className={reiter(pfad === '/community')}>
              {pfad === '/community' && pille}<span className="relative">Overview</span>
            </Link>
            {GRUPPEN.map((g) => (
              <div key={g.titel} className="flex shrink-0 items-center gap-0.5">
                <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-white/10" title={g.titel} />
                {g.seiten.map((s) => {
                  const an = seiteAktiv(s, pfad);
                  return (
                    <Link key={s.pfad} to={`/community/${s.pfad}`} data-aktiv={an ? '1' : '0'} title={`${g.titel} · ${s.text}`} className={reiter(an)}>
                      {an && pille}<span className="relative">{s.titel}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <NavLink to="/community/notifications" title="Notifications" className={({ isActive }) => `shrink-0 rounded-xl px-2.5 py-1.5 transition ${isActive ? 'bg-teal-300/15 text-white ring-1 ring-teal-300/40' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" /></svg>
        </NavLink>
      </div>
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
      <main className="px-6 py-8 lg:px-10">
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
