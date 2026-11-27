import { useEffect, useState } from 'react';
import { Glas } from '../../../teile/Glas';
import Besucherherkunft from '../port/app/components/Besucherherkunft';
import Nutzungszahlen from '../port/app/components/Nutzungszahlen';
import { NurAdmins, WerkzeugKopf } from '../teile';
import AdminZentrale from './AdminZentrale';
import Klappbar from './Klappbar';
import OfflineSeiten from './OfflineSeiten';

/*
 * Status & Besucher (main: /admin?bereich=statistik - "Admin-Statistik" im Dashboard): Admin-Center (Laeufe von GitHub Actions samt Schnellspur,
 * was wartet, offene Auftraege, Ladezeiten - /api/admin/zentrale, Replays aus /api/replays), Nutzung (/api/statistik/nutzung), Besucherherkunft
 * (/api/statistik/besucher) und die Offline-Seiten (/api/sektionen). Derselbe Code wie auf main (AdminZentrale, Nutzungszahlen, Besucherherkunft,
 * OfflineSeiten), im Glas-Stil. "Alles aktualisieren" fragt vorher nach - es startet die grossen Laeufe.
 */
export default function StatusSeite({ klassisch }: { klassisch?: () => void }) {
  const [recht, setRecht] = useState<boolean | null>(null);
  useEffect(() => { fetch('/api/admin/zentrale', { cache: 'no-store' }).then((r) => setRecht(r.status !== 401 && r.status !== 403)).catch(() => setRecht(true)); }, []);
  const kopf = <WerkzeugKopf ueber="Live & Cups" titel="Status & visitors" klassisch={klassisch}
    text="Do all jobs run (incl. the fast lane)? What is waiting for you, open tasks, page load times of the last 24 hours, visitors and usage, and which pages are offline." />;
  if (recht === false) return <>{kopf}<NurAdmins /></>;
  return (
    <>
      {kopf}
      <div className="space-y-5">
        <Glas className="p-6">
          <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.25em] text-rose-300">Admin center</h2>
          <AdminZentrale teil="status" zeigeLaeufe />
        </Glas>
        <Glas className="p-6" verzoegerung={0.08}>
          <Nutzungszahlen />
          <Besucherherkunft />
        </Glas>
        <Klappbar titel="Offline-Seiten" kennung="offline-seiten" hinweis="Was gerade nicht online ist">
          <OfflineSeiten />
        </Klappbar>
      </div>
    </>
  );
}
