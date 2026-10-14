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
  // forbidden() und unauthorized() (403/401) mit eigenen Fehlerseiten: app/forbidden.tsx, app/unauthorized.tsx.
  experimental: { authInterrupts: true },
  /*
   * Ein eigenstaendiger Server fuer einen eigenen Host (Dockerfile.web).
   *
   * Am 27.9.2026 hat Vercel die Seite wegen aufgebrauchter Rechenzeit
   * gesperrt; der Betreiber will weder zahlen noch einen Probezeitraum. Das
   * Paket fuer einen anderen, dauerhaft kostenlosen Host entsteht mit
   * COMPHUB_STANDALONE=1 - bei Vercel bleibt alles wie bisher.
   */
  ...(process.env.COMPHUB_STANDALONE ? { output: 'standalone' as const } : {}),
  /*
   * Was nicht in den Server-Teil gehoert.
   *
   * Netlify erlaubt fuer den Server einer Seite hoechstens 250 MB. Gemessen zog Next dafuer das
   * Replay-Paket (316 MB, nur fuer die Auswertung in den GitHub-Ablaeufen) und - auf dem Rechner
   * des Betreibers - ganze Datenordner (ueber 6 GB Replays) hinein. Der Live-Server liest seine
   * Daten aus dem GitHub-Archiv und vom Release, nie aus diesen Ordnern, und wertet keine Replays aus.
   */
  /*
   * Die Laufzeit fuer Schnittstellen ausdruecklich mitnehmen: bei Netlify fehlte
   * next/dist/compiled/next-server/app-route-turbo.runtime.prod.js im Server-Teil, und jede
   * Schnittstelle (/api/...) antwortete mit 500, waehrend die Seiten liefen.
   */
  outputFileTracingIncludes: {
    '/**': ['./node_modules/next/dist/compiled/next-server/*.runtime.prod.js'],
  },
  outputFileTracingExcludes: {
    '/**': [
      './data/**', './dist/**', './tmp/**', './elektron/**', './supabase/**', './tools/**',
      './node_modules/fortnite-replay-analysis/**',
      './node_modules/@next/swc-*/**', './node_modules/@esbuild/**', './node_modules/esbuild/**',
      './node_modules/typescript/**', './node_modules/eslint*/**',
    ],
  },
  turbopack: {
    root: __dirname,
  },
  /*
   * Kein Zwischenspeicher am Rand von Netlify fuer die Schnittstellen.
   *
   * Netlify legt Antworten mit "CDN-Cache-Control" am Rand ab und unterscheidet sie dabei nur nach
   * den Abfrage-Teilen, die das Next-Paket nennt (Netlify-Vary: query=__nextDataReq|_rsc). Alle
   * anderen Teile der Adresse zaehlen nicht: /api/szene-stats?ansicht=jahr&jahr=alle lieferte so
   * dieselbe Antwort wie /api/szene-stats, und die Startseite zeigte Striche statt Zahlen
   * (11.10.2026). "Netlify-CDN-Cache-Control" hat bei Netlify Vorrang vor allen anderen Angaben.
   * Der Browser merkt sich die Antworten weiter (Cache-Control), und davor kann Cloudflare stehen.
   */
  async headers() {
    return [{ source: '/api/:path*', headers: [{ key: 'Netlify-CDN-Cache-Control', value: 'no-store' }] }];
  },
  /*
   * Spielerfotos, die der Betreiber im Admin-Werkzeug hochlaedt, liegen im
   * Objektspeicher statt im Ordner public/spielerbilder. Dieselbe Adresse
   * fuer beide: was dort nicht als Datei liegt, liefert die Schnittstelle.
   */
  async rewrites() {
    return {
      beforeFiles: [],
      /*
       * Die Tierlist hat je Modus eine eigene Adresse: /tierlist/solos, /duos,
       * /trios. Der Betreiber (2.10.2026): wer eine Solo-Liste speichert und
       * sie im Archiv oeffnet, soll direkt auf der Solo-Liste landen, nicht auf
       * Trios. Die Seite bleibt dieselbe, der Modus kommt aus der Adresse.
       */
      afterFiles: [
        { source: '/tierlist/solos', destination: '/tierlist?modus=solo' },
        { source: '/tierlist/duos', destination: '/tierlist?modus=duo' },
        { source: '/tierlist/trios', destination: '/tierlist?modus=trio' },
      ],
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
