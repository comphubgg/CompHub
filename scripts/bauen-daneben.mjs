// Den neuen Bau neben dem laufenden anlegen - in .next-bau statt .next.
//
// Der Betreiber sah bei jedem Veroeffentlichen fuer rund zehn Minuten 500 auf /maps, /replays und anderen Seiten (28.10.2026): "next build" leerte und
// beschrieb .next, waehrend der Server noch daraus auslieferte. Jetzt baut dieses Skript nach .next-bau (next.config.ts liest NEXT_DIST_DIR); umgeschaltet
// wird erst, wenn der Server steht (scripts/bau-umschalten.ps1, aufgerufen von neu-veroeffentlichen.ps1 bzw. vom Waechter dauerbetrieb.ps1).
//
//   node scripts/bauen-daneben.mjs

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const r = spawnSync(process.execPath, [path.join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  stdio: 'inherit',
  env: { ...process.env, NEXT_DIST_DIR: '.next-bau' },
});
process.exit(r.status ?? 1);
