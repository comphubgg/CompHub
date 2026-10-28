'use client';

/*
 * Das Band hinter der Ueberschrift der Seiten FNCS (Events) und Maps: die laufenden Reihen der Startseite - Karten und Vorschaubilder der Cups -, 90 Prozent Schwarz
 * darueber und unten ausgeblendet. Der Betreiber (19./20.10.2026): zuerst "ueber die ganze Seite, auch beim Scrollen", dann "nur oben, da wo FNCS steht - hinter den
 * Karten braucht es das gar nicht". Es sind dieselben Bilder und dieselbe Bewegung wie im Kopf der Startseite (HeroHintergrund, .hero-reihe in design.css). Im hellen
 * Modus steht es nicht da (Regel in design.css).
 *
 * Gebraucht wird ein Elternelement mit "relative isolate": dann liegt das Band ueber dessen Farbe und unter allem, was darin steht.
 */

const KARTEN = ['42.30.webp', '41.30.webp', '40.40.jpg', '39.51.jpg', '37.50.jpg', '34.40.jpg?3', '31.40.jpg?3', '26.30.jpg?3', '36.30.jpg?3', '33.30.jpg?3']
  .map((n) => `/api/maps-bild?u=${encodeURIComponent(`https://fortnite.gg/img/maps/${n}`)}&b=420`);

/** Die Vorschaubilder der FNCS-Events (public/cups, public/tournaments) - was oben auf den Karten der FNCS-Seite steht. */
export const FNCS_BILDER = [
  '/cups/fncs-global-championship-2026-hd.jpg', '/cups/fncs-grand-finals.webp', '/cups/major-1-summit-2026.webp', '/cups/fncs-solo-reload.webp',
  '/cups/global-championship-2025.webp', '/cups/fncs-major.webp', '/cups/fncs-invitational-2022.webp', '/tournaments/FNCS Major 2 Finals.jpg',
].map(encodeURI);

/** Vorschaubilder fuer die Seiten Maps und Solos. */
export const CUP_BILDER = [
  '/cups/fncs-solo-reload.webp', '/cups/reload-cup.webp', '/cups/solo-series.webp', '/cups/elite-cup.webp',
  '/cups/fncs-grand-finals.webp', '/cups/world-cup.webp', '/cups/reload-road-to-ewc.webp', '/tournaments/Solo Victory Cup.jpg',
].map(encodeURI);

/** Karten und Cup-Bilder abwechselnd: nach je zwei Karten ein Cup-Bild. */
function mischen(karten: string[], cups: string[], ab: number): string[] {
  if (!cups.length) return karten;
  const raus: string[] = [];
  let c = ab;
  karten.forEach((k, i) => {
    raus.push(k);
    if (i % 2 === 1) raus.push(cups[c++ % cups.length]);
  });
  return raus;
}

function Reihe({ bilder, dauer, rueck = false }: { bilder: string[]; dauer: number; rueck?: boolean }) {
  return (
    <div className={`hero-reihe ${rueck ? 'rueck' : ''}`} style={{ ['--dauer' as string]: `${dauer}s` }}>
      {[...bilder, ...bilder].map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}-${i}`} src={src} alt="" loading="lazy" draggable={false}
          className="h-36 w-60 shrink-0 rounded-2xl object-cover shadow-lg sm:h-40 sm:w-72" />
      ))}
    </div>
  );
}

/**
 * hoehe: wie weit das Band nach unten reicht (Pixel). Am 20.10.2026 wollte der Betreiber den Hintergrund nur oben, hinter der Ueberschrift - nicht hinter den
 * Karten: "hinter den Events braucht es das gar nicht". Das Band blendet unten in das Schwarz der Seite aus.
 */
export default function KartenHintergrund({ cups = [], hoehe = 340 }: { cups?: string[]; hoehe?: number }) {
  const a = mischen(KARTEN, cups, 0);
  const b = mischen([...KARTEN.slice(3), ...KARTEN.slice(0, 3)].reverse(), cups, 3);
  const c = mischen([...KARTEN.slice(6), ...KARTEN.slice(0, 6)], cups, 5);
  return (
    <div aria-hidden data-karten-hg className="pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden" style={{ height: hoehe }}>
      <div className="absolute left-1/2 top-0 flex w-[170%] -translate-x-1/2 -translate-y-6 -rotate-[4deg] flex-col gap-4">
        <Reihe bilder={a} dauer={120} />
        <Reihe bilder={b} dauer={140} rueck />
        <Reihe bilder={c} dauer={130} />
      </div>
      <div className="absolute inset-0 bg-black/90" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-zinc-950" />
    </div>
  );
}
