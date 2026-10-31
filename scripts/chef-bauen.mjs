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

fs.mkdirSync(path.dirname(SPERRE), { recursive: true });
/*
 * Die Sperre atomar nehmen (Datei nur anlegen, wenn es sie noch nicht gibt): vorher sahen zwei Wartende sie im selben Augenblick frei und
 * bauten gleichzeitig (31.10.2026, zweimal "baue aad55007"). Eine Sperre aelter als 25 Minuten gilt als liegengeblieben.
 */
for (;;) {
  try { fs.writeFileSync(SPERRE, String(process.pid), { flag: 'wx' }); break; } catch {
    if (alter(SPERRE) > 25 * 60_000) { fs.rmSync(SPERRE, { force: true }); continue; }
    await warte(20_000);
  }
}
let kopf = '';
try {
  kopf = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ORDNER, encoding: 'utf8' }).trim();
  const zuletzt = (() => { try { return fs.readFileSync(GEBAUT, 'utf8').trim(); } catch { return ''; } })();
  if (kopf === zuletzt) {
    console.log(`${new Date().toISOString()} ${kopf.slice(0, 8)} ist schon gebaut - nichts zu tun.`);
    fs.rmSync(SPERRE, { force: true });
    process.exit(0);
  }
} catch (e) { fs.rmSync(SPERRE, { force: true }); throw e; }
try {
  console.log(`${new Date().toISOString()} baue ${kopf.slice(0, 8)} ...`);
  execSync('npm run veroeffentlichen', { cwd: ORDNER, stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_BASE_URL: 'https://www.thecomphub.com' } });
  fs.writeFileSync(GEBAUT, kopf);
} finally {
  fs.rmSync(SPERRE, { force: true });
}
