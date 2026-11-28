import Link from '../Link';
import { usePathname } from '../Link';
import T from '../T';
import { useT } from '../sprache';
import { useZugang } from '../zugang';
import LadeSchirm from '../LadeSchirm';
import NurVip from '../NurVip';

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
    pfad: '/streamer/overlays/globals', titel: 'Overlays',
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
  /** Der Pfad des aktiven Bereichs, etwa "/streamer/overlays/globals". */
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

  // Ohne Zugang: dieselbe violette Glas-Karte wie die anderen VIP-Werkzeuge (Anmelden / Zugangsschluessel) statt nacktem Text
  if (!darfHinein) return <NurVip text="The Globals overlays are granted individually — a regular account cannot open them." />;

  return (
    <div className="relative isolate text-white/85">
      {/*
        * Aussehen wie die Solo-Seite (Betreiber, 20.10.2026: "die soll auch aussehen wie die Solo-Seite" und "Globals 2026" als Titel): der gemeinsame Seitenkopf mit
        * dem Blau der Startseite, darunter die Reiter als Pillen. Frueher stand hier ein goldener Kopf mit Banner.
        */}
      <div className={`space-y-5 ${breit ? 'w-full px-2 sm:px-3' : ''}`}>
        <Link href="/streamer/overlays" className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-akz">
          <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4l-6 6 6 6" /></svg>All overlays
        </Link>
        {/*
          * Kopf mit dem Bild des Turniers (Betreiber, 30.10.2026: "Ich LIEBE Bilder" - wie bei den Solos): links der Titel, rechts das Bild der
          * Global Championship 2026 ganz. Farben fest, damit der helle Modus den Kopf nicht umfaerbt.
          */}
        <section className="relative isolate overflow-hidden rounded-3xl border border-white/[0.08] bg-[#09090b] shadow-[0_20px_50px_rgba(0,0,0,.4)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cups/fncs-global-championship-2026-hd.jpg" alt="" aria-hidden className="absolute inset-0 -z-10 h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
          <div className="grid items-center gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_minmax(0,560px)]">
            <div className="order-2 lg:order-1">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-[#7dd3fc]"><T>FNCS · Antwerpen · 26.–27.09.2026</T></p>
              <h1 className="mt-1 text-4xl font-black uppercase leading-[0.95] tracking-tight text-[#fff] sm:text-6xl">Globals <span className="text-[#38bdf8]">2026</span></h1>
              <p className="mt-3 max-w-xl text-sm text-[#cbd5e1]"><T>Die FNCS Global Championship an einem Ort: Overlays für deinen Stream, das Feld, die Karte, der Tipp auf den Ausgang und das Preisgeld.</T></p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cups/fncs-global-championship-2026-hd.jpg" alt="FNCS Global Championship 2026"
              className="order-1 aspect-video w-full rounded-2xl border border-white/10 object-cover shadow-[0_16px_40px_rgba(0,0,0,.5)] lg:order-2" />
          </div>
        </section>

        <nav className="flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-white/10 bg-fl p-1 shadow-sm">
          {GLOBALS_SEITEN.map((s) => {
            const an = hier === s.pfad || hier.startsWith(`${s.pfad}/`);
            return (
              <Link key={s.pfad} href={s.pfad} title={t(s.was)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${an ? 'bg-akz text-[#04050a] shadow' : 'text-white/55 hover:text-white'}`}>
                <T>{s.titel}</T>
              </Link>
            );
          })}
        </nav>

        {children}
      </div>
    </div>
  );
}
