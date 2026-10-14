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
// Kein Knallweiss (Betreiber, 14.10.2026: "todeshaesslich"): der Grund ist ein gedaempftes Blaugrau, die Karten sind nur eine Stufe heller,
// und die Schrift ist dunkel genug, dass sie auf dem Grau trotzdem klar lesbar bleibt.
const NEUTRAL_HELL = {
  50: '#0c1422', 100: '#16202f', 200: '#222e43', 300: '#36425a', 400: '#4a566c', 500: '#657187',
  600: '#8591a6', 700: '#aab4c5', 800: '#c3cbd8', 900: '#e2e7ee', 950: '#d2d8e2',
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
  --background: #d2d8e2;
  --foreground: #16202f;
${zeilen.join('\n')}
}
`;
// Die dunkle Palette fuer einzelne Stuecke in der hellen Fassung: .foto-dunkel stellt fuer alles darin die Tailwind-Standardfarben wieder her.
// Fotos mit Schrift darauf (Spielerkacheln, Spitzenreiter) brauchen einen dunklen Schleier und helle Schrift - in der umgedrehten Palette
// wuerden aus "from-black/95" und "text-slate-50" ein weisser Schleier und dunkle Schrift (Betreiber, 14.10.2026: "zu viel Weiss, man erkennt wenig").
const dunkel = [];
for (const f of [...NEUTRAL, ...FARBEN]) for (const st of STUFEN) dunkel.push(`  --color-${f}-${st}: ${wert(`${f}-${st}`)};`);
dunkel.push('  --color-white: #fff;', '  --color-black: #000;');
const cssDunkel = `
/* Fotos mit Schrift darauf: in der hellen Fassung die dunkle Palette (class="foto-dunkel"). */
html[data-modus="hell"] .foto-dunkel {
  color-scheme: dark;
  color: #f1f5f9;
${dunkel.join('\n')}
}
`;
fs.writeFileSync(path.join(process.cwd(), 'app', 'design-hell.css'), css + cssDunkel);
console.log('app/design-hell.css geschrieben:', zeilen.length, 'Farben');
