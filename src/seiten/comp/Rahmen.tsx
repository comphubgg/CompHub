import { Outlet } from 'react-router-dom';
import CompNav from '../../teile/CompNav';
import Kopf from '../../teile/Kopf';

/** Rahmen aller Competitive-Seiten: Kopf, Unter-Navigation, Inhalt. */
export default function Rahmen() {
  return (
    <div className="min-h-screen">
      <Kopf bereich="competitive" />
      <CompNav />
      <main className="px-6 py-8 lg:px-10"><Outlet /></main>
    </div>
  );
}
