// Stichprobe: sind "nicht vorhandene" Replays heute noch immer nicht da?
// Liest die Zustaende der genannten Spieltage vom Release und fragt fuer bis
// zu 15 Matches je Tag erneut nach den Metadaten - mit frischem Token.
//
//   node scripts/replay-verfuegbar-probe.mjs S42_ArenaPerfEval_Event2_EU S42_MadisonBeerIconCup_ME ...

import { replayVorhanden } from '../lib/replayKern.mjs';

for (const w of process.argv.slice(2)) {
  const saison = /^(S\d+)_/.exec(w)?.[1];
  const z = await fetch(`https://github.com/comphubgg/CompHub/releases/download/daten-replays/replays__${saison}__${w}___zustand.json`)
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const ids = Object.entries(z?.matches ?? {}).filter(([, m]) => m.stand === 'NOT_AVAILABLE').map(([id]) => id).slice(0, 15);
  const ergebnis = {};
  for (const id of ids) {
    try {
      const { vorhanden } = await replayVorhanden(id);
      ergebnis[vorhanden ? 'jetzt da' : '404'] = (ergebnis[vorhanden ? 'jetzt da' : '404'] ?? 0) + 1;
    } catch (e) { ergebnis[e.message] = (ergebnis[e.message] ?? 0) + 1; }
  }
  console.log(`${w}: ${ids.length} geprueft ->`, JSON.stringify(ergebnis), z?.datum ? new Date(z.datum).toISOString().slice(0, 10) : '');
}
