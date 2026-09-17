import type { MetadataRoute } from 'next';

// Die Seitenkarte fuer Suchmaschinen.
//
// Nur die oeffentlichen Seiten. Der Admin-Bereich, das eigene Konto und die
// Anmeldung stehen bewusst nicht darin - sie haben in keiner Trefferliste
// etwas verloren.
//
// "priority" ist ein Hinweis, kein Befehl: Google gewichtet laengst nach
// eigenen Regeln. Die Startseite steht trotzdem oben, weil sie das ist,
// wonach jemand sucht, der "CompHub" eingibt.

export const dynamic = 'force-static';

function wurzel() {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
    .trim().replace(/\/+$/, '');
}

export default function sitemap(): MetadataRoute.Sitemap {
  const w = wurzel();
  const jetzt = new Date();

  const seiten: Array<[string, number, MetadataRoute.Sitemap[0]['changeFrequency']]> = [
    ['', 1, 'weekly'],
    ['/statistiken', 0.9, 'daily'],
    ['/events', 0.8, 'daily'],
    ['/power-rankings', 0.8, 'daily'],
    ['/tierlist', 0.6, 'weekly'],
    ['/streams', 0.5, 'weekly'],
    ['/overlays', 0.4, 'monthly'],
  ];

  return seiten.map(([pfad, priority, changeFrequency]) => ({
    url: `${w}${pfad}`,
    lastModified: jetzt,
    changeFrequency,
    priority,
  }));
}
