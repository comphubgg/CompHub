// Solo Clutch Points eines oder mehrerer Spieltage zusammengezaehlt ausgeben -
// zum Abgleich mit anderen Quellen (Osirion). Liest data/clutch/<windowId>.json
// (vorher scripts/clutch-berechnen.mjs laufen lassen).
//
//   node scripts/clutch-probe.mjs MannekenPis_Day1 MannekenPis_Day2

import fs from 'node:fs';
import path from 'node:path';

const fenster = process.argv.slice(2);
const lan = await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/lan-konten.json')
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const summe = new Map(); const namen = new Map();
for (const w of fenster) {
  const d = JSON.parse(fs.readFileSync(path.join('data', 'clutch', `${w}.json`), 'utf8'));
  console.log(`${w}: ${d.matches?.length ?? 0} Games, Version ${d.version ?? 1}`);
  for (const [id, p] of Object.entries(d.summe ?? {})) {
    const k = lan[id]?.echt ?? id;
    if (lan[id]?.name) namen.set(k, lan[id].name);
    summe.set(k, (summe.get(k) ?? 0) + p);
  }
}
console.log('\nSolo Clutch Points zusammen:');
[...summe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([k, p], i) => console.log(`${String(i + 1).padStart(2)}. ${(namen.get(k) ?? k).padEnd(28)} ${p}`));
