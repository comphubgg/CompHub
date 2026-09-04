// Die .exe bauen.
//
// Drei Schritte, in dieser Reihenfolge:
//
//   1. next build       - die fertige Fassung, ohne die es nichts zu starten gibt
//   2. Zugangsdaten     - .env.local wird mitgenommen, damit das Programm
//                         genau das tut, was der lokale Server tut
//   3. electron-builder - alles in eine Datei
//
// Zu Schritt zwei: der Nutzer hat ausdruecklich entschieden, dass die
// Schluessel mit hineinsollen ("mach einfach so mit den API Keys, dass sie
// in der Datei dabei sind, sodass alles funktioniert wie, als ob ich es auf
// Local hosten wuerde"). Sie sind damit fuer jeden lesbar, der die Datei
// hat - das ist so gewollt und hier nur festgehalten, damit es niemanden
// spaeter ueberrascht.
//
// Das Archiv unter data/ ist mit 754 MB der groesste Teil. Es laesst sich
// weglassen (--ohne-daten), dann ist die Datei klein und der Ordner wird
// beim ersten Start daneben erwartet.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WURZEL = path.join(HIER, '..');
const ohneDaten = process.argv.includes('--ohne-daten');

function lauf(befehl, argumente) {
  return new Promise((fertig, schief) => {
    const p = spawn(befehl, argumente, {
      cwd: WURZEL, stdio: 'inherit', shell: process.platform === 'win32',
    });
    p.on('close', (code) => (code === 0
      ? fertig()
      : schief(new Error(`${befehl} endete mit ${code}`))));
  });
}

console.log('\n[1/3] Fertige Fassung bauen …');
await lauf('npx', ['next', 'build']);

console.log('\n[2/3] Zugangsdaten prüfen …');
const env = path.join(WURZEL, '.env.local');
if (!fs.existsSync(env)) {
  console.error('  .env.local fehlt — ohne sie laufen Anmeldung und '
    + 'Turnierabruf im fertigen Programm nicht.');
} else {
  const zeilen = fs.readFileSync(env, 'utf8').split('\n')
    .filter((z) => /^[A-Z_]+=/.test(z));
  const platzhalter = zeilen.filter((z) =>
    /=(REDACTED|your_|YOUR_|xxx|changeme)/i.test(z));
  console.log(`  ${zeilen.length} Einträge, davon ${platzhalter.length} `
    + 'noch Platzhalter.');
  for (const z of platzhalter) console.log('    offen:', z.split('=')[0]);
}

console.log('\n[3/3] In eine Datei packen …');
await lauf('npx', ['electron-builder', '--win',
  '--config', path.join(HIER, ohneDaten ? 'bau-klein.json' : 'bau.json')]);

console.log('\nFertig. Die Datei liegt unter dist/.');
if (ohneDaten) {
  console.log('Ohne Archiv gebaut: der Ordner data/ muss neben die .exe.');
}
