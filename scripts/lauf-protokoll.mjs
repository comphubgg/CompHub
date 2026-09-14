// Das Protokoll eines Laufs der GitHub-Aktion - dorthin, wo es lesbar ist.
//
// Seit dem 8. September legte der stuendliche Lauf keine Antworten mehr ab:
// der Bau dauerte zwoelf Sekunden, das Vorrechnen genau die sechzig Sekunden
// der Warteschleife, und "continue-on-error" verschluckte den Fehler. Die
// Protokolle bei GitHub lassen sich nur mit Anmeldung lesen.
//
// Deshalb schreibt dieser Schritt das Ende der drei Protokolle - Bau,
// Server, Vorrechnen - nach data/antworten/_lauf.json. Die Datei wird mit
// den uebrigen Antworten hochgeladen und laesst sich aus der Ablage lesen.
//
// Aufruf (in der Aktion):  BAU_CODE=… BEREIT=ja|nein node scripts/lauf-protokoll.mjs

import fs from 'node:fs';
import path from 'node:path';

function ende(pfad, zeilen = 80) {
  try {
    return fs.readFileSync(pfad, 'utf8').split('\n').slice(-zeilen).join('\n');
  } catch {
    return '';
  }
}

const ziel = path.join(process.cwd(), 'data', 'antworten', '_lauf.json');
fs.mkdirSync(path.dirname(ziel), { recursive: true });
fs.writeFileSync(ziel, JSON.stringify({
  zeit: new Date().toISOString(),
  lauf: process.env.GITHUB_RUN_ID ?? null,
  bauCode: process.env.BAU_CODE ?? null,
  serverBereit: process.env.BEREIT ?? null,
  bau: ende('/tmp/bau.log'),
  server: ende('/tmp/server.log'),
  vorrechnen: ende('/tmp/vorrechnen.log'),
}, null, 1));
console.log(`Protokoll geschrieben: ${ziel}`);
