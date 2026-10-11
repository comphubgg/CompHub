'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import ProDashboard from '@/app/admin/ProDashboard';

/*
 * Das Dashboard der Profis: nur POV und Einstellungen (Betreiber, 11.10.2026).
 *
 * Profis melden sich ganz normal an; von dort geht es hierher. Der Admin darf die Seite ebenfalls
 * oeffnen (er sieht seine eigenen POV-Einstellungen, zum Ausprobieren).
 */
export default function ProSeite() {
  const zugang = useZugang();
  if (zugang.laedt) return <LadeSchirm />;
  if (!zugang.pro && !zugang.admin) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für Profis</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <T>Dieses Dashboard gibt es nur für Profis mit freigeschaltetem Konto.</T>
          </p>
          <Link href="/sign-in" className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-400">
            <T>Zur Anmeldung</T>
          </Link>
        </div>
      </main>
    );
  }
  return <ProDashboard />;
}
