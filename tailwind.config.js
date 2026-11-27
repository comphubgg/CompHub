/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Standard-Randfarbe dezent statt Tailwinds hellem Grau (Betreiber: Multiview "alles so weiss umrandet").
  theme: { extend: { borderColor: { DEFAULT: 'rgba(255,255,255,0.08)' }, fontFamily: { titel: ['"Bebas Neue"', 'Impact', 'sans-serif'], text: ['Inter', 'system-ui', 'sans-serif'] } } },
};
