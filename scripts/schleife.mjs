// Ein paar Schritte immer wieder ausfuehren - als Schleife in einem GitHub-Auftrag.
//
// Der Betreiber (14.10.2026): "eine halbe Stunde nach dem Ende eines Cups soll jede Runde ausgewertet sein". Der Zehn-Minuten-Takt (cron)
// von GitHub wird unter Last uebergangen: der Ablauf "Replays voll auslesen" lief in drei Stunden einmal, "Eigene Lobbys auswerten" gar nicht. Wie beim
// Live-Sammler (scripts/replays-live-schleife.mjs) bleibt der Auftrag deshalb an und wiederholt seine Schritte selbst; am Ende stoesst er den
// naechsten Auftrag an (siehe die Workflows).
//
//   node scripts/schleife.mjs --minuten 325 --takt 90 --schritt "BEFEHL" --schritt "20:BEFEHL" ...
//
// Ein Schritt "N:BEFEHL" laeuft nur im 1., N+1., 2N+1. ... Durchgang (z. B. alle dreissig Minuten bei Takt 90 und N=20). Scheitert ein Schritt, geht es
// mit dem naechsten weiter - ein Aussetzer bei Epic haelt die Schleife nicht an.

import { spawnSync } from 'node:child_process';

const arg = process.argv.slice(2);
const wert = (name, standard) => { const i = arg.indexOf(name); return i >= 0 && arg[i + 1] ? Number(arg[i + 1]) : standard; };
const MINUTEN = wert('--minuten', 325);
const TAKT_S = wert('--takt', 90);
// --halt "BEFEHL": vor jedem Durchgang; endet er mit Code 0, hoert die Schleife auf (z. B. weil die Schnellspur die Rechner braucht) und legt
// ./schleife-halt an (im Arbeitsordner - hashFiles im Workflow sieht nur den) - der Workflow stoesst dann keinen naechsten Auftrag an.
const haltBefehl = (() => { const i = arg.indexOf('--halt'); return i >= 0 ? arg[i + 1] : null; })();
const schritte = arg.flatMap((a, i) => (a === '--schritt' && arg[i + 1] ? [arg[i + 1]] : []))
  .map((s) => { const m = /^(\d+):(.*)$/s.exec(s); return m ? { alle: Number(m[1]), befehl: m[2] } : { alle: 1, befehl: s }; });
if (!schritte.length) { console.error('Kein --schritt angegeben.'); process.exit(1); }

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const beginn = Date.now();
let durchgang = 0;
console.log(`Schleife: hoechstens ${MINUTEN} Minuten, alle ${TAKT_S} Sekunden, ${schritte.length} Schritte.`);

while (Date.now() - beginn < MINUTEN * 60_000) {
  const t0 = Date.now();
  if (haltBefehl && spawnSync('sh', ['-c', haltBefehl], { stdio: 'inherit', env: process.env }).status === 0) {
    console.log('Halt: ein anderer Ablauf hat Vorrang - Schleife endet hier.');
    (await import('node:fs')).writeFileSync('schleife-halt', new Date().toISOString());
    break;
  }
  console.log(`\n=== Durchgang ${durchgang + 1} - ${new Date().toISOString()}`);
  for (const s of schritte) {
    if (durchgang % s.alle !== 0) continue;
    const t = Date.now();
    const r = spawnSync('sh', ['-c', s.befehl], { stdio: 'inherit', env: process.env });
    console.log(`   [${s.befehl.slice(0, 70)}] -> Code ${r.status ?? 'null'} nach ${Math.round((Date.now() - t) / 1000)}s`);
  }
  durchgang += 1;
  const rest = TAKT_S * 1000 - (Date.now() - t0);
  if (rest > 0 && Date.now() - beginn + rest < MINUTEN * 60_000) await warte(rest);
}
console.log(`\nSchleife beendet nach ${durchgang} Durchgaengen, ${Math.round((Date.now() - beginn) / 60_000)} Minuten.`);
