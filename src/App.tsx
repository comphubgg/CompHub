import { Route, Routes } from 'react-router-dom';
import Baustelle from './teile/Baustelle';
import Hintergrund from './teile/Hintergrund';

/*
 * CompHub Hub - lokale Vorschau (Betreiber, 26.11.2026: "CompHub 3.0 ... only localhost ... Startbildschirm wie Fortnite: mittig Competitive,
 * links Community, rechts VIP/Streamer"). Laeuft nur auf dem PC des Betreibers; Daten von thecomphub.com ueber den Proxy (vite.config.ts).
 */
export default function App() {
  return (
    <div className="relative min-h-full">
      <Hintergrund />
      <div className="relative">
        <Routes>
          <Route path="*" element={<Baustelle text="Startbildschirm kommt …" />} />
        </Routes>
      </div>
    </div>
  );
}
