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
  // Je offenem Zustand (nicht vorhanden, haengt beim Laden, fehlgeschlagen)
  // bis zu 15 Matches.
  const jeStand = {};
  for (const [id, m] of Object.entries(z?.matches ?? {})) {
    if (m.stand === 'PARSED') continue;
    (jeStand[m.stand] ??= []).push(id);
  }
  const ids = Object.entries(jeStand).flatMap(([st, liste]) => liste.slice(0, 15).map((id) => [st, id]));
  const ergebnis = {};
  for (const [st, id] of ids) {
    let k;
    try {
      const { vorhanden } = await replayVorhanden(id);
      k = `${st}: ${vorhanden ? 'jetzt da' : '404'}`;
    } catch (e) { k = `${st}: ${e.message}`; }
    ergebnis[k] = (ergebnis[k] ?? 0) + 1;
  }
  console.log(`${w}: ${ids.length} geprueft ->`, JSON.stringify(ergebnis), z?.datum ? new Date(z.datum).toISOString().slice(0, 10) : '');
}
