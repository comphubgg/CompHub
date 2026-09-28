import type { NextConfig } from 'next';

/*
 * Die alten deutschen Adressen fuehren weiter - dauerhaft umgeleitet.
 *
 * Der Betreiber: "mach meine URLs, also zum Beispiel anmelden, alle auf
 * Englisch." Die Seiten heissen seit dem 21.9.2026 englisch (sign-in,
 * account, maps, statistics, ...). Was noch auf die alten Namen zeigt -
 * Lesezeichen, Discord-Nachrichten, Mails, Suchmaschinen - kommt hier an.
 */
const ALTE_ADRESSEN: Array<[string, string]> = [
  ['/anmelden', '/sign-in'],
  ['/konto', '/account'],
  ['/karten', '/maps'],
  ['/statistiken', '/statistics'],
  ['/prognosen', '/predictions'],
  ['/nachrichten', '/messages'],
  ['/passwort', '/password'],
  ['/kontakt', '/contact'],
  ['/admin/archiv', '/admin/archive'],
  ['/admin/dienste', '/admin/services'],
  ['/admin/kontakt', '/admin/contact'],
  ['/admin/konten', '/admin/accounts'],
  ['/admin/prognosen', '/admin/predictions'],
  ['/admin/sektionen', '/admin/sections'],
  ['/admin/spieler', '/admin/players'],
  ['/admin/wechseln', '/admin/switch'],
];

const nextConfig: NextConfig = {
  /*
   * Ein eigenstaendiger Server fuer einen eigenen Host (Dockerfile.web).
   *
   * Am 27.9.2026 hat Vercel die Seite wegen aufgebrauchter Rechenzeit
   * gesperrt; der Betreiber will weder zahlen noch einen Probezeitraum. Das
   * Paket fuer einen anderen, dauerhaft kostenlosen Host entsteht mit
   * COMPHUB_STANDALONE=1 - bei Vercel bleibt alles wie bisher.
   */
  ...(process.env.COMPHUB_STANDALONE ? { output: 'standalone' as const } : {}),
  turbopack: {
    root: __dirname,
  },
  /*
   * Spielerfotos, die der Betreiber im Admin-Werkzeug hochlaedt, liegen im
   * Objektspeicher statt im Ordner public/spielerbilder. Dieselbe Adresse
   * fuer beide: was dort nicht als Datei liegt, liefert die Schnittstelle.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        { source: '/spielerbilder/:datei', destination: '/api/spielerbild/hochladen?datei=:datei' },
      ],
    };
  },
  async redirects() {
    return ALTE_ADRESSEN.flatMap(([alt, neu]) => [
      { source: alt, destination: neu, permanent: true },
      { source: `${alt}/:pfad*`, destination: `${neu}/:pfad*`, permanent: true },
    ]);
  },
  webpack(config, { dev }) {
    if (dev) {
      if (!config.watchOptions) {
        config.watchOptions = {};
      }
      config.watchOptions.ignored = [
        /node_modules/,
        /\.git/,
        /\.next/,
        /\.vercel/,
        /\.venv/,
        /tmp/
      ];
    }
    return config;
  },
};

export default nextConfig;
