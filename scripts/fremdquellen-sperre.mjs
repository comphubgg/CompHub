// Sperre gegen eine Quelle, deren Betreiber jede Nutzung untersagt hat (17.11.2026).
//
// Der Betreiber dieser Seite hat jede Erlaubnis widerrufen und die Entfernung aller Daten verlangt. Nichts im Werkzeug darf sie je wieder
// abrufen, spiegeln oder nennen. Dieser Lauf durchsucht jede Datei im Repository (git ls-files) und bricht mit Fehler ab, sobald der
// Name irgendwo steht - in einer Abruf-Adresse (fetch, curl, Playwright, Python) ebenso wie in Text oder Kommentar. Er laeuft in CI vor
// jedem Bau (.github/workflows/quellen-pruefen.yml und web-image.yml).
//
//   node scripts/fremdquellen-sperre.mjs
//
// Der gesperrte Name steht hier nur zerlegt, damit diese Datei sich nicht selbst meldet.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const GESPERRT = [
  new RegExp(['eu', 'competitive'].join('\\s*[-_.]?\\s*'), 'i'),
];

const dateien = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
  .split('\0').filter(Boolean);

const funde = [];
for (const datei of dateien) {
  let inhalt;
  try {
    const st = fs.statSync(datei);
    if (!st.isFile() || st.size > 20 * 1024 * 1024) continue;
    inhalt = fs.readFileSync(datei);
  } catch { continue; }
  // Binaerdateien (Bilder, Videos) ueberspringen - erkennbar an einem Nullbyte am Anfang.
  if (inhalt.subarray(0, 8000).includes(0)) continue;
  const text = inhalt.toString('utf8');
  for (const muster of GESPERRT) {
    if (!muster.test(datei) && !muster.test(text)) continue;
    const zeilen = text.split('\n');
    const nr = zeilen.findIndex((z) => muster.test(z));
    funde.push(`${datei}${nr >= 0 ? `:${nr + 1}` : ''}`);
  }
}

if (funde.length) {
  console.error(`Gesperrte Quelle gefunden (${funde.length} Datei(en)) - entfernen, sie darf weder abgerufen noch genannt werden:`);
  for (const f of funde.slice(0, 50)) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`Gesperrte Quelle: nichts gefunden (${dateien.length} Dateien geprueft).`);
