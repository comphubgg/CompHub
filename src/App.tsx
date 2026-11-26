import { AnimatePresence, motion } from 'framer-motion';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Baustelle from './teile/Baustelle';
import Hintergrund from './teile/Hintergrund';
import Start from './seiten/Start';
import Competitive from './seiten/Competitive';
import Rahmen from './seiten/comp/Rahmen';
import Rankings from './seiten/comp/Rankings';
import Events from './seiten/comp/Events';
import EventDetail from './seiten/comp/EventDetail';
import Spieler from './seiten/comp/Spieler';
import Statistics from './seiten/comp/Statistics';
import DeepStats from './seiten/comp/DeepStats';
import Replays from './seiten/comp/Replays';
import MatchFinder from './seiten/comp/MatchFinder';
import Tierlist from './seiten/comp/Tierlist';
import Fncs from './seiten/comp/Fncs';
import Maps from './seiten/comp/mehr/maps/Maps';
import MapsKarte from './seiten/comp/mehr/maps/MapsKarte';
import TurnierKarte from './seiten/comp/mehr/maps/TurnierKarte';
import Globals from './seiten/comp/mehr/Globals';
import GlobalsSolos from './seiten/comp/mehr/GlobalsSolos';
import Predictions from './seiten/comp/mehr/Predictions';
import { AwardsKategorie, AwardsUebersicht } from './seiten/comp/mehr/Awards';
import Scrims from './seiten/comp/mehr/Scrims';
import Pov, { PovAnsicht, PovEinladung } from './seiten/comp/mehr/pov/Pov';
import { OrgKonto, OrgsListe, TeamSeite } from './seiten/comp/mehr/Orgs';
import Community from './seiten/community/Community';
import Streamer from './seiten/streamer/Streamer';
import Admin from './seiten/admin/Admin';
import KontoSeite from './seiten/konto/Konto';
import Nachrichten from './seiten/konto/Nachrichten';
import Passwort from './seiten/konto/Passwort';


/*
 * CompHub Hub - lokale Vorschau (Betreiber, 26.11.2026: "CompHub 3.0 ... only localhost ... Startbildschirm wie Fortnite: mittig Competitive,
 * links Community, rechts VIP/Streamer"). Laeuft nur auf dem PC des Betreibers; Daten von thecomphub.com ueber den Proxy (vite.config.ts).
 */
export default function App() {
  const ort = useLocation();
  // Wechsel zwischen Start und den Bereichen mit Bewegung (Betreiber: "man soll sich ein bisschen bewegen muessen, nicht einfach switchen").
  const bereich = ort.pathname.split('/')[1] || 'start';
  return (
    <div className="relative min-h-full">
      <Hintergrund />
      <AnimatePresence mode="wait">
      <motion.div key={bereich} className="relative" initial={{ opacity: 0, scale: bereich === 'start' ? 1.04 : 0.97, filter: 'blur(8px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: bereich === 'start' ? 0.96 : 1.03, filter: 'blur(8px)' }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
        <Routes location={ort}>
          <Route path="/" element={<Start />} />
          <Route path="/competitive" element={<Rahmen />}>
            <Route index element={<Competitive />} />
            <Route path="rankings" element={<Rankings />} />
            <Route path="events" element={<Events />} />
            <Route path="events/:id" element={<EventDetail />} />
            <Route path="player/:id" element={<Spieler />} />
            <Route path="statistics" element={<Statistics />} />
            <Route path="deep-stats" element={<DeepStats />} />
            <Route path="replays" element={<Replays />} />
            <Route path="match-finder" element={<MatchFinder />} />
            <Route path="streams" element={<Navigate to="/streamer/streams" replace />} />
            <Route path="tierlist" element={<Tierlist />} />
            <Route path="fncs" element={<Fncs />} />
            <Route path="maps" element={<Maps />} />
            <Route path="maps/cup" element={<MapsKarte />} />
            <Route path="maps/view" element={<TurnierKarte />} />
            <Route path="globals/*" element={<Globals />} />
            <Route path="globals-solos/*" element={<GlobalsSolos />} />
            <Route path="predictions" element={<Predictions />} />
            <Route path="awards" element={<AwardsUebersicht />} />
            <Route path="awards/:kategorie" element={<AwardsKategorie />} />
            <Route path="scrims" element={<Scrims />} />
            <Route path="pov" element={<Pov />} />
            <Route path="pov/invite" element={<PovEinladung />} />
            <Route path="pov/view" element={<PovAnsicht />} />
            <Route path="orgs" element={<OrgsListe />} />
            <Route path="team/:org" element={<TeamSeite />} />
            <Route path="org" element={<OrgKonto />} />
            <Route path="tournament-maps" element={<Navigate to="/competitive/maps" replace />} />
            <Route path="*" element={<Baustelle text="Diese Seite wird gebaut …" />} />
          </Route>
          <Route path="/community/*" element={<Community />} />
          <Route path="/streamer/*" element={<Streamer />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/account/*" element={<KontoSeite />} />
          <Route path="/messages" element={<Nachrichten />} />
          <Route path="/password" element={<Passwort />} />
          <Route path="*" element={<Start />} />
        </Routes>
      </motion.div>
      </AnimatePresence>
    </div>
  );
}
