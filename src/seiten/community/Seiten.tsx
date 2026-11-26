import { Route, Routes } from 'react-router-dom';
import Uebersicht from './Uebersicht';
import { KartenRotation, SaisonCountdown, XpRechner } from './SeitenSaison';
import { Benachrichtigungen, Creative, News, Spielerzahl, Stats, Turniere } from './SeitenLive';

/* Die kleineren Community-Seiten (eigener Chunk, damit die Karte und die Waffen nicht mitgeladen werden muessen). */
export default function Seiten() {
  return (
    <Routes>
      <Route path="rotation" element={<KartenRotation />} />
      <Route path="season" element={<SaisonCountdown />} />
      <Route path="xp" element={<XpRechner />} />
      <Route path="players" element={<Spielerzahl />} />
      <Route path="creative" element={<Creative />} />
      <Route path="news" element={<News />} />
      <Route path="tournaments" element={<Turniere />} />
      <Route path="stats" element={<Stats />} />
      <Route path="notifications" element={<Benachrichtigungen />} />
      <Route path="*" element={<Uebersicht />} />
    </Routes>
  );
}
