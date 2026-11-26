import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Nur lokal (localhost). Alle Daten kommen von der echten Seite - der Proxy reicht /api, Bilder und Fotos an thecomphub.com weiter.
const SEITE = 'https://www.thecomphub.com';
const weiter = { target: SEITE, changeOrigin: true, secure: true };

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': weiter, '/bilder': weiter, '/spielerbilder': weiter, '/cups': weiter, '/logos': weiter, '/waffen': weiter, '/flags': weiter, '/hero': weiter },
  },
});
