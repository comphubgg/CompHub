// Das gebaute POV-Programm (dist-pov/CompHub-POV-Setup.exe) ans Release "pov-app" legen.
//
// Von dort holt es /api/pov/app fuer die Profis (und das Programm selbst fragt dort nach einer neueren Fassung).
// Die Versionsnummer steht im Namen des Releases und kommt aus pov-app/package.json.
//
//   node scripts/pov-app-veroeffentlichen.mjs         (Token aus GH_TOKEN oder .env.local: DATEN_TOKEN / GITHUB_TOKEN)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const DATEI = path.join(WURZEL, 'dist-pov', 'CompHub-POV-Setup.exe');
if (!fs.existsSync(DATEI)) { console.error('Erst bauen: npm run pov-app'); process.exit(1); }

let token = process.env.GH_TOKEN || '';
if (!token) {
  const env = fs.readFileSync(path.join(WURZEL, '.env.local'), 'utf8').split(/\r?\n/);
  token = (env.find((z) => z.startsWith('DATEN_TOKEN=')) ?? env.find((z) => z.startsWith('GITHUB_TOKEN=')) ?? '').split('=').slice(1).join('=').trim();
}
const version = JSON.parse(fs.readFileSync(path.join(WURZEL, 'pov-app', 'package.json'), 'utf8')).version;
const gh = (...a) => spawnSync('gh', a, { env: { ...process.env, GH_TOKEN: token }, encoding: 'utf8' });

const da = gh('release', 'view', 'pov-app', '--repo', REPO);
if (da.status !== 0) {
  const r = gh('release', 'create', 'pov-app', '--repo', REPO, '--title', `CompHub POV ${version}`, '--latest=false',
    '--notes', 'Das Dashboard der Profis als Windows-Programm. Anmelden als Pro, live gehen, im Infobereich weiterlaufen.');
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
} else {
  const r = gh('release', 'edit', 'pov-app', '--repo', REPO, '--title', `CompHub POV ${version}`);
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
}
// Erst Installationsdatei und Blockabbild, zuletzt latest.yml: das Programm sucht dort nach einer neueren Fassung und soll
// die Datei, auf die es verweist, schon vorfinden.
const dateien = [DATEI, DATEI + '.blockmap', path.join(WURZEL, 'dist-pov', 'latest.yml')].filter((d) => fs.existsSync(d));
const up = gh('release', 'upload', 'pov-app', ...dateien, '--repo', REPO, '--clobber');
if (up.status !== 0) { console.error(up.stderr); process.exit(1); }
console.log(`Veroeffentlicht: CompHub POV ${version} (${Math.round(fs.statSync(DATEI).size / 1048576)} MB) am Release "pov-app".`);
