import { Route, Routes } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { useWer } from '../../teile/Anmeldung';
import { BereichNav, VIOLETT } from '../community/Teile';
import Tor from './Tor';
import Dashboard from './Dashboard';
import LiveJetzt from './LiveJetzt';
import Overlays from './Overlays';
import MeineSeite from './MeineSeite';
import { istVip } from './zugang';

/*
 * Streamer-Bereich (Betreiber, 26.11.2026): fuer alle sichtbar, der Inhalt braucht eine Anmeldung.
 *   - nicht angemeldet: violettes Glas-Tor mit "Sign in", "Create account" und dem kleinen Link zum VIP-Zugangsschluessel
 *   - jedes Konto (kostenlos, "fuer kleine Streamer"): wer gerade live ist, Streams, einfache Overlays, eine einfache eigene Seite
 *   - VIP (Zugangsschluessel oder Rolle/Rechte am Konto): alles - Match Finder, erweiterte Overlays, Streamer-Seite, Twitch-Bot
 * Gemountet unter /streamer/* (src/App.tsx), daher die eigenen Routes hier.
 */
const SEITEN = [
  { pfad: '', titel: 'Dashboard' },
  { pfad: 'live', titel: 'Live now' },
  { pfad: 'overlays', titel: 'Overlays' },
  { pfad: 'my-page', titel: 'My page' },
];

export default function Streamer() {
  const { wer } = useWer();
  const drin = !!wer?.userName;
  const vip = istVip(wer);
  return (
    <div className="min-h-screen">
      <Kopf bereich="streamer" />
      {drin && (
        <BereichNav basis="/streamer" seiten={SEITEN} farbe={VIOLETT}
          rechts={<span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${vip ? 'bg-violet-400 text-[#06080f]' : 'border border-white/10 text-white/60'}`}>{vip ? 'VIP' : 'Free'}</span>} />
      )}
      <main className="px-6 py-8 lg:px-10">
        {!drin ? <Tor /> : (
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="live" element={<LiveJetzt />} />
            <Route path="overlays" element={<Overlays />} />
            <Route path="my-page" element={<MeineSeite />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
