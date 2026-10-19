'use client';

/*
 * Der Hintergrund der Seiten Maps und FNCS: die laufenden Reihen aus Karten der Startseite, ueber die ganze Seite und beim Scrollen stehen bleibend.
 *
 * Der Betreiber (19.10.2026): "bei Maps und FNCS den Hintergrund wie auf der Homepage - die animierten Maps mit den Spots -, darueber 90 Prozent Schwarz,
 * ueber die ganze Seite, auch beim Scrollen." Es sind dieselben Bilder und dieselbe Bewegung wie im Kopf der Startseite (HeroHintergrund, Klasse
 * .hero-reihe in design.css); hier nur Karten, und die Folie darueber ist fast schwarz, damit Tabellen und Kacheln lesbar bleiben. Im hellen Modus steht er
 * nicht da (Regel in design.css).
 *
 * Gebraucht wird ein Elternelement mit "relative isolate": dann liegt dieser Hintergrund ueber dessen Farbe und unter allem, was darin steht.
 */

const KARTEN = ['42.30.webp', '41.30.webp', '40.40.jpg', '39.51.jpg', '37.50.jpg', '34.40.jpg?3', '31.40.jpg?3', '26.30.jpg?3', '36.30.jpg?3', '33.40.jpg?3']
  .map((n) => `/api/maps-bild?u=${encodeURIComponent(`https://fortnite.gg/img/maps/${n}`)}&b=420`);

function Reihe({ bilder, dauer, rueck = false }: { bilder: string[]; dauer: number; rueck?: boolean }) {
  return (
    <div className={`hero-reihe ${rueck ? 'rueck' : ''}`} style={{ ['--dauer' as string]: `${dauer}s` }}>
      {[...bilder, ...bilder].map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}-${i}`} src={src} alt="" loading="lazy" draggable={false}
          className="h-44 w-72 shrink-0 rounded-2xl object-cover shadow-lg sm:h-56 sm:w-96" />
      ))}
    </div>
  );
}

export default function KartenHintergrund() {
  const a = KARTEN;
  const b = [...KARTEN.slice(3), ...KARTEN.slice(0, 3)].reverse();
  const c = [...KARTEN.slice(6), ...KARTEN.slice(0, 6)];
  return (
    <div aria-hidden data-karten-hg className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute left-1/2 top-1/2 flex w-[170%] -translate-x-1/2 -translate-y-1/2 -rotate-[5deg] flex-col gap-5">
        <Reihe bilder={a} dauer={120} />
        <Reihe bilder={b} dauer={140} rueck />
        <Reihe bilder={c} dauer={130} />
        <Reihe bilder={[...a].reverse()} dauer={150} rueck />
      </div>
      <div className="absolute inset-0 bg-black/90" />
    </div>
  );
}
