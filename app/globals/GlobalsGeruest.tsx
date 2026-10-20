'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import LadeSchirm from '@/app/components/LadeSchirm';
import SeitenKopf from '@/app/components/SeitenKopf';

/*
 * Das Geruest der Globals-Seiten.
 *
 * Der Betreiber wollte die Globals nicht als Anhaengsel der Overlay-Seite,
 * sondern als eigenen Ort: "die Globals (2026) Overlays muessen nicht unter
 * /overlays sein, wenn man im Dashboard drauf drueckt, sondern wirklich eine
 * eigene URL wie theCompHub.com/globals/overlays/<was fuer ein Overlay> ...
 * Dann kann man im VIP-Dashboard einfach die Globals-2026-Seite oeffnen und
 * die drei, vier verschiedenen Funktionen benutzen."
 *
 * Genau die stehen hier oben in der Leiste: die Overlays, die Karte, die
 * Teams und die Prognose. Das Aussehen folgt dem Turnier - Gold auf
 * Schwarz, das Blau aus dem FNCS-Zeichen -, damit man auf den ersten Blick
 * sieht, dass man nicht mehr im gewoehnlichen Werkzeug steht.
 */

/** Was es unter /globals gibt - dieselbe Reihenfolge wie in der Leiste. */
export const GLOBALS_SEITEN: Array<{
  pfad: string; titel: string; was: string;
}> = [
  {
    pfad: '/globals/overlays', titel: 'Overlays',
    was: 'Leaderboard, Spieler-Banner und freies Overlay - im Aussehen der Globals',
  },
  {
    pfad: '/globals/teams', titel: 'Teams',
    was: 'Wer im Feld steht, und aus welchem Land',
  },
  {
    pfad: '/globals/map', titel: 'Map',
    was: 'Die Karte des Turniers - wer wo landet',
  },
  {
    pfad: '/globals/predictions', titel: 'Predictions',
    was: 'Der Tipp auf den Ausgang',
  },
  {
    pfad: '/globals/prizepool', titel: 'Prize Pool',
    was: 'Jeder Platz mit seinem Preisgeld',
  },
];

/** Das Blau aus dem FNCS-Zeichen - aus dem Zeichen gelesen, nicht geraten. */
export const FNCS_BLAU = '#0e47de';
export const FNCS_GOLD = '#f5c542';

export default function GlobalsGeruest({ aktiv, breit, children }: {
  /** Der Pfad des aktiven Bereichs, etwa "/globals/overlays". */
  aktiv?: string;
  /**
   * Die volle Fensterbreite fuer den Inhalt - fuer die Prognose, deren
   * Karte so gross wie moeglich sein soll.
   */
  breit?: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  const zugang = useZugang();
  const pfad = usePathname();
  const hier = aktiv ?? pfad ?? '';

  if (zugang.laedt) return <LadeSchirm />;

  /*
   * Wer hereindarf.
   *
   * Der VIP-Bereich "globals" wird einzeln vergeben (siehe lib/rechte), und
   * der Admin hat ihn ohnehin - die Adminrolle schliesst jedes kleinere
   * Recht ein, ohne dass ihm jemand etwas anhaken muesste.
   */
  // Jeder VIP darf hinein (Betreiber, 12.10.2026: "Grand-Sachen sind eigentlich fuer jeden VIP immer sichtbar"); das Recht "globals" gilt weiter fuer Manager.
  const darfHinein = zugang.admin || zugang.vip || zugang.rechte.includes('globals');

  if (!darfHinein) {
    return (
      <main className="grid min-h-screen place-items-center bg-zinc-950 px-4
                       text-center text-slate-100">
        <div className="max-w-md">
          <h1 className="text-xl font-bold"><T>Nur für VIPs</T></h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            <T>Die Globals-Seite wird einzeln vergeben — mit einem
            gewöhnlichen Konto ist sie nicht zugänglich.</T>
          </p>
          <Link href="/sign-in"
            className="mt-6 inline-block rounded-lg bg-sky-500 px-5 py-2.5
                       text-sm font-semibold text-white transition
                       hover:bg-sky-400">
            <T>Zur Anmeldung</T>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative isolate flex-1 bg-zinc-950 text-slate-200">
      {/*
        * Aussehen wie die Solo-Seite (Betreiber, 20.10.2026: "die soll auch aussehen wie die Solo-Seite" und "Globals 2026" als Titel): der gemeinsame Seitenkopf mit
        * dem Blau der Startseite, darunter die Reiter als Pillen. Frueher stand hier ein goldener Kopf mit Banner.
        */}
      <div className={`mx-auto space-y-5 py-6 ${breit ? 'w-full px-2 sm:px-3' : 'max-w-[1500px] px-4'}`}>
        <Link href="/account" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-sky-400">
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4l-6 6 6 6" /></svg><T>Dashboard</T>
        </Link>
        <SeitenKopf marke={<T>FNCS · Antwerpen · 26.–27.09.2026</T>} titel={<>Globals <span className="text-sky-500">2026</span></>}
          text={<T>Die FNCS Global Championship an einem Ort: Overlays für deinen Stream, das Feld, die Karte, der Tipp auf den Ausgang und das Preisgeld.</T>} />

        <nav className="flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-zinc-800 bg-zinc-900 p-1 shadow-sm">
          {GLOBALS_SEITEN.map((s) => {
            const an = hier === s.pfad || hier.startsWith(`${s.pfad}/`);
            return (
              <Link key={s.pfad} href={s.pfad} title={t(s.was)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${an ? 'bg-sky-500 text-white shadow' : 'text-slate-400 hover:text-slate-100'}`}>
                <T>{s.titel}</T>
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </main>
  );
}
