import { Route, Routes } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { useWer } from '../../teile/Anmeldung';
import { BereichNav, VIOLETT } from '../community/Teile';
import Tor from './Tor';
import Dashboard from './Dashboard';
import LiveJetzt from './LiveJetzt';
import { Navigate } from 'react-router-dom';
import Overlays from './Overlays';
import MeineSeite from './MeineSeite';
import Vip from './Vip';
import TwitchBot from './ov/TwitchBot';
import TwitchStatistik from './ov/TwitchStatistik';
import StreamerSeite from './ov/StreamerSeite';
import TeamkarteBaukasten from './ov/teamkarte/Baukasten';
import StandingsBaukasten from './ov/standings/Baukasten';
import OffspawnBaukasten from './ov/offspawn/Baukasten';
import CustomBaukasten from './ov/custom/Baukasten';
import CustomSteuerung from './ov/custom/Steuerung';
import FinestBaukasten from './ov/finest/Baukasten';
import FcSteuerung from './ov/finest/Steuerung';
import TimerSeite from './ov/timer/Seite';
import QualSeite from './ov/qual/Seite';
import TextSeite from './ov/text/Seite';
import GlobalsOverlays from './ov/globals/Uebersicht';
// Streams (Multiview) gehoert seit 26.11.2026 in den Streamer-Bereich (Betreiber: "unter Competitive soll die Stream-Seite nicht mehr sein")
import Streams from '../comp/Streams';
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
  { pfad: 'streams', titel: 'Streams' },
  { pfad: 'overlays', titel: 'Overlays' },
  { pfad: 'twitch-bot', titel: 'Twitch bot' },
  { pfad: 'twitch-stats', titel: 'Twitch stats' },
  { pfad: 'my-page', titel: 'My page' },
  { pfad: 'vip', titel: 'VIP' },
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
            <Route path="streams" element={<Streams />} />
            {/* Die Overlays der Seite (main: app/overlays/**, app/globals/overlays/**) - Baukaesten, Steuerseiten, Globals */}
            <Route path="overlays" element={<Overlays />} />
            <Route path="overlays/teamkarte" element={<TeamkarteBaukasten />} />
            <Route path="overlays/standings" element={<StandingsBaukasten />} />
            <Route path="overlays/timer" element={<TimerSeite />} />
            <Route path="overlays/qual" element={<QualSeite />} />
            <Route path="overlays/offspawn" element={<OffspawnBaukasten />} />
            <Route path="overlays/text" element={<TextSeite />} />
            <Route path="overlays/custom" element={<CustomBaukasten />} />
            <Route path="overlays/custom/control" element={<CustomSteuerung />} />
            <Route path="overlays/finest" element={<FinestBaukasten />} />
            <Route path="overlays/finest/control" element={<FcSteuerung />} />
            <Route path="overlays/studio" element={<Navigate to="/streamer/overlays" replace />} />
            <Route path="overlays/globals" element={<GlobalsOverlays />} />
            <Route path="overlays/globals/standings" element={<StandingsBaukasten key="g" globals />} />
            <Route path="overlays/globals/teamkarte" element={<TeamkarteBaukasten key="g" globals />} />
            <Route path="overlays/globals/custom" element={<OffspawnBaukasten key="g" globals />} />
            <Route path="twitch-bot" element={<TwitchBot />} />
            <Route path="twitch-stats" element={<TwitchStatistik />} />
            <Route path="page/:kanal" element={<StreamerSeite />} />
            <Route path="vip" element={<Vip />} />
            <Route path="my-page" element={<MeineSeite />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        )}
      </main>
    </div>
  );
}
