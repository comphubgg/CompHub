// Probe der Sofortspur: die Teile, die scripts/sofort-test/empfaenger.mjs im Lauf auf GitHub angenommen hat (<windowId>__<matchId>.json.gz), an eine
// Seite schicken (POST /api/sofort/match) - genau wie scripts/live-spur.mjs (senden). Misst je Teil die Antwortzeit des Servers.
//
//   SOFORT_SECRET=... node scripts/sofort-test/nachsenden.mjs <ordner> <url> [--fenster <w>] [--nur <matchId,...>] [--abstand <ms>]

import fs from 'node:fs';
import path from 'node:path';

const arg = process.argv.slice(2);
const wert = (k) => { const i = arg.indexOf(k); return i >= 0 ? arg[i + 1] : undefined; };
const [ordner, url] = arg;
const fenster = wert('--fenster');
const nur = wert('--nur') ? new Set(wert('--nur').split(',')) : null;
const abstand = Number(wert('--abstand') || 0);
const geheim = (process.env.SOFORT_SECRET || '').trim();
const namen = fs.readdirSync(ordner).filter((n) => n.endsWith('.json.gz')).sort();
for (const n of namen) {
  const [w, rest] = n.split('__');
  const id = rest.replace(/\.json\.gz$/, '');
  if ((fenster && w !== fenster) || (nur && !nur.has(id))) continue;
  const koerper = fs.readFileSync(path.join(ordner, n));
  const t0 = performance.now();
  const r = await fetch(url, { method: 'POST', body: koerper, headers: { Authorization: `Bearer ${geheim}`, 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } });
  const text = await r.text();
  console.log(new Date().toISOString().slice(11, 23), w, id, r.status, `${(performance.now() - t0).toFixed(1)} ms rund`, text.slice(0, 200));
  if (abstand) await new Promise((ok) => setTimeout(ok, abstand));
}
