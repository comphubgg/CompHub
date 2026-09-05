import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { cookies } from "next/headers";
import MainHeader from './components/MainHeader';
import SprachProvider from './components/SprachProvider';
import { SPRACH_COOKIE } from './lib/sprache';
import type { Sprache } from './lib/sprache';
import Sprachschalter from './components/Sprachschalter';
import ChatFenster from "@/app/components/ChatFenster";
import PreviewTour from './components/PreviewTour';
import RouteTransitionLoader from './components/RouteTransitionLoader';
import Besuchszaehler from './components/Besuchszaehler';
import SektionSperre from './components/SektionSperre';
import SperrSeite from './components/SperrSeite';
import { sperreFuerAufruf, sektionsLage } from '@/lib/sektionen-server';
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Was Google und die sozialen Netze zu sehen bekommen.
 *
 * Die Beschreibung stand hier auf Englisch und beschrieb ein Streamer-
 * Dashboard - das war das Werkzeug einmal. Wer heute nach "CompHub" oder
 * "Fortnite Competitive Stats" sucht, findet damit nichts Passendes.
 *
 * Wichtig sind drei Dinge:
 *
 *   title.template  - jede Unterseite bekommt "… | CompHub" angehaengt,
 *                     statt dass ueberall derselbe Titel steht. Google
 *                     wertet gleiche Titel als duenne Seiten.
 *   description     - der Text unter dem Treffer. Er entscheidet, ob
 *                     jemand klickt, und sollte sagen, was es gibt.
 *   metadataBase    - ohne ihn bleiben Vorschaubilder relativ und damit
 *                     auf X und Discord leer.
 *
 * Die Adresse kommt aus der Umgebung. Solange dort localhost steht, schadet
 * das nichts - dann liest es ohnehin keine Suchmaschine.
 */
const WURZEL = (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
  .trim().replace(/\/+$/, '');

export const metadata: Metadata = {
  metadataBase: new URL(WURZEL),
  /*
   * Englisch, wie die Seite selbst.
   *
   * Diese Angaben stehen im Quelltext und sind das, was Google indexiert -
   * anders als die Oberflaeche lassen sie sich nicht je Besucher umschalten.
   * Da die Voreinstellung englisch ist und die Szene englisch schreibt,
   * gehoert auch der Treffer in der Suche englisch.
   */
  title: {
    default: 'CompHub — Fortnite Competitive Stats, Tournaments and Rankings',
    template: '%s | CompHub',
  },
  description: 'Stats, tournaments and rankings for competitive Fortnite: '
    + 'damage, materials, builds and placements across ten seasons and seven '
    + 'regions — plus streams and your own tier lists.',
  keywords: ['Fortnite', 'Competitive', 'FNCS', 'Stats', 'Tournaments',
    'Leaderboard', 'CompHub', 'Fortnite Comp', 'Fortnite Competitive Stats'],
  applicationName: 'CompHub',
  openGraph: {
    type: 'website',
    siteName: 'CompHub',
    title: 'CompHub — Fortnite Competitive',
    description: 'Stats, tournaments and rankings for competitive Fortnite.',
    url: WURZEL,
    images: [{ url: '/logos/CompHub-Logo.png', width: 1200, height: 1200 }],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@CompHub_gg',
    title: 'CompHub — Fortnite Competitive',
    description: 'Stats, tournaments and rankings for competitive Fortnite.',
    images: ['/logos/CompHub-Logo.png'],
  },
  alternates: { canonical: WURZEL },
  robots: { index: true, follow: true },
};

/*
 * Der Rahmen wird bei jeder Anfrage neu gezeichnet.
 *
 * Ohne diese Zeile hat Next sein Ergebnis wiederverwendet - und weil die
 * allererste Zeichnung ohne Sprach-Cookie geschah, blieb der Server auf
 * Englisch stehen, waehrend der Browser auf Deutsch umschaltete. React
 * meldete das als Hydration-Abweichung, und Deutsch ueberlebte kein
 * Neuladen. Der Rahmen liest ohnehin Cookies, den Pfad und den Zustand der
 * Bereiche; er kann gar nicht sinnvoll vorgezeichnet werden.
 */
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Die Sprache aus dem Cookie lesen, bevor irgendetwas gezeichnet wird.
  // Dadurch liefert der Server dieselbe Sprache, die der Browser gleich
  // darauf erwartet - ohne das waere die erste Zeichnung immer deutsch und
  // muesste im Browser verworfen werden.
  /*
   * Englisch ist die Voreinstellung.
   *
   * Die Wettkampfszene schreibt englisch - die Beitraege, die Turniernamen,
   * die Kennzahlen. Wer die Seite zum ersten Mal oeffnet, kommt mit hoher
   * Wahrscheinlichkeit von dort und nicht aus dem deutschsprachigen Raum.
   *
   * Deutsch bleibt vollstaendig da: ein Klick auf DE, und das Cookie merkt
   * sich das. Nur der erste Eindruck ist englisch.
   *
   * Entschieden wird das hier auf dem Server, nicht im Browser - sonst
   * stuende einen Wimpernschlag lang die falsche Sprache da, und React
   * bemaengelte den Unterschied zwischen beiden Fassungen.
   */
  const gemerkt = (await cookies()).get(SPRACH_COOKIE)?.value;
  const sprache: Sprache = gemerkt === 'de' ? 'de' : 'en';

  /*
   * Ist dieser Bereich gerade zu?
   *
   * Hier, vor dem Zeichnen, und nicht erst im Browser: sonst stuende der
   * Inhalt eines abgeschalteten Bereichs trotzdem im Quelltext, und wer
   * die Adresse kennt, koennte ihn lesen. Der Admin bekommt hier nie
   * etwas - er soll ueberall hinkommen.
   */
  const sperre = await sperreFuerAufruf();
  const lage = await sektionsLage();

  return (
    <html
      lang={sprache}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href="/fonts/fonts.css" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@300;400;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
      </head>
      <body className="min-h-full flex flex-col">
        {/* Die Sprache umschliesst alles - Kopfzeile, Seite und den
            Umschalter selbst -, damit ein Klick unten rechts die ganze
            Oberflaeche umstellt und nicht nur einen Teil. */}
        <SprachProvider anfang={sprache}>
          <Suspense fallback={<RouteTransitionLoader />}>
            <MainHeader sektionenAnfang={lage} />
            <PreviewTour />
            {/*
              * Die Sperre liegt zwischen Kopfzeile und Inhalt - die Leiste
              * bleibt also stehen, und wer vor einer zugesperrten Tuer
              * steht, kommt mit einem Klick woandershin.
              *
              * Zwei Stufen: hat der Server schon entschieden, dass hier
              * nichts hingehoert, wird der Inhalt gar nicht erst
              * ausgeliefert. Sonst haelt die Fassung im Browser Ausschau,
              * damit ein Umschalten binnen Sekunden greift, ohne dass
              * jemand neu laden muss.
              */}
            {sperre
              ? <SperrSeite angaben={sperre} />
              : <SektionSperre>{children}</SektionSperre>}
          </Suspense>
          <Sprachschalter />
          {/* Das Gespraech mit dem Betreiber. Links am Rand, damit es dem
              Sprachschalter unten rechts nicht in die Quere kommt. */}
          <ChatFenster />
          {/*
            * Zaehlt, dass diese Seite geoeffnet wurde - sichtbar ist davon
            * nichts. Steht hier im Rahmen, damit auch die Wechsel ohne
            * Neuladen erfasst werden; ausgewertet wird das unten im
            * Dashboard.
            */}
          <Besuchszaehler />
        </SprachProvider>
      </body>
    </html>
  );
}
