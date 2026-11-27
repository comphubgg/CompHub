/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Standard-Randfarbe dezent statt Tailwinds hellem Grau (Betreiber: Multiview "alles so weiss umrandet").
      borderColor: { DEFAULT: 'rgba(255,255,255,0.08)' },
      fontFamily: { titel: ['"Bebas Neue"', 'Impact', 'sans-serif'], text: ['Inter', 'system-ui', 'sans-serif'] },
      /*
       * Design-System 3.0 (27.11.2026): drei Farben reichen fuer alles.
       *   akz   - die Akzentfarbe des Bereichs (Competitive blau, Community tuerkis, Streamer violett, Admin bernstein); kommt aus --akz der Schale
       *   grund - der Seitenhintergrund (fast schwarz)
       *   fl    - die Flaeche der Karten (dicht und dunkel, Betreiber: "zu durchlaessig ... ein bisschen aggressiver schwarz")
       */
      colors: {
        akz: 'rgb(var(--akz) / <alpha-value>)',
        grund: 'rgb(var(--grund) / <alpha-value>)',
        fl: 'rgb(var(--fl) / <alpha-value>)',
      },
    },
  },
};
