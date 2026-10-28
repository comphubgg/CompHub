// Den neuen Bau neben dem laufenden anlegen - in .next-bau statt .next.
//
// Der Betreiber sah bei jedem Veroeffentlichen fuer rund zehn Minuten 500 auf /maps, /replays und anderen Seiten (28.10.2026): "next build" leerte und
// beschrieb .next, waehrend der Server noch daraus auslieferte. Jetzt baut dieses Skript nach .next-bau (next.config.ts liest NEXT_DIST_DIR); umgeschaltet
// wird erst, wenn der Server steht (scripts/bau-umschalten.ps1, aufgerufen von neu-veroeffentlichen.ps1 bzw. vom Waechter dauerbetrieb.ps1).
//
// Der Bau laeuft mit niedriger Prioritaet und hoechstens vier Kernen (29.10.2026): mit fuenfzehn Arbeitern auf voller Prioritaet antwortete der laufende
// Server so traege, dass Cloudflares Gesundheitspruefung auf die Ersatzseite umschaltete - und die meldete "usage_exceeded" (503). Lieber baut es ein paar
// Minuten laenger.
//
//   node scripts/bauen-daneben.mjs

import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const kind = spawn(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-bau', NEXT_BAU_CPUS: process.env.NEXT_BAU_CPUS || '4' },
});
try { os.setPriority(kind.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* dann mit normaler Prioritaet */ }
kind.on('exit', (code) => process.exit(code ?? 1));
