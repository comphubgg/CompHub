import { Route, Routes } from 'react-router-dom';
import Baustelle from './teile/Baustelle';
import Hintergrund from './teile/Hintergrund';
import Start from './seiten/Start';
import Competitive from './seiten/Competitive';

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
          <Route path="/" element={<Start />} />
          <Route path="/competitive" element={<Competitive />} />
          <Route path="/community" element={<Baustelle text="Community wird gebaut …" />} />
          <Route path="/streamer" element={<Baustelle text="Streamer wird gebaut …" />} />
          <Route path="*" element={<Start />} />
        </Routes>
      </div>
    </div>
  );
}
