'use client';

import { useEffect, useState } from 'react';

/*
 * Der Hintergrund der Startseite: eine Vorschau auf die Seite selbst (Betreiber, 14.10.2026: "so wirklich hintergrundmaessig eine Preview von
 * meiner Webseite - Bilder, wie das, was auf der Homepage ist ... die Homepage ist mir zu simpel").
 *
 * Drei Reihen aus Cup-Bannern, Karten der Updates und Spielerfotos laufen langsam gegeneinander, leicht schraeg gestellt. Ein Schleier in der
 * Farbe des Grundes liegt darueber, damit die Schrift davor lesbar bleibt (.hero-schleier in design.css). Alles sind Bilder, die die Seite ohnehin
 * zeigt; die Spielerfotos (alle gerade oeffentlichen) kommen aus /api/startvitrine ("fotos", lib/aktuelleFotos).
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
    className={`h-36 w-56 shrink-0 rounded-2xl object-cover shadow-lg sm:h-44 sm:w-72 ${src.includes('/spielerbilder') ? 'object-[center_18%]' : ''}`} />
);

/** Eine Reihe: die Bilder zweimal hintereinander, damit der Lauf nahtlos von vorn beginnt. */
function Reihe({ bilder, dauer, rueck = false }: { bilder: string[]; dauer: number; rueck?: boolean }) {
  return (
    <div className={`hero-reihe ${rueck ? 'rueck' : ''}`} style={{ ['--dauer' as string]: `${dauer}s` }}>
      {[...bilder, ...bilder].map(kachel)}
    </div>
  );
}

/** Zufaellige Reihenfolge - jeder Besuch zeigt die Fotos anders gemischt. */
function gemischt<T>(liste: T[]): T[] {
  const a = liste.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Die Fotos reihum zwischen die Banner und Karten einer Reihe stecken: Kachel, Foto, Kachel, Foto ... */
function verzahnt(grund: string[], fotos: string[]): string[] {
  const aus: string[] = [];
  const n = Math.max(grund.length, fotos.length);
  for (let i = 0; i < n; i++) {
    if (i < grund.length) aus.push(grund[i]);
    if (i < fotos.length) aus.push(fotos[i]);
  }
  return aus;
}

export default function HeroHintergrund() {
  const [spieler, setSpieler] = useState<string[]>([]);
  useEffect(() => {
    let weg = false;
    /*
     * Alle Spielerfotos, die gerade oeffentlich sind ("fotos", 17.11.2026) - vorher nur die zehn der Vitrine, und von denen hatten nach dem
     * Neuanfang der Fotos nur vier eines: der Hintergrund lief fast ohne Spieler. Ein neu freigegebenes Foto kommt mit der naechsten Antwort dazu.
     */
    fetch('/api/startvitrine').then((r) => r.json())
      .then((j) => {
        if (weg) return;
        const alle = Array.isArray(j?.fotos) ? (j.fotos as Array<{ bild?: string | null }>).map((f) => f.bild)
          : Array.isArray(j?.spieler) ? (j.spieler as Array<{ bild: string | null }>).map((s) => s.bild) : [];
        setSpieler(gemischt([...new Set(alle.filter((b): b is string => !!b))]));
      })
      .catch(() => { /* ohne Fotos laufen Banner und Karten allein */ });
    return () => { weg = true; };
  }, []);

  // Die Fotos reihum auf die vier Reihen verteilt und dort zwischen Banner und Karten gesteckt.
  const teil = (r: number) => spieler.filter((_, i) => i % 4 === r);
  const grund = [
    CUPS.flatMap((c, i) => [c, KARTEN[i]]),
    [...CUPS, ...KARTEN.slice(0, 4)],
    [...KARTEN.slice(4), ...CUPS.slice().reverse(), ...KARTEN.slice(0, 4)],
    CUPS.flatMap((c, i) => [c, KARTEN[i]]).reverse(),
  ];
  const reihen = grund.map((g, r) => verzahnt(g, teil(r)));
  // Eine laengere Reihe braucht laenger fuer denselben Weg - sonst liefe sie mit vielen Fotos sichtbar schneller als die anderen.
  const dauer = (basis: number, reihe: string[]) => Math.round(basis * Math.max(1, reihe.length / 8));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 flex w-[160%] -translate-x-1/2 -translate-y-1/2 -rotate-[5deg] flex-col gap-4 opacity-[.65]">
        <Reihe bilder={reihen[0]} dauer={dauer(90, reihen[0])} />
        <Reihe bilder={reihen[1]} dauer={dauer(110, reihen[1])} rueck />
        <Reihe bilder={reihen[2]} dauer={dauer(100, reihen[2])} />
        <Reihe bilder={reihen[3]} dauer={dauer(120, reihen[3])} rueck />
      </div>
      <div className="hero-schleier absolute inset-0" />
    </div>
  );
}
