// Die vom Foto-Befehl gesendeten Bilder holen und zuschneiden (31.10.2026, Betreiber: "dass ich sie nicht mal downloaden muss").
//
// Liest fotos-eingang.json aus der Ablage (app/api/fotos-eingang), laedt jedes Bild in einen Arbeitsordner, schneidet es mit scripts/foto-zuschneiden.py
// wie die eigenen Zuschnitte des Betreibers zu und legt daneben eine Uebersicht (uebersicht-N.jpg, je 24 Bilder mit Namen) zum Durchsehen an.
// Eingebaut wird danach wie immer mit scripts/spielerbilder-uebernehmen.mjs <Ordner>/zugeschnitten - erst nach dem Blick auf die Uebersicht.
//
//   node scripts/fotos-eingang-holen.mjs <Arbeitsordner> [--nur-neue]

import { config } from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

config({ path: '.env.local' });
const { liesJson } = await import('../lib/ablage.ts');

const ordner = process.argv[2];
if (!ordner) { console.error('Aufruf: node scripts/fotos-eingang-holen.mjs <Arbeitsordner> [--nur-neue]'); process.exit(1); }
const nurNeue = process.argv.includes('--nur-neue');
const roh = path.join(ordner, 'roh');
const fertig = path.join(ordner, 'zugeschnitten');
await fs.mkdir(roh, { recursive: true });
await fs.mkdir(fertig, { recursive: true });

const liste = (await liesJson('fotos-eingang.json', [])).filter((e) => e.quelle !== 'test' && (!nurNeue || !e.vorhanden));
console.log(`${liste.length} Eintraege im Eingang${nurNeue ? ' (nur neue)' : ''}.`);
const dateiName = (n) => n.toUpperCase().replace(/[^A-Z0-9 ._-]/g, '').replace(/\s+/g, ' ').trim() || 'SPIELER';

let geholt = 0, schief = 0;
const gesehen = new Set();
let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < liste.length) {
    const e = liste[i++];
    let name = dateiName(e.name);
    while (gesehen.has(name)) name += '_2';
    gesehen.add(name);
    try {
      const r = await fetch(e.url, { signal: AbortSignal.timeout(30_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const typ = r.headers.get('content-type') ?? '';
      const endung = /png/.test(typ) ? 'png' : /webp/.test(typ) ? 'webp' : 'jpg';
      await fs.writeFile(path.join(roh, `${name}.${endung}`), Buffer.from(await r.arrayBuffer()));
      geholt += 1;
    } catch (f) { schief += 1; console.log(`  ${name}: ${f.message}`); }
  }
}));
console.log(`Geholt: ${geholt}, fehlgeschlagen: ${schief}.`);

// OpenCV liest kein WebP zuverlaessig unter jedem Build - vorher in PNG wandeln (sharp ist ohnehin da).
const sharp = (await import('sharp')).default;
for (const f of await fs.readdir(roh)) {
  if (!f.endsWith('.webp')) continue;
  await sharp(path.join(roh, f)).png().toFile(path.join(roh, f.replace(/\.webp$/, '.png')));
  await fs.unlink(path.join(roh, f));
}
const dateien = (await fs.readdir(roh)).map((f) => path.join(roh, f));
for (let k = 0; k < dateien.length; k += 50) {
  spawnSync('python', ['scripts/foto-zuschneiden.py', ...dateien.slice(k, k + 50), '--ziel', fertig], { stdio: 'inherit' });
}

// Uebersichten zum Durchsehen: je 24 Zuschnitte mit Namen.
const zugeschnitten = (await fs.readdir(fertig)).filter((f) => f.endsWith('.jpg')).sort();
for (let k = 0; k < zugeschnitten.length; k += 24) {
  const teil = zugeschnitten.slice(k, k + 24);
  const kacheln = await Promise.all(teil.map(async (f) => ({
    input: await sharp(path.join(fertig, f)).resize(200, 250).composite([{
      input: Buffer.from(`<svg width="200" height="250"><rect y="222" width="200" height="28" fill="black" opacity="0.7"/><text x="6" y="242" font-size="15" font-family="Arial" font-weight="bold" fill="#facc15">${f.replace(/\.jpg$/, '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`),
    }]).jpeg().toBuffer(),
  })));
  const spalten = 6; const zeilen = Math.ceil(teil.length / spalten);
  await sharp({ create: { width: spalten * 200, height: zeilen * 250, channels: 3, background: '#111' } })
    .composite(kacheln.map((x, n) => ({ input: x.input, left: (n % spalten) * 200, top: Math.floor(n / spalten) * 250 })))
    .jpeg({ quality: 85 }).toFile(path.join(ordner, `uebersicht-${String(k / 24 + 1).padStart(2, '0')}.jpg`));
}
console.log(`${zugeschnitten.length} zugeschnitten -> ${fertig}; Uebersichten in ${ordner}.`);
