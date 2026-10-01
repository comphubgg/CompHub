// Die Solo Clutch Points aller Spieltage aus den abgelegten Rohdaten neu
// rechnen (data/clutch-roh, geschrieben von scripts/clutch-berechnen.mjs) -
// ohne ein einziges Replay erneut zu laden. Gebraucht, sobald sich die Regel
// aendert (lib/clutch.mjs, clutchAusVoll). Schaden und Spielzahlen in
// data/clutch/<windowId>.json bleiben, nur die Punkte (und die Solo-Zeit in
// Sekunden, "solo") werden ersetzt.
//
//   node scripts/clutch-neu-rechnen.mjs

import fs from 'node:fs';
import path from 'node:path';
import { clutchAusVoll } from '../lib/clutch.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ROH = path.join(DATEN, 'clutch-roh');
const ZIEL = path.join(DATEN, 'clutch');
let gerechnet = 0;
for (const f of fs.existsSync(ROH) ? fs.readdirSync(ROH).filter((x) => x.endsWith('.json')) : []) {
  const roh = JSON.parse(fs.readFileSync(path.join(ROH, f), 'utf8'));
  if (!roh.regeln?.length) continue;
  const zielDatei = path.join(ZIEL, f);
  let alt = {};
  try { alt = JSON.parse(fs.readFileSync(zielDatei, 'utf8')); } catch { /* neu */ }
  const summe = {}; const matches = []; const solo = {};
  for (const m of roh.matches ?? []) {
    const soloMatch = new Map();
    const c = clutchAusVoll(m, roh.regeln, { solo: soloMatch });
    matches.push({ id: m.id, spieler: Object.fromEntries(c) });
    for (const [k, v] of c) summe[k] = (summe[k] ?? 0) + v;
    for (const [k, v] of soloMatch) solo[k] = (solo[k] ?? 0) + Math.round(v);
  }
  fs.mkdirSync(ZIEL, { recursive: true });
  fs.writeFileSync(zielDatei, JSON.stringify({ ...alt, version: 3, eventId: roh.eventId, windowId: roh.windowId,
    regeln: roh.regeln, neuGerechnet: new Date().toISOString(), matches, summe, solo }, null, 1));
  gerechnet += 1;
}
console.log(`Clutch aus Rohdaten neu gerechnet: ${gerechnet} Spieltage`);
