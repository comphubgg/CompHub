// Erzeugt app/design-hell.css: die helle Fassung der Farbpalette (Neues Design, 14.10.2026).
//
// Die ganze Oberflaeche ist aus Tailwind-Farben gebaut (zinc und slate rund 5.000 Mal, kaum feste Hex-Werte). Statt jede Stelle anzufassen, dreht
// dieser Erzeuger die Palette um: jede Stufe bekommt den Wert der gegenueberliegenden (50 <-> 950, 100 <-> 900 ...), die Neutraltoene bekommen
// eine eigene, von Hand gewaehlte Reihe, und Weiss und Schwarz tauschen den Platz. Aus "bg-zinc-950 text-slate-100" wird so von selbst
// "heller Grund, dunkle Schrift" - auf jeder Seite, ohne dass sie davon weiss. Gilt nur, wo html[data-modus="hell"] steht.
//
//   node scripts/design-palette-erzeugen.mjs

import fs from 'node:fs';
import path from 'node:path';

const THEME = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'tailwindcss', 'theme.css'), 'utf8');
const wert = (name) => { const m = new RegExp(`--color-${name}:\\s*([^;]+);`).exec(THEME); if (!m) throw new Error('fehlt: ' + name); return m[1].trim(); };

const STUFEN = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const FARBEN = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const NEUTRAL = ['slate', 'gray', 'zinc', 'neutral', 'stone'];

// Neutraltoene, hell: Seitengrund (950), Karte (900), Linien (800 bis 700), gedaempfte Schrift (600 bis 400), Text (300 bis 50).
const NEUTRAL_HELL = {
  50: '#0e1626', 100: '#17202f', 200: '#243044', 300: '#3a475e', 400: '#566377', 500: '#77839a',
  600: '#9ba6ba', 700: '#c4ccda', 800: '#dde3ee', 900: '#ffffff', 950: '#f2f5fa',
};

const zeilen = [];
for (const f of NEUTRAL) for (const s of STUFEN) zeilen.push(`  --color-${f}-${s}: ${NEUTRAL_HELL[s]};`);
for (const f of FARBEN) {
  for (const s of STUFEN) {
    const gegen = s === 500 ? 500 : 1000 - s;
    // 1000 - 50 = 950, 1000 - 950 = 50, 1000 - 100 = 900 ... : die Reihe ist symmetrisch.
    zeilen.push(`  --color-${f}-${s}: ${wert(`${f}-${gegen}`)};`);
  }
}
// Weiss ist auf dunklem Grund die Schrift- und Flaechenfarbe der Hervorhebung - hell wird es zur Tinte; Schwarz (Schleier, Brunnen) wird Weiss.
zeilen.push('  --color-white: #0b1220;', '  --color-black: #ffffff;');

const css = `/* ERZEUGT von scripts/design-palette-erzeugen.mjs - nicht von Hand aendern. */
/* Die helle Fassung des neuen Designs: die Tailwind-Palette umgedreht (siehe Erzeuger). */
html[data-modus="hell"] {
  color-scheme: light;
  --background: #f2f5fa;
  --foreground: #17202f;
${zeilen.join('\n')}
}
`;
fs.writeFileSync(path.join(process.cwd(), 'app', 'design-hell.css'), css);
console.log('app/design-hell.css geschrieben:', zeilen.length, 'Farben');
