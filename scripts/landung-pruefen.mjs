// Gegenprobe der Landepunkte (18.11.2026, Drop-Karten): stimmt die Landung aus den Positionsproben (CharacterSample, 10 s Takt, lib/replayPositionen)
// mit der exakten Landung aus dem Netzwerkstrom (tools/replay-voll LandungJe: erste Position ohne Fallen und ohne Fallschirm nach dem Absprung) ueberein?
//
//   node scripts/landung-pruefen.mjs <windowId> [hoechstens]
//
// Die Matches kommen aus clutch-roh/<windowId>.json am Release (dieselben, die die Seite zeigt). Je Spieler: Abstand der beiden Landepunkte (m) und
// Zeitabstand (s, nach Abgleich der beiden Uhren je Match ueber den Median). Ausgabe mit LANDUNG am Zeilenanfang.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { leserDienst, mitFrist } from '../lib/vollMatch.mjs';
import { spurenAusReplay, auswerten } from '../lib/replayPositionen.mjs';
import { releaseDatei } from '../lib/liveAblage.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');

const [w, hoechstensArg] = process.argv.slice(2);
if (!w) { console.log('node scripts/landung-pruefen.mjs <windowId> [hoechstens]'); process.exit(1); }
const roh = JSON.parse(String(await releaseDatei(`clutch-roh/${w}.json`)));
const matches = roh.matches.slice(0, Number(hoechstensArg) || 99);
const leser = leserDienst(2);
const alle = [];
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(p * (s.length - 1))] : null; };
for (const m of matches) {
  const datei = path.join(os.tmpdir(), `landung-${m.id}.replay`);
  try {
    const puffer = await mitFrist(downloadReplay({ matchId: m.id, dataCount: 100000, checkpointCount: 0, eventCount: 100000 }), 180_000, 'Download');
    fs.writeFileSync(datei, puffer);
    const voll = await mitFrist(leser.lies(datei), 240_000, 'Leser');
    const proben = auswerten(spurenAusReplay(puffer));
    const epicVon = new Map((voll.spieler ?? []).map((s) => [String(s.id), String(s.epic ?? '').toLowerCase()]));
    const paare = [];
    for (const [id, l] of Object.entries(voll.landung ?? {})) {
      const p = proben[epicVon.get(id)]?.landung;
      if (!p) continue;
      paare.push({ epic: epicVon.get(id), exakt: l, probe: p });
    }
    // Die Uhr der Proben (ganze Sekunden) gegen die des Stroms: die Probe "am Boden" kommt nie vor der Landung und hoechstens 10 s danach - also
    // liegt der Versatz zwischen dem groessten (exakt - Probe) und dem kleinsten (exakt - Probe) + 10. Genommen: das 90. Perzentil (Ausreisser duerfen sein).
    const versatz = q(paare.map((x) => x.exakt[0] - x.probe.t), 0.9);
    for (const x of paare) {
      const d = Math.hypot(x.exakt[1] - x.probe.x, x.exakt[2] - x.probe.y) / 100;
      const dt = x.probe.t + versatz - x.exakt[0];
      alle.push({ d, dt, hoch: x.exakt[3] > 20000 });
    }
    const echte = (voll.spieler ?? []).filter((s) => !s.bot && s.epic).length;
    console.log(`LANDUNG ${m.id}: Spieler ${echte}, exakt ${Object.keys(voll.landung ?? {}).length}, Proben ${Object.values(proben).filter((v) => v.landung).length}, Paare ${paare.length}, Uhrenversatz ${versatz?.toFixed(1)} s, Median ${median(paare.map((x) => Math.hypot(x.exakt[1] - x.probe.x, x.exakt[2] - x.probe.y) / 100))?.toFixed(1)} m`);
    for (const x of paare.slice(0, 3)) console.log(`LANDUNG   ${x.epic}: exakt [${x.exakt.join(', ')}] Probe [${x.probe.x}, ${x.probe.y}, t ${x.probe.t}]`);
  } catch (e) {
    console.log(`LANDUNG ${m.id}: ${String(e?.message).slice(0, 160)}`);
  } finally { fs.rmSync(datei, { force: true }); }
}
leser.ende();
const ds = alle.map((a) => a.d); const ts = alle.map((a) => a.dt);
console.log(`LANDUNG gesamt ${alle.length} Spieler-Matches: Abstand Median ${q(ds, 0.5)?.toFixed(1)} m, p75 ${q(ds, 0.75)?.toFixed(1)} m, p90 ${q(ds, 0.9)?.toFixed(1)} m, p99 ${q(ds, 0.99)?.toFixed(1)} m, max ${q(ds, 1)?.toFixed(1)} m`);
console.log(`LANDUNG Probe 0-10,5 s nach exakt: ${(100 * ts.filter((t) => t >= -0.5 && t <= 10.5).length / Math.max(1, ts.length)).toFixed(1)} %, exakt mit z > 20.000: ${alle.filter((a) => a.hoch).length}`);
console.log(`LANDUNG Zeit (Probe nach exakt, s): Median ${q(ts, 0.5)?.toFixed(1)}, p10 ${q(ts, 0.1)?.toFixed(1)}, p90 ${q(ts, 0.9)?.toFixed(1)}`);
console.log(`LANDUNG unter 25 m: ${(100 * ds.filter((d) => d < 25).length / Math.max(1, ds.length)).toFixed(1)} %, unter 50 m: ${(100 * ds.filter((d) => d < 50).length / Math.max(1, ds.length)).toFixed(1)} %, unter 100 m: ${(100 * ds.filter((d) => d < 100).length / Math.max(1, ds.length)).toFixed(1)} %`);
process.exit(0);
