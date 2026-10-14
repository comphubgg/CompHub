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

const CUPS = [
  '/tournaments/Fortnite Performance Evaluation.jpg', '/tournaments/FNCS Division 1.jpg',
  '/cups/fncs-global-championship-2026-hd.jpg', '/tournaments/Reload Elite Series Finals.jpg',
];
/** Karten verschiedener Updates, verkleinert ueber den Bildweg der Seite (Dateinamen wie bei fortnite.gg). */
const KARTEN = ['42.30.webp', '41.30.webp', '40.40.jpg', '39.51.jpg', '37.50.jpg', '34.40.jpg?3', '31.40.jpg?3', '26.30.jpg?3']
  .map((n) => `/api/maps-bild?u=${encodeURIComponent(`https://fortnite.gg/img/maps/${n}`)}&b=420`);

const kachel = (src: string, i: number) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img key={`${src}-${i}`} src={encodeURI(src).replace(/%25/g, '%')} alt="" loading="lazy" draggable={false}
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
