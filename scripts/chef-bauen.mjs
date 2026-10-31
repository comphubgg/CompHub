// Baut die echte Seite nach einer Freigabe neu - immer nur ein Bau zugleich.
//
// Aufgerufen von scripts/chef-uebernahme.mjs mit dem Hauptordner (streamer-dashboard) als Arbeitsordner. Drueckt der Betreiber mehrmals
// kurz hintereinander auf "Ja", startet jede Freigabe diesen Aufruf; die spaeteren warten, bis der laufende Bau fertig ist, und bauen
// nur, wenn main seitdem weitergegangen ist. So laufen nie zwei "npm run veroeffentlichen" gegeneinander.

import fs from 'fs';
import path from 'path';
import { execFileSync, execSync } from 'child_process';

const ORDNER = process.cwd();
const SPERRE = path.join(ORDNER, 'data', 'chef-bau.lock');
const GEBAUT = path.join(ORDNER, 'data', 'chef-gebaut.txt');
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const alter = (p) => { try { return Date.now() - fs.statSync(p).mtimeMs; } catch { return Infinity; } };

while (alter(SPERRE) < 25 * 60_000) await warte(20_000);
const kopf = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ORDNER, encoding: 'utf8' }).trim();
const zuletzt = (() => { try { return fs.readFileSync(GEBAUT, 'utf8').trim(); } catch { return ''; } })();
if (kopf === zuletzt) {
  console.log(`${new Date().toISOString()} ${kopf.slice(0, 8)} ist schon gebaut - nichts zu tun.`);
  process.exit(0);
}
fs.mkdirSync(path.dirname(SPERRE), { recursive: true });
fs.writeFileSync(SPERRE, kopf);
try {
  console.log(`${new Date().toISOString()} baue ${kopf.slice(0, 8)} ...`);
  execSync('npm run veroeffentlichen', { cwd: ORDNER, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_BASE_URL: 'https://www.thecomphub.com' } });
  fs.writeFileSync(GEBAUT, kopf);
} finally {
  fs.rmSync(SPERRE, { force: true });
}
