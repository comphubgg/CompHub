// Diagnose (15.11.2026, exakt-mats-strecke): Strecke je Spieler und Match gegen Epics Travel_Distance_Ground (dieselbe Sitzung).
//   node scripts/diag-strecke-epic.mjs <aus.json> <epic-sitzungen.json> <replay>
import fs from 'node:fs';
import { spurenAusReplay } from '../lib/replayPositionen.mjs';
const [aus, epicDatei, replay] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(aus, 'utf8'));
const epic = JSON.parse(fs.readFileSync(epicDatei, 'utf8'));
const match = String(d.match ?? '').toLowerCase();
const jeId = {};
const ids = new Set();
for (const e of epic) for (const s of e.sitzungen) { ids.add(s.id); if (String(s.id).toLowerCase() === match) jeId[String(e.ids[0]).toLowerCase()] = s.st?.Travel_Distance_Ground; }
console.log('STRECKE-EPIC match', match, 'Spieler mit Epic-Wert', Object.keys(jeId).length, 'Beispiel-Sitzungen', [...ids].slice(0, 3).join(','));
const spuren = replay ? spurenAusReplay(fs.readFileSync(replay)) : {};
const zeilen = [];
for (const p of d.spieler ?? []) {
  const e = jeId[String(p.epic).toLowerCase()]; if (e == null) continue;
  const sv = d.streckeVoll?.[p.id] ?? [0, 0, 0, 0, 0]; const pz = d.msDiag?.pawnZahl?.[p.id] ?? [];
  let fuss = 0; const t = spuren[String(p.epic).toLowerCase()] ?? [];
  for (let i = 1; i < t.length; i++) { const a = t[i], b = t[i - 1]; const m = Math.hypot(a[1] - b[1], a[2] - b[2]) / 100; if (a[4] !== 5 && b[4] !== 5 && m / Math.max(1, a[0] - b[0]) < 120) fuss += m; }
  zeilen.push([p.name, Math.round(e / 100), sv[0], (sv[0] / (e / 100)).toFixed(3), Math.round(fuss), (fuss / (e / 100)).toFixed(3), sv[4], t.length, pz.join('/')]);
}
for (const z of zeilen.slice(0, 40)) console.log('STRECKE-EPIC', JSON.stringify(z));
