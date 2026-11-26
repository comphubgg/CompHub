import { NavLink } from 'react-router-dom';

/* Die Unterseiten von Competitive - jede eine eigene Seite im Hub (Betreiber, 26.11.2026: "einzelne Seiten, nicht alles auf eine Seite"). */
export const COMP_SEITEN = [
  { pfad: '', titel: 'Overview' },
  { pfad: 'rankings', titel: 'Rankings' },
  { pfad: 'events', titel: 'Events' },
  { pfad: 'statistics', titel: 'Statistics' },
  { pfad: 'deep-stats', titel: 'Deep Stats' },
  { pfad: 'match-finder', titel: 'Match Finder' },
  { pfad: 'replays', titel: 'Replays' },
  { pfad: 'streams', titel: 'Streams' },
  { pfad: 'tierlist', titel: 'Tierlist' },
  { pfad: 'fncs', titel: 'FNCS' },
];

export default function CompNav() {
  return (
    <div className="sticky top-[57px] z-20 border-b border-white/5 bg-[#06080f]/60 backdrop-blur-xl">
      <nav className="flex gap-1 overflow-x-auto px-6 py-2 lg:px-10">
        {COMP_SEITEN.map((s) => (
          <NavLink key={s.pfad} to={`/competitive${s.pfad ? `/${s.pfad}` : ''}`} end
            className={({ isActive }) => `relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition ${isActive ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}>
            {s.titel}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
