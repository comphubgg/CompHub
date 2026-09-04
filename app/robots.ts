import type { MetadataRoute } from 'next';

// Was Suchmaschinen lesen duerfen.
//
// Ohne diese Datei durchsuchen sie auch den Admin-Bereich und die
// Schnittstellen - beides gehoert nicht in eine Trefferliste. Der Admin ist
// ohnehin gesperrt, aber eine Adresse, die in Google auftaucht, laedt zum
// Klopfen ein.
//
// Die Adresse der Sitemap kommt aus derselben Umgebungsvariablen wie alles
// andere; steht dort noch localhost, schadet das nichts - dann liest sie
// ohnehin niemand.

export const dynamic = 'force-static';

function wurzel() {
  return (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000')
    .trim().replace(/\/+$/, '');
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/admin/', '/konto', '/anmelden'],
    },
    sitemap: `${wurzel()}/sitemap.xml`,
  };
}
