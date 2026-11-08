// Abgleich der Heilung (Health Healed) eines Spielers ueber mehrere Matches gegen eine Vergleichszahl (etwa Osirion) - mit Varianten der Regel.
// Laeuft im Ablauf "Abgleich" (GitHub), nicht auf dem Rechner des Betreibers.
//   node scripts/abgleich-heilung.mjs <epicId> <soll> <matchId,matchId,...>
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFileSync } from 'node:child_process'; import { createRequire } from 'node:module';
import { schadenAus } from '../lib/vollSchaden.mjs';

const [konto, soll, liste] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const DLL = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVollReplayReader.dll');

const summe = { jetzt: 0, ohneSiphon: 0, ohneRegen: 0, ohneBeides: 0, nurGross: 0 };
for (const id of liste.split(',')) {
  const datei = path.join(os.tmpdir(), `${id}.replay`);
  try {
    fs.writeFileSync(datei, await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 0, eventCount: 100000 }));
    const v = JSON.parse(execFileSync('dotnet', [DLL, datei], { maxBuffer: 512 * 1024 * 1024 }).toString('utf8'));
    const p = v.spieler.find((x) => String(x.epic).toLowerCase() === konto);
    if (!p) { console.log(id, 'Spieler nicht im Match'); continue; }
    const jetzt = schadenAus(v)?.[p.epic]?.heilHp ?? 0;
    // Die Lebenspunkte-Spruenge dieses Spielers nachrechnen - und je Sprung festhalten, ob er kurz nach einer eigenen Elimination kam (Siphon) oder ein +5-Takt ist (Regeneration).
    const elims = (v.feed ?? []).filter((e) => e.taeter === p.id && e.opfer !== p.id && e.art === 'tot' && e.ursache !== 50).map((e) => e.t);
    const knocks = (v.feed ?? []).filter((e) => e.taeter === p.id && e.opfer !== p.id && e.art === 'unten').map((e) => e.t);
    const l = (v.leben?.[p.id] ?? []).filter((s) => s[0] >= (v.busAb ?? 0));
    let siphon = 0; let regen = 0; let gross = 0;
    for (let i = 1; i < l.length; i += 1) {
      const a = l[i][1] - l[i - 1][1]; const t = l[i][0];
      if (a <= 0) continue;
      if ([...elims, ...knocks].some((x) => t - x >= -0.3 && t - x <= 2.5)) siphon += a;
      else if (a <= 5.01) regen += a;
      else gross += a;
    }
    summe.jetzt += jetzt; summe.ohneSiphon += Math.max(0, jetzt - siphon); summe.ohneRegen += Math.max(0, jetzt - regen); summe.ohneBeides += Math.max(0, jetzt - siphon - regen);
    console.log(id, 'jetzt', Math.round(jetzt), 'siphon', Math.round(siphon), 'regen(+5)', Math.round(regen), 'sonst', Math.round(gross), 'elims', elims.length);
  } catch (e) { console.log(id, 'Fehler', String(e.message).slice(0, 120)); } finally { fs.rmSync(datei, { force: true }); }
}
const s = Number(soll);
for (const [k, w] of Object.entries(summe)) console.log(k.padEnd(12), Math.round(w), `${(((w - s) / s) * 100).toFixed(1)} %`);
