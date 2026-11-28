import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Schale from '../../ds/Schale';
import { BEREICHE, aktiveSeite } from '../../ds/seiten';
import { Laedt } from '../../ds/Bausteine';
import { useWer } from '../../teile/Anmeldung';
import Landung from './Landung';
import Studio from './Studio';
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

/*
 * Streamer-Bereich, neu gebaut auf dem Design-System 3.0 (Betreiber, 27.11.2026: "vor allem der Streamer-Bereich ... wird komplett neu gebaut").
 * Zugang (Betreiber, 26.11.2026): der Bereich ist fuer alle sichtbar, der Inhalt braucht eine Anmeldung.
 *   - nicht angemeldet: die Landung - sie ZEIGT den Bereich (wer live ist, die Overlays als echte Vorschau, kostenlos gegen VIP) mit
 *     "Sign in", "Create account" und dem VIP-Zugangsschluessel; kein blosses Tor
 *   - jedes Konto (kostenlos, "fuer kleine Streamer"): Studio, Live Streams mit Multiview, die Overlays ohne Cup-Daten, die eigene Seite
 *   - VIP (Zugangsschluessel oder Rolle/Rechte am Konto): alles mit Live-Cupdaten, Twitch-Bot und -Statistik; Admins sehen alles
 * Rahmen und Leiste kommen aus der Schale (src/ds/Schale.tsx, Seiten in src/ds/seiten.ts). Gemountet unter /streamer/* (src/App.tsx).
 */
export default function Streamer() {
  const { wer } = useWer();
  const ort = useLocation();
  const drin = !!wer?.userName;
  // Bis die Auskunft da ist, kurz warten statt die Landung aufblitzen zu lassen; bleibt sie aus (Seite nicht erreichbar), kommt die Landung.
  const [gewartet, setGewartet] = useState(false);
  useEffect(() => { const z = setTimeout(() => setGewartet(true), 1500); return () => clearTimeout(z); }, []);
  const wunsch = aktiveSeite(BEREICHE.streamer, ort.pathname);
  return (
    <Schale bereich="streamer">
      {wer === null && !gewartet ? <Laedt text="Checking your access" /> : !drin ? <Landung wunsch={wunsch && wunsch.pfad ? wunsch.titel : undefined} /> : (
        <Routes>
          <Route index element={<Studio />} />
          {/* "Live now" und "Streams" sind eine Seite - die Multiview liegt darunter als eigene Adresse */}
          <Route path="live" element={<Navigate to="/streamer/streams" replace />} />
          <Route path="streams/*" element={<Streams />} />
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
          <Route path="*" element={<Studio />} />
        </Routes>
      )}
    </Schale>
  );
}
