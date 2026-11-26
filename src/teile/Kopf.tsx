import { Link } from 'react-router-dom';
import { useWer } from './Anmeldung';

/*
 * Kopfzeile der Bereiche (Betreiber, 26.11.2026): links das Logo - es fuehrt zurueck zum Startbildschirm, dort wechselt man den Bereich (kein
 * direkter Wechsel). Rechts Anmelden bzw. der angemeldete Name. Volle Breite.
 */
export default function Kopf({ bereich }: { bereich: 'competitive' | 'community' | 'streamer' }) {
  const { wer, oeffnen } = useWer();
  const farbe = bereich === 'community' ? 'text-teal-300' : bereich === 'streamer' ? 'text-violet-300' : 'text-sky-300';
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080f]/70 backdrop-blur-xl">
      <div className="flex items-center gap-4 px-6 py-3 lg:px-10">
        <Link to="/" title="Back to the hub" className="group flex items-center gap-2.5">
          <img src="/logos/CompHub-Logo-frei.png" alt="" className="h-8 w-auto transition group-hover:scale-110 group-hover:drop-shadow-[0_0_14px_rgba(56,189,248,0.7)]" />
          <span className="text-lg font-extrabold tracking-tight text-white">Comp<span className="text-sky-400">Hub</span></span>
          <span className={`ml-2 hidden rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] sm:inline ${farbe}`}>{bereich}</span>
        </Link>
        <div className="ml-auto">
          {wer?.userName ? (
            <span className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-3 pr-1.5 text-sm text-white">
              {wer.userName}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${wer.isAdmin ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/70'}`}>{wer.isAdmin ? 'Admin' : wer.rolle ?? 'User'}</span>
            </span>
          ) : (
            <button type="button" onClick={() => oeffnen('konto')} className="rounded-full bg-sky-400 px-4 py-2 text-sm font-bold text-[#06080f] transition hover:bg-sky-300">Sign in</button>
          )}
        </div>
      </div>
    </header>
  );
}
