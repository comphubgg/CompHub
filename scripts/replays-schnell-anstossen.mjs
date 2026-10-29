// Ob die Schnellspur der Replays (.github/workflows/replays-schnell.yml) jetzt laufen soll - aus der Discord-Live-Kette alle zehn Minuten.
//
// Ja, solange ein Cup laeuft oder vor hoechstens sechs Stunden zu Ende ging (seine Replays legt Epic erst nach und nach ab), und einmal in der Stunde
// ohnehin (die ersten zehn Minuten): dann holt die Schnellspur nach, was in den 36 Stunden ihrer Zustaendigkeit noch offen ist. Laeuft schon ein Lauf,
// wartet hoechstens einer (concurrency) - ein Anstoss zu viel kostet nichts.
//
//   node scripts/replays-schnell-anstossen.mjs     schreibt "anstossen=ja|nein" nach GITHUB_OUTPUT

import fs from 'node:fs';
import { replayRegel, endrunden } from '../lib/replayRegel.mjs';

const SEITE = (process.env.WERKZEUG_URL || 'https://www.thecomphub.com').replace(/\/+$/, '');
const jetzt = Date.now();

let frisch = 0; let grund = '';
try {
  const r = await fetch(`${SEITE}/api/cup-catalog?modus=alle`, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const katalog = await r.json();
  for (const cup of katalog.cups ?? []) {
    const regel = replayRegel(cup);
    if (regel === 'nichts') continue;
    for (const liste of Object.values(cup.regionen ?? {})) {
      const finals = regel === 'nurFinals' ? endrunden(liste) : null;
      for (const w of liste) {
        if (finals && !finals.has(w.windowId)) continue;
        if (w.status === 'live' || (w.status === 'vorbei' && jetzt - (w.end ?? 0) < 6 * 3600_000)) frisch += 1;
      }
    }
  }
  grund = frisch ? `${frisch} Spieltage laufen oder gingen eben zu Ende` : '';
} catch (e) {
  // Ohne Katalog lieber einmal zu viel: die Schnellspur sieht selbst nach.
  frisch = 1; grund = `Katalog nicht erreichbar (${e.message})`;
}
const stuendlich = new Date(jetzt).getUTCMinutes() < 10;
const ja = frisch > 0 || stuendlich;
console.log(`Schnellspur: ${ja ? 'anstossen' : 'nicht noetig'}${grund ? ` - ${grund}` : stuendlich ? ' - stuendliche Nachschau' : ''}`);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `anstossen=${ja ? 'ja' : 'nein'}\n`);
