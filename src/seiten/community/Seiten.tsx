import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Laedt, TEAL } from './Teile';
import Uebersicht from './Uebersicht';
import { KartenRotation, XpRechner } from './SeitenSaison';
import { Benachrichtigungen, News, Stats, Turniere } from './SeitenLive';

// Kosmetik, persoenliche Listen und die uebrigen Menuepunkte der Spezifikation - je ein eigener Chunk (src/seiten/community/kosmetik).
const Shop = lazy(() => import('./kosmetik/Shop'));
const K = lazy(() => import('./kosmetik/Seiten'));
// Live-Seiten auf Epics Fortnite Data API (Player Count, Creative + Insel-Detail, Discover, Creators)
const Spielerzahl = lazy(() => import('./epic/Live').then((m) => ({ default: m.Spielerzahl })));
const Creative = lazy(() => import('./epic/Live').then((m) => ({ default: m.Creative })));
const InselDetail = lazy(() => import('./epic/Live').then((m) => ({ default: m.InselDetail })));
// Season (Design 3.0) - laedt Kosmetik und News von fortnite-api.com, deshalb eigener Chunk
const SaisonSeite = lazy(() => import('./SaisonSeite'));
const L = ({ c }: { c: ReactNode }) => <Suspense fallback={<Laedt farbe={TEAL} />}>{c}</Suspense>;

/* Die kleineren Community-Seiten (eigener Chunk, damit die Karte und die Waffen nicht mitgeladen werden muessen). */
export default function Seiten() {
  return (
    <Routes>
      <Route path="rotation" element={<KartenRotation />} />
      <Route path="season" element={<L c={<SaisonSeite />} />} />
      <Route path="xp" element={<XpRechner />} />
      <Route path="players" element={<L c={<Spielerzahl />} />} />
      <Route path="creative" element={<L c={<Creative />} />} />
      <Route path="creative/:code" element={<L c={<InselDetail />} />} />
      <Route path="news" element={<News />} />
      <Route path="tournaments" element={<Turniere />} />
      <Route path="stats" element={<Stats />} />
      <Route path="notifications" element={<Benachrichtigungen />} />
      <Route path="shop" element={<L c={<Shop />} />} />
      {['cosmetics', 'cosmetics/:id', 'new', 'free', 'jam-tracks', 'cosmetic-stats', 'most-used', 'wishlist', 'locker', 'collections', 'rankings', 'rankings/:liste',
        'discover', 'creators', 'social', 'sprites', 'treasure-hunt', 'lorebook'].map((p) => <Route key={p} path={p} element={<L c={<K />} />} />)}
      <Route path="*" element={<Uebersicht />} />
    </Routes>
  );
}
