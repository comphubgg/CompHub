'use client';

import { useEffect, useState } from 'react';

/*
 * Der Hintergrund der Startseite: eine Vorschau auf die Seite selbst (Betreiber, 14.10.2026: "so wirklich hintergrundmaessig eine Preview von
 * meiner Webseite - Bilder, wie das, was auf der Homepage ist ... die Homepage ist mir zu simpel").
 *
 * Drei Reihen aus Cup-Bannern, Karten der Updates und Spielerfotos laufen langsam gegeneinander, leicht schraeg gestellt. Ein Schleier in der
 * Farbe des Grundes liegt darueber, damit die Schrift davor lesbar bleibt (.hero-schleier in design.css). Alles sind Bilder, die die Seite ohnehin
 * zeigt; die Spielerfotos kommen aus /api/startvitrine.
 */

/*
 * Kleine Kopien in public/hero (scripts/hero-bilder.mjs), je 10 bis 50 KB (7.11.2026). Vorher kamen die Karten ueber /api/maps-bild von fortnite.gg und
 * lieferten 404, die Banner waren bis 600 KB gross - auf der Startseite liefen dadurch leere Kacheln durchs Bild.
 */
const CUPS = ['/hero/cup-performance.webp', '/hero/cup-division.webp', '/hero/cup-global.webp', '/hero/cup-reload.webp'];
const KARTEN = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `/hero/karte-${n}.webp`);

const kachel = (src: string, i: number) => (
  // eslint-disable-next-line @next/next/no-img-element
  // Nicht "lazy": die Reihen laufen schraeg ins Bild, der Browser lud die Kacheln dort oft erst, wenn sie schon sichtbar und leer waren.
  <img key={`${src}-${i}`} src={encodeURI(src).replace(/%25/g, '%')} alt="" decoding="async" draggable={false}
    className="h-36 w-56 shrink-0 rounded-2xl object-cover shadow-lg sm:h-44 sm:w-72" />
);

/** Eine Reihe: die Bilder zweimal hintereinander, damit der Lauf nahtlos von vorn beginnt. */
function Reihe({ bilder, dauer, rueck = false }: { bilder: string[]; dauer: number; rueck?: boolean }) {
  return (
    <div className={`hero-reihe ${rueck ? 'rueck' : ''}`} style={{ ['--dauer' as string]: `${dauer}s` }}>
      {[...bilder, ...bilder].map(kachel)}
    </div>
  );
}

export default function HeroHintergrund() {
  const [spieler, setSpieler] = useState<string[]>([]);
  useEffect(() => {
    let weg = false;
    fetch('/api/startvitrine').then((r) => r.json())
      .then((j) => { if (!weg && Array.isArray(j?.spieler)) setSpieler((j.spieler as Array<{ bild: string | null }>).map((s) => s.bild).filter((b): b is string => !!b).slice(0, 10)); })
      .catch(() => { /* ohne Fotos laufen Banner und Karten allein */ });
    return () => { weg = true; };
  }, []);

  const a = CUPS.flatMap((c, i) => [c, KARTEN[i]]);
  const b = spieler.length >= 5 ? spieler : [...spieler, ...CUPS, ...KARTEN.slice(0, 4)];
  const c = [...KARTEN.slice(4), ...CUPS.slice().reverse(), ...KARTEN.slice(0, 4)];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 flex w-[160%] -translate-x-1/2 -translate-y-1/2 -rotate-[5deg] flex-col gap-4 opacity-[.65]">
        <Reihe bilder={a} dauer={90} />
        <Reihe bilder={b} dauer={110} rueck />
        <Reihe bilder={c} dauer={100} />
        <Reihe bilder={[...a].reverse()} dauer={120} rueck />
      </div>
      <div className="hero-schleier absolute inset-0" />
    </div>
  );
}
