import { motion, MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Schale from '../../ds/Schale';
import { Laedt } from '../../ds/Bausteine';
import Uebersicht from './Uebersicht';

/*
 * Community-Bereich (Betreiber, 26.11.2026: "alles, was fortnite.gg hat, plus genaue Details, die sonst niemand hat"). Rahmen seit dem
 * Design-System 3.0: die gemeinsame Schale (src/ds/Schale.tsx) - Kopf, "Menu"-Fenster mit allen Seiten und die kurze Leiste der Hauptseiten;
 * die Seitenliste steht in src/ds/seiten.ts (dort auch "Notifications"). Gemountet unter /community/* (src/App.tsx), daher die eigenen Routes hier.
 * Die Karte laeuft ohne Innenabstand (ohneRand): sie fuellt den ganzen Bildschirm unter der Leiste.
 */
const Karte = lazy(() => import('./Karte'));
const Waffen = lazy(() => import('./Waffen'));
const Entwicklung = lazy(() => import('./Entwicklung'));
const Assets = lazy(() => import('./Assets'));
const Seiten = lazy(() => import('./Seiten'));

export default function Community() {
  const pfad = useLocation().pathname.replace(/\/$/, '');
  // Schluessel fuer den Seitenwechsel: die Seite ohne Unterpfad (Wechsel innerhalb einer Waffe/eines Kosmetikteils blendet nicht neu ein)
  const seitenSchluessel = pfad.replace(/^\/community\/?/, '').split('/').slice(0, 2).join('/');
  const vollflaechig = pfad === '/community/map';
  return (
    <Schale bereich="community" ohneRand={vollflaechig}>
      <MotionConfig reducedMotion="user">
        <Suspense fallback={<Laedt />}>
          {/* Seitenwechsel: kurz einblenden (kein Warten auf ein Ausblenden - fuehlt sich schneller an). Nur Deckkraft, kein Verschieben: ein
              transformierter Rahmen wuerde fest stehende Leisten (Vergleich, Karte) an sich binden. */}
          <motion.div key={seitenSchluessel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <Routes>
              <Route index element={<Uebersicht />} />
              <Route path="map" element={<Karte />} />
              <Route path="map-evolution" element={<Entwicklung />} />
              <Route path="weapons/*" element={<Waffen />} />
              <Route path="assets/*" element={<Assets />} />
              <Route path="*" element={<Seiten />} />
            </Routes>
          </motion.div>
        </Suspense>
      </MotionConfig>
    </Schale>
  );
}
