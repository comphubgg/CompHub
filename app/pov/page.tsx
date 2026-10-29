'use client';

import Link from 'next/link';
import T from '@/app/components/T';
import LadeSchirm from '@/app/components/LadeSchirm';
import { useZugang } from '@/app/lib/zugang';
import { useEffect } from 'react';
import ProDashboard from '@/app/admin/ProDashboard';
import VipPov from '@/app/pov/VipPov';
import VipVorhang from '@/app/overlays/VipVorhang';

/*
 * Das Dashboard der Profis: nur POV und Einstellungen (Betreiber, 11.10.2026).
 *
 * Profis melden sich ganz normal an; von dort geht es hierher. Der Admin darf die Seite ebenfalls
 * oeffnen (er sieht seine eigenen POV-Einstellungen, zum Ausprobieren).
 */
export default function ProSeite() {
  const zugang = useZugang();
  // Im Programm (CompHub POV) gleich zur Anmeldung - dort gibt es keine Startseite, auf der man sie suchen koennte.
  const imProgramm = typeof navigator !== 'undefined' && /CompHubPOV\//.test(navigator.userAgent);
  const brauchtAnmeldung = !zugang.laedt && !zugang.pro && !zugang.admin && !zugang.vip;
  useEffect(() => {
    if (imProgramm && brauchtAnmeldung) window.location.href = '/sign-in?weiter=%2Fpov';
  }, [imProgramm, brauchtAnmeldung]);
  if (zugang.laedt) return <LadeSchirm />;
  /*
   * VIPs sehen hier ihren eigenen Bereich (Betreiber, 27./29.10.2026): wie POV funktioniert, Pros per Link anmelden, den Bot auf den eigenen Discord holen.
   * Der Admin kommt mit ?ansicht=vip ebenfalls dorthin.
   */
  const vipAnsicht = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('ansicht') === 'vip';
  // Pro-POVs sind ein VIP-Werkzeug, das der Admin je VIP freischaltet (lib/rechte).
  if (zugang.vip && !zugang.pro && !zugang.admin && !zugang.rechte.includes('propov')) {
    return <VipVorhang titel="Pro-POVs sind für dein Konto noch nicht freigeschaltet." text="CompHub schaltet es je VIP frei - schreib uns kurz auf Discord." />;
  }
  if ((zugang.vip && !zugang.pro && !zugang.admin) || (zugang.admin && vipAnsicht)) return <VipPov />;
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
