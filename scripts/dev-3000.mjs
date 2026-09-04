// Den Entwicklungsserver starten - und zwar auf 3000, nicht daneben.
//
// Warum es diese Datei gibt:
//
// `next dev` weicht aus, wenn 3000 belegt ist. Es schreibt eine Zeile ins
// Terminal und laeuft dann auf 3001 weiter. Wer das Terminal nicht liest,
// oeffnet localhost:3000 - und dort antwortet dann die fertige CompHub-Exe
// mit ihrem eingefrorenen Stand. Die Aenderung ist gemacht, die Seite sieht
// aus wie vorher, und der Fehler wird in der Arbeit gesucht statt im Port.
//
// Deshalb wird 3000 hier vorher wirklich freigeraeumt: wer dort horcht, wird
// beendet, wenn es ein eigener Server oder die eigene Anwendung ist. Fremde
// Programme werden nicht angefasst - dann bricht der Start ab und sagt, wer
// im Weg steht.
//
// Die Exe selbst braucht nichts davon: sie sucht sich ab 3000 den ersten
// freien Port und landet dann von allein auf 3001. Damit laufen Exe und
// Browser gleichzeitig, in beliebiger Reihenfolge und beliebig oft.

import { spawn, execSync } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const WURZEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3000;

/** Programme, die wir beenden duerfen - es sind unsere eigenen. */
const UNSERE = new Set(['node.exe', 'node', 'CompHub.exe', 'electron.exe']);

/**
 * Antwortet auf dem Port jemand?
 *
 * Es wird angeklopft und nicht nur gehorcht: Windows erlaubt eine zweite
 * Bindung neben einem Server, der mit `-H 0.0.0.0` laeuft. Eine Horchprobe
 * meldet dann "frei", obwohl dort sehr wohl jemand antwortet.
 */
function antwortetJemand(port) {
  return new Promise((fertig) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    const schluss = (wert) => { s.removeAllListeners(); s.destroy(); fertig(wert); };
    s.setTimeout(500);
    s.once('connect', () => schluss(true));
    s.once('timeout', () => schluss(false));
    s.once('error', () => schluss(false));
  });
}

/** Wer horcht dort? Gibt Paare aus Kennung und Programmname zurueck. */
function werHorcht(port) {
  if (process.platform !== 'win32') return [];
  try {
    const roh = execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} `
      + '-State Listen -ErrorAction SilentlyContinue | ForEach-Object { '
      + '$p = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue; '
      + '\\"$($_.OwningProcess);$($p.ProcessName)\\" }"',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return roh.split('\n')
      .map((z) => z.trim()).filter(Boolean)
      .map((z) => { const [id, name] = z.split(';'); return { id: Number(id), name }; })
      // Dieselbe Kennung steht mehrfach da, wenn auf mehreren Adressen gehorcht wird.
      .filter((e, i, alle) => alle.findIndex((a) => a.id === e.id) === i);
  } catch {
    return [];
  }
}

function beende(id) {
  try {
    execSync(`taskkill /PID ${id} /F /T`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function raeumeFrei() {
  if (!await antwortetJemand(PORT)) return;

  const halter = werHorcht(PORT);
  if (halter.length === 0) {
    // Es antwortet jemand, aber wir sehen nicht wer - dann lieber abbrechen
    // als blind draufzubinden und zwei Server auf einem Port zu haben.
    console.error(`\n  Auf Port ${PORT} antwortet ein Programm, das sich nicht `
      + 'zuordnen laesst. Bitte schliessen und noch einmal starten.\n');
    process.exit(1);
  }

  for (const { id, name } of halter) {
    const kurz = (name || '').replace(/\.exe$/i, '');
    if (!UNSERE.has(name) && !UNSERE.has(`${kurz}.exe`)) {
      console.error(`\n  Port ${PORT} haelt "${name}" (${id}) - das ist kein `
        + 'CompHub. Es wird nicht beendet; bitte selbst schliessen.\n');
      process.exit(1);
    }
    console.log(`  Port ${PORT} war belegt von ${name} (${id}) - wird beendet.`);
    if (kurz === 'CompHub') {
      console.log('  Die CompHub-Anwendung startet danach von allein auf 3001.');
    }
    beende(id);
  }

  // Windows gibt den Port nicht auf die Millisekunde frei.
  for (let i = 0; i < 20; i += 1) {
    if (!await antwortetJemand(PORT)) return;
    await new Promise((f) => setTimeout(f, 250));
  }
  console.error(`\n  Port ${PORT} wird nicht frei. Bitte einmal neu starten.\n`);
  process.exit(1);
}

await raeumeFrei();

console.log(`  Entwicklungsserver auf http://localhost:${PORT}\n`);

/*
 * Next direkt aufrufen, nicht ueber npx und nicht ueber eine Shell.
 *
 * Mit `shell: true` warnt Node, weil die Argumente dann nur
 * aneinandergehaengt und nicht abgesichert werden. Der Pfad zur Datei ist
 * ohnehin bekannt - dieselbe Stelle, die auch das Fensterprogramm nimmt.
 */
const nextBin = path.join(WURZEL, 'node_modules', 'next', 'dist', 'bin', 'next');

const next = spawn(
  process.execPath,
  [nextBin, 'dev', '-H', '0.0.0.0', '-p', String(PORT)],
  { cwd: WURZEL, stdio: 'inherit' },
);
next.on('close', (code) => process.exit(code ?? 0));
