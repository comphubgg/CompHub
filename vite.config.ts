import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

// Nur lokal (localhost). Alle Daten kommen von der echten Seite - der Proxy reicht /api, Bilder und Fotos an thecomphub.com weiter.
const SEITE = 'https://www.thecomphub.com';
const weiter = { target: SEITE, changeOrigin: true, secure: true, cookieDomainRewrite: { '*': '' } };

/*
 * Die echten Seiten von thecomphub.com im Hub (Admin-Werkzeuge, Betreiber 26.11.2026: "als Admin muss ich auch meine Admin-Tools und alles sehen").
 * Der Hub zeigt sie in einem Rahmen (iframe) unter /site/<pfad> - gleicher Ursprung, also gelten die Cookies der Anmeldung. Damit die Seite darin
 * laeuft, braucht sie ihre Skripte und Stile (/_next, /fonts ...) und die Navigation von Next (Anfragen mit RSC-Kopf, Server-Aktionen) - und ein
 * Seitenwechsel im Rahmen (Adresse ohne /site) muss ebenfalls zur echten Seite, nicht in den Hub.
 */
const rahmen: ProxyOptions = {
  ...weiter,
  configure: (proxy) => {
    proxy.on('proxyRes', (antwort) => {
      // Darf im Rahmen stehen, und Weiterleitungen bleiben auf localhost.
      delete antwort.headers['x-frame-options'];
      delete antwort.headers['content-security-policy'];
      const ziel = antwort.headers.location;
      if (typeof ziel === 'string' && ziel.startsWith(SEITE)) antwort.headers.location = ziel.slice(SEITE.length) || '/';
    });
  },
};
/** Gehoert die Anfrage zu einer Seite im Rahmen? Dokument im iframe, Next-Navigation (RSC) oder Server-Aktion. */
const ausRahmen = (a: { headers: Record<string, string | string[] | undefined>; url?: string }) => {
  const k = a.headers;
  return k['sec-fetch-dest'] === 'iframe' || k.rsc === '1' || !!k['next-action'] || !!k['next-router-state-tree'] || /[?&]_rsc=/.test(a.url ?? '');
};
/** Dateien, die die echten Seiten laden (Skripte, Stile, Schriften, Symbole) - gibt es im Hub nicht, also immer zur echten Seite. */
const STATISCH = ['/_next/', '/fonts/', '/webfonts/', '/icons/', '/assets/', '/data/', '/logo/', '/overlay/', '/replay/', '/saisonbilder/', '/vip-bilder/',
  '/vips/', '/spielerbilder-mini/', '/tournaments/', '/social/', '/login-slides/', '/login-screenshots/', '/vorschau/', '/favicon', '/apple-icon',
  '/icon', '/manifest', '/spielerbild-platzhalter.svg', '/comphub-maskottchen-portrait.webp'];

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Anmeldung: Cookies der echten Seite gelten auf localhost (Domain entfernt), damit Admin/VIP-Daten auch hier laden.
      '/api': weiter, '/bilder': weiter, '/spielerbilder': weiter, '/spielerbilder-klein': weiter, '/cups': weiter, '/logos': weiter, '/waffen': weiter, '/flags': weiter, '/hero': weiter, '/orgs': weiter,
      // Epics offizielle, freie Fortnite Data API (Inseln, Spielerzahlen je Insel/Playlist) - ueber den Proxy, damit der Browser keine CORS-Probleme hat.
      '/epic-daten': { target: 'https://api.fortnite.com', changeOrigin: true, secure: true, rewrite: (p) => p.replace(/^\/epic-daten/, '') },
      // Overlays der echten Seite (Vorschau im Streamer-Bereich, gleiche Herkunft -> zuschneiden und sofort aktualisieren)
      '^/overlay(/|\\?|$)': weiter,
      // Echte Seiten im Rahmen (src/seiten/admin/Rahmen.tsx): /site/admin/live -> thecomphub.com/admin/live.
      '/site': { ...rahmen, rewrite: (p) => p.replace(/^\/site/, '') || '/' },
      ...Object.fromEntries(STATISCH.map((p) => [p, rahmen])),
      // Zuletzt: alles andere nur, wenn es aus dem Rahmen kommt - sonst bedient Vite den Hub selbst (Rueckgabe der Adresse = nicht weiterreichen).
      '^/(?!@|src/|node_modules/|site/)': { ...rahmen, bypass: (a) => (ausRahmen(a) ? undefined : a.url) },
    },
  },
});
