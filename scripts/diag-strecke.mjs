// Diagnose: Strecke je Spieler aus den CharacterSample-Proben einer Replay-Datei - zu Fuss, in der Luft, im Bus (Meter), fuer Namen nach Muster.
//   node scripts/diag-strecke.mjs <replay> <namen.json aus der Leser-Ausgabe> <muster>
import fs from 'node:fs';
import { spurenAusReplay } from '../lib/replayPositionen.mjs';
const [datei, aus, muster] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(aus, 'utf8'));
const namen = Object.fromEntries((d.spieler ?? []).filter((p) => p.epic).map((p) => [p.epic.toLowerCase(), p.name]));
const spuren = spurenAusReplay(fs.readFileSync(datei));
const re = new RegExp(muster, 'i');
for (const [id, t] of Object.entries(spuren)) {
  const n = namen[id]; if (!n || !re.test(n)) continue;
  let fuss = 0, luft = 0, bus = 0, sprung = 0;
  for (let i = 1; i < t.length; i++) {
    const p = t[i], v = t[i - 1];
    const d2 = Math.hypot(p[1] - v[1], p[2] - v[2]) / 100;
    if (d2 / Math.max(1, p[0] - v[0]) > 120) { sprung += d2; continue; }
    if (p[5] && v[5]) bus += d2;
    else if (p[4] !== 5 && v[4] !== 5) fuss += d2;
    else luft += d2;
  }
  console.log('STRECKE', n, JSON.stringify({ fuss: Math.round(fuss), luft: Math.round(luft), bus: Math.round(bus), sprung: Math.round(sprung), proben: t.length }));
}
