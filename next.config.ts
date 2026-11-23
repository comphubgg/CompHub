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
   * Gebaut wird daneben (scripts/bauen-daneben.mjs setzt NEXT_DIST_DIR=.next-bau), damit der laufende Server waehrend der zehn Minuten Bauzeit seine
   * Dateien behaelt - vorher gaben /maps, /replays und andere Seiten bei jedem Veroeffentlichen 500 (28.10.2026). Ausgeliefert wird immer aus .next.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // forbidden() und unauthorized() (403/401) mit eigenen Fehlerseiten: app/forbidden.tsx, app/unauthorized.tsx.
  // Beim Bau neben dem Server hoechstens NEXT_BAU_CPUS Arbeiter (scripts/bauen-daneben.mjs) - der laufende Server soll antworten koennen.
  experimental: { authInterrupts: true, ...(Number(process.env.NEXT_BAU_CPUS) > 0 ? { cpus: Number(process.env.NEXT_BAU_CPUS) } : {}) },
  /*
   * sharp nicht mit eigenem Alias einbinden.
   *
   * Turbopack nimmt sharp (ein Paket mit Programmteil) von sich aus aus dem Bau heraus und verweist im Server auf einen Alias mit Pruefsumme
   * ("sharp-20c6a5da84e2135f"), den es als Verknuepfung unter .next/node_modules anlegt. Auf dem oeffentlichen Server (laeuft unter dem
   * Systemkonto) fand Node diesen Alias nicht: jede Schnittstelle, die sharp braucht, antwortete mit 500 "Internal Server Error" - die Posts des Tages
   * (/api/posts, /api/post-bild), die Beitragsbilder und die Org-Logos (Betreiber, 19.10.2026). Steht das Paket hier, wird es unter seinem Namen
   * aus node_modules geladen.
   */
  serverExternalPackages: ['sharp'],
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
    return [
      { source: '/api/:path*', headers: [{ key: 'Netlify-CDN-Cache-Control', value: 'no-store' }] },
      // The private Finest Creative pages differ per person (lib/finestZugang): never kept at the edge.
      { source: '/overlays/finest', headers: [{ key: 'Netlify-CDN-Cache-Control', value: 'no-store' }] },
      { source: '/overlays/finest/:path*', headers: [{ key: 'Netlify-CDN-Cache-Control', value: 'no-store' }] },
      /*
       * Feste Bilder und Schriften aus public/ eine Stunde am Rand von Cloudflare halten (17.11.2026, gemessen). Next schickt fuer public/ nur
       * "public, max-age=0": Cloudflare fragte darum bei JEDEM Aufruf den Server, ob sich /hero/karte-1.webp oder das Logo geaendert hat
       * (cf-cache-status REVALIDATED/EXPIRED, 450-600 ms statt 100 ms bei einem Treffer) - auf der Startseite ein Dutzend solcher Bilder je Besuch,
       * und jedes wartete, wenn der Server gerade beschaeftigt war. Eine Stunde: ein unter gleichem Namen ersetztes Bild kommt spaetestens
       * eine Stunde nach dem Aufspielen an. Browser behalten Bilder wie bisher vier Stunden (max-age=14400, so setzt es auch Cloudflare).
       * Nur Ordner ohne gleichnamige Seite (nicht /maps: das ist auch eine Seite), nicht /spielerbilder (Fotos kommen und gehen) und
       * nicht /orgs (Org-Uploads).
       */
      ...['hero', 'logos', 'logo', 'cups', 'tournaments', 'flags', 'fonts', 'webfonts', 'icons', 'saisonbilder', 'waffen'].map((ordner) => ({
        source: `/${ordner}/:pfad+`,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=14400, s-maxage=3600, stale-while-revalidate=86400' }],
      })),
      /*
       * Die kleinen und winzigen Foto-Fassungen (spielerbilder-klein 480 px, spielerbilder-mini 128 px fuer die Tierlist) duerfen der Browser
       * lange behalten. Next schickte dafuer "public, max-age=0": der Browser fragte bei JEDEM Aufruf nach, ob sich das Foto geaendert hat - bei
       * einer Solo-Tierlist mit Hunderten Spielern Hunderte Rueckfragen je Aufruf, und genau das liess die Liste rund eine Minute laden
       * (Betreiber, 23.11.2026). Gefahrlos lange: jede Adresse traegt ihr Inhalts-Kennzeichen ("?v=", lib/fotoStand.json) - ein unter gleichem
       * Namen ersetztes Foto bekommt ein neues "?v=" und damit eine neue Adresse, die der Browser sofort frisch laedt. Das Original unter
       * /spielerbilder bleibt wie bisher ungecacht (es traegt nicht immer ein Kennzeichen).
       */
      ...['spielerbilder-klein', 'spielerbilder-mini'].map((ordner) => ({
        source: `/${ordner}/:pfad+`,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=14400, s-maxage=3600, stale-while-revalidate=86400' }],
      })),
      // Chrome auf Android nennt das Handymodell nur auf Nachfrage (Client Hints) - fuer die grobe Geraeteangabe je Sitzung (lib/geraet).
      { source: '/:path*', headers: [{ key: 'Accept-CH', value: 'Sec-CH-UA-Model, Sec-CH-UA-Mobile, Sec-CH-UA-Platform-Version' }] },
    ];
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
        // Die entfernten kleinen Fassungen (17.11.2026): ihre alten Adressen fuehren auf den Platzhalter statt auf ein kaputtes Bild.
        { source: '/spielerbilder-klein/:datei', destination: '/api/spielerbild/hochladen?datei=:datei' },
        { source: '/spielerbilder-mini/:datei', destination: '/api/spielerbild/hochladen?datei=:datei' },
      ],
    };
  },
  async redirects() {
    return [
      // Die eigene Discord-Adresse (Betreiber, 15.11.2026: "discord.gg/eGGdNYCC ist nicht professionell"). Vorlaeufig, nicht dauerhaft: das Ziel kann
      // sich aendern (neuer Einladungslink, spaeter vielleicht discord.gg/comphub).
      { source: '/discord', destination: 'https://discord.gg/8jQ3tf37sQ', permanent: false },  // dieselbe Einladung wie lib/marke.ts (laeuft nie ab)
      // How we count ist seit dem 15.11.2026 ein Abschnitt von How it works (app/how-it-works).
      { source: '/how-we-count', destination: '/how-it-works#how-we-count', permanent: true },
      ...ALTE_ADRESSEN.flatMap(([alt, neu]) => [
        { source: alt, destination: neu, permanent: true },
        { source: `${alt}/:pfad*`, destination: `${neu}/:pfad*`, permanent: true },
      ]),
    ];
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
