// Gegenprobe: Schaden aus den Server-Replays gegen die Szene-Quelle.
//
// Liest die Games eines Spieltags voll (tools/replay-voll, SchadenLeser),
// zaehlt den Schaden je Konto zusammen und stellt ihn neben die Werte, die
// die Szene-Quelle (eucompetitive) fuer denselben Tag fuehrt - abgerufen
// ueber die Seite selbst (/api/cup-spieler). Stimmen die Zahlen, taugt der
// Weg fuer jeden Cup; sonst sagt die Tabelle, wie weit sie auseinander liegen.
//
//   node scripts/schaden-probe.mjs <eventId> <windowId> [hoechstens]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { matchIds } from '../lib/replayKern.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const WERKZEUG = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVoll.dll');
const [eventId, windowId, hoechstensText] = process.argv.slice(2);
const hoechstens = Number(hoechstensText) || 6;

const lanKonten = await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/lan-konten.json')
  .then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const echt = (id) => lanKonten[id]?.echt ?? id;

const ids = [...await matchIds(eventId, windowId, 1)].slice(0, hoechstens);
console.log(`${windowId}: ${ids.length} Games`);
const summe = new Map();
for (const id of ids) {
  const datei = path.join(os.tmpdir(), `schaden-${id}.replay`);
  try {
    const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
    fs.writeFileSync(datei, puffer);
    const erstes = !summe.size;
    const roh = JSON.parse(execFileSync('dotnet', [WERKZEUG, datei], {
      maxBuffer: 256 * 1024 * 1024, env: { ...process.env, SCHADEN_ROH: erstes ? '60' : '0' },
    }).toString('utf8'));
    if (roh.schadenRoh) console.log(roh.schadenRoh.join(String.fromCharCode(10)));
    const epicVon = new Map((roh.spieler ?? []).map((p) => [p.id, p.epic]));
    console.log(`  ${id}: ${roh.schadenEreignisse} Schadens-Ereignisse, ${roh.schadenZugeordnet} zugeordnet, ${roh.schaden?.length ?? 0} Spieler`);
    for (const s of roh.schaden ?? []) {
      const k = echt(epicVon.get(s.id) ?? `?${s.id}`);
      const d = summe.get(k) ?? { gemacht: 0, genommen: 0, treffer: 0, krit: 0 };
      d.gemacht += s.gemacht; d.genommen += s.genommen; d.treffer += s.treffer; d.krit += s.krit;
      summe.set(k, d);
    }
  } catch (e) {
    console.log(`  ${id}: ${String(e.message).slice(0, 200)}`);
  } finally { fs.rmSync(datei, { force: true }); }
}

const szene = await fetch(`https://www.thecomphub.com/api/cup-spieler?event=${encodeURIComponent(eventId)}&window=${encodeURIComponent(windowId)}&limit=500`)
  .then((r) => (r.ok ? r.json() : null)).catch(() => null);
const vergleich = new Map((szene?.spieler ?? []).map((s) => [s.epicId, s]));
console.log(`\nQuelle der Seite: ${szene?.quelle ?? '-'} (${szene?.spieler?.length ?? 0} Spieler)`);
console.log('Konto                             Replay-Schaden  Quelle-Schaden  Replay-erlitten  Quelle-erlitten  Treffer Quelle-Treffer');
const reihe = [...summe.entries()].sort((a, b) => b[1].gemacht - a[1].gemacht).slice(0, 25);
for (const [k, d] of reihe) {
  const v = vergleich.get(k);
  console.log(`${(v?.name ?? k).slice(0, 32).padEnd(33)} ${String(Math.round(d.gemacht)).padStart(14)}  ${String(v?.damage ?? '-').padStart(14)}  ${String(Math.round(d.genommen)).padStart(15)}  ${String(v?.damageTaken ?? '-').padStart(15)}  ${String(d.treffer).padStart(7)} ${String(v?.hits ?? '-').padStart(14)}`);
}
