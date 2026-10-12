// Das POV-Programm bauen (pov-app/) - in einem eigenen, leeren Ordner.
//
// Warum nicht direkt im Projekt: electron-builder sucht Abhaengigkeiten auch im Projektordner darueber und
// packt dann alles aus node_modules mit ein (Replay-Leser, Next ...): 300 statt etwa 90 Megabyte. Hier wird
// das Programm in einen leeren Ordner kopiert und von dort gebaut; Electron selbst kommt aus node_modules.
//
//   node scripts/pov-app-bauen.mjs        ->  dist-pov/CompHub-POV-Setup.exe

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUELLE = path.join(WURZEL, 'pov-app');
const TEMP = path.join(os.tmpdir(), 'comphub-pov-bau');
const AUS = path.join(WURZEL, 'dist-pov');

fs.rmSync(TEMP, { recursive: true, force: true });
fs.mkdirSync(path.join(TEMP, 'build'), { recursive: true });
for (const d of ['haupt.js', 'vorladen.js', 'quelle-vorladen.js', 'quelle.html', 'package.json']) {
  fs.copyFileSync(path.join(QUELLE, d), path.join(TEMP, d));
}
fs.copyFileSync(path.join(QUELLE, 'build', 'icon.png'), path.join(TEMP, 'build', 'icon.png'));

const konfig = JSON.parse(fs.readFileSync(path.join(QUELLE, 'bau.json'), 'utf8'));
konfig.directories = { output: 'ausgabe', buildResources: 'build' };
konfig.electronDist = path.join(WURZEL, 'node_modules', 'electron', 'dist');
konfig.win.icon = 'build/icon.png';
fs.writeFileSync(path.join(TEMP, 'bau.json'), JSON.stringify(konfig, null, 2));

// Die Selbst-Aktualisierung braucht electron-updater im Programm: im leeren Ordner installiert, nicht aus dem Projekt
// gezogen - sonst kaemen dessen Abhaengigkeiten wieder alle mit.
const npm = spawnSync('npm install --omit=dev --no-audit --no-fund --no-package-lock', { cwd: TEMP, stdio: 'inherit', shell: true });
if (npm.status !== 0) { console.error('electron-updater ließ sich nicht installieren.'); process.exit(npm.status ?? 1); }

const bauer = path.join(WURZEL, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder');
const r = spawnSync('"' + bauer + '"', ['--win', '--config', 'bau.json', '--projectDir', TEMP, '--publish', 'never'], { cwd: TEMP, stdio: 'inherit', shell: true });
if (r.status !== 0) { console.error('Bau fehlgeschlagen.'); process.exit(r.status ?? 1); }

fs.rmSync(AUS, { recursive: true, force: true });
fs.mkdirSync(AUS, { recursive: true });
// Die Installationsdatei samt latest.yml und Blockabbild - die beiden anderen braucht die Selbst-Aktualisierung.
for (const d of ['CompHub-POV-Setup.exe', 'CompHub-POV-Setup.exe.blockmap', 'latest.yml']) {
  const von = path.join(TEMP, 'ausgabe', d);
  if (fs.existsSync(von)) fs.copyFileSync(von, path.join(AUS, d));
  else console.warn(`Hinweis: ${d} wurde nicht erzeugt.`);
}
const mb = Math.round(fs.statSync(path.join(AUS, 'CompHub-POV-Setup.exe')).size / 1048576);
console.log(`\nFertig: dist-pov/CompHub-POV-Setup.exe (${mb} MB)`);
