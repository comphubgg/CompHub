import { Link } from 'react-router-dom';

/** Kopfzeile der Bereiche: Logo (zurueck zum Start), Bereichsname, Wechsel zwischen den Bereichen. */
export default function Kopf({ bereich }: { bereich: 'competitive' | 'community' | 'streamer' }) {
  const tab = (id: typeof bereich, text: string) => (
    <Link to={`/${id}`} className={`rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${bereich === id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}>{text}</Link>
  );
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080f]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
        <Link to="/" className="flex items-center gap-2">
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="h-8 w-auto" />
          <span className="text-lg font-extrabold tracking-tight text-white">Comp<span className="text-sky-400">Hub</span></span>
        </Link>
        <nav className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
          {tab('community', 'Community')}{tab('competitive', 'Competitive')}{tab('streamer', 'Streamer')}
        </nav>
      </div>
    </header>
  );
}
