import { Route, Routes } from 'react-router-dom';
import Kopf from '../../teile/Kopf';
import { BereichNav, TEAL } from './Teile';
import Uebersicht from './Uebersicht';
import Karte from './Karte';
import Waffen from './Waffen';

/*
 * Community-Bereich (Betreiber, 26.11.2026: "alles, was fortnite.gg hat, plus genaue Details, die sonst niemand hat"). Eigene Unterseiten mit
 * Unter-Navigation in Teal; gemountet unter /community/* (src/App.tsx), daher die eigenen Routes hier.
 */
const SEITEN = [
  { pfad: '', titel: 'Overview' },
  { pfad: 'map', titel: 'Map' },
  { pfad: 'weapons', titel: 'Weapons' },
];

export default function Community() {
  return (
    <div className="min-h-screen">
      <Kopf bereich="community" />
      <BereichNav basis="/community" seiten={SEITEN} farbe={TEAL} />
      <main className="px-6 py-8 lg:px-10">
        <Routes>
          <Route index element={<Uebersicht />} />
          <Route path="map" element={<Karte />} />
          <Route path="weapons" element={<Waffen />} />
          <Route path="*" element={<Uebersicht />} />
        </Routes>
      </main>
    </div>
  );
}
