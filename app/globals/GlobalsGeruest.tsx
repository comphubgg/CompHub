'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import T from '@/app/components/T';
import { useT } from '@/app/components/SprachProvider';
import { useZugang } from '@/app/lib/zugang';
import LadeSchirm from '@/app/components/LadeSchirm';
import { GLOBALS_TITEL } from '@/lib/globalsCup';

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
  const darfHinein = zugang.admin || zugang.rechte.includes('globals');

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
    <main className="flex-1 bg-zinc-950 text-slate-200">
      {/*
        * Die Kopfzeile des Turniers.
        *
        * Dasselbe Bild, das auch hinter den Overlays liegt: Epics Banner,
        * aus dem Logo und Schrift heraus sind. Darueber dieselbe schwarze
        * Folie - so gehoert die Seite sichtbar zum Overlay-Aussehen.
        */}
      <div className="relative overflow-hidden border-b border-amber-500/25">
        <div aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url('/overlay/globals/fncs-breit.jpg')" }} />
        <div aria-hidden
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${FNCS_BLAU}55, transparent 55%), rgba(0,0,0,.72)` }} />

        <div className="relative mx-auto max-w-[1500px] px-4 py-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em]
                        text-amber-300/80">
            VIP · 26.–27.09.2026
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl"
            style={{ color: '#ffd766' }}>
            {GLOBALS_TITEL}
          </h1>

          <nav className="mt-4 flex flex-wrap gap-1.5">
            {GLOBALS_SEITEN.map((s) => {
              const an = hier === s.pfad || hier.startsWith(`${s.pfad}/`);
              return (
                <Link key={s.pfad} href={s.pfad} title={t(s.was)}
                  className={`rounded-lg px-3.5 py-2 text-sm transition ${
                    an
                      ? 'bg-amber-400/15 font-semibold text-amber-200 ring-1 ring-amber-400/40'
                      : 'text-slate-300 hover:bg-white/5 hover:text-amber-200'}`}>
                  <T>{s.titel}</T>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className={`mx-auto py-6 ${breit ? 'w-full px-2 sm:px-3' : 'max-w-[1500px] px-4'}`}>
        {children}
      </div>
    </main>
  );
}
