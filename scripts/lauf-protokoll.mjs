// Das Protokoll eines Laufs der GitHub-Aktion - dorthin, wo es lesbar ist.
//
// Seit dem 8. September legte der stuendliche Lauf keine Antworten mehr ab:
// der Bau dauerte zwoelf Sekunden, das Vorrechnen genau die sechzig Sekunden
// der Warteschleife, und "continue-on-error" verschluckte den Fehler. Die
// Protokolle bei GitHub lassen sich nur mit Anmeldung lesen.
//
// Deshalb schreibt dieser Schritt das Ende der Protokolle nach
// data/antworten/_lauf.json (stuendlicher Lauf) beziehungsweise
// data/replays/_live-lauf.json (Live-Sammler, mit "--live"). Beide Dateien
// werden mit den uebrigen Daten hochgeladen und lassen sich aus der Ablage
// lesen.
//
// Aufruf (in der Aktion):
//   BAU_CODE=… BEREIT=ja|nein node scripts/lauf-protokoll.mjs
//   CODE=…                    node scripts/lauf-protokoll.mjs --live

import fs from 'node:fs';
import path from 'node:path';

function ende(pfad, zeilen = 80) {
  try {
    return fs.readFileSync(pfad, 'utf8').split('\n').slice(-zeilen).join('\n');
  } catch {
    return '';
  }
}

const live = process.argv.includes('--live');
const ziel = live
  ? path.join(process.cwd(), 'data', 'replays', '_live-lauf.json')
  : path.join(process.cwd(), 'data', 'antworten', '_lauf.json');
fs.mkdirSync(path.dirname(ziel), { recursive: true });

const inhalt = live
  ? {
    zeit: new Date().toISOString(),
    lauf: process.env.GITHUB_RUN_ID ?? null,
    code: process.env.CODE ?? null,
    anmeldungDa: fs.existsSync(path.join(process.cwd(), 'data', 'epic-auth.json')),
    sammler: ende('/tmp/sammler.log'),
  }
  : {
    zeit: new Date().toISOString(),
    lauf: process.env.GITHUB_RUN_ID ?? null,
    bauCode: process.env.BAU_CODE ?? null,
    serverBereit: process.env.BEREIT ?? null,
    bau: ende('/tmp/bau.log'),
    server: ende('/tmp/server.log'),
    vorrechnen: ende('/tmp/vorrechnen.log'),
    platzierungen: ende('/tmp/platzierungen.log', 12),
    replays: ende('/tmp/replays.log', 40),
    aggregieren: ende('/tmp/aggregieren.log', 12),
  };

fs.writeFileSync(ziel, JSON.stringify(inhalt, null, 1));
console.log(`Protokoll geschrieben: ${ziel}`);
