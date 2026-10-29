// Die Ueberlebenszeit je Spieler (lib/clutchLeben.mjs) in jede data/clutch/<windowId>.json eintragen - aus den abgelegten Rohdaten
// (data/clutch-roh), ohne ein Replay neu zu laden. Laeuft im Ablauf "Clutch rechnen" vor dem Ablegen; damit bekommen auch alle frueheren
// Spieltage den Wert "Time Alive" der Player Stats (Betreiber, 29.10.2026: "mindestens ... Time Alive ... fuer jeden Cup").
//
//   node scripts/clutch-leben.mjs
import fs from 'fs';
import path from 'path';
import { lebenSumme } from '../lib/clutchLeben.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ROH = path.join(DATEN, 'clutch-roh');
const ZIEL = path.join(DATEN, 'clutch');
let neu = 0; let gleich = 0; let ohne = 0;

for (const f of fs.existsSync(ROH) ? fs.readdirSync(ROH).filter((x) => x.endsWith('.json')) : []) {
  const ziel = path.join(ZIEL, f);
  if (!fs.existsSync(ziel)) { ohne += 1; continue; }
  try {
    const roh = JSON.parse(fs.readFileSync(path.join(ROH, f), 'utf8'));
    const datei = JSON.parse(fs.readFileSync(ziel, 'utf8'));
    const leben = lebenSumme(roh.matches);
    if (!Object.keys(leben).length) { ohne += 1; continue; }
    if (JSON.stringify(datei.leben ?? null) === JSON.stringify(leben)) { gleich += 1; continue; }
    datei.leben = leben;
    fs.writeFileSync(ziel, JSON.stringify(datei, null, 1));
    neu += 1;
  } catch (e) { console.log(`  ${f}: ${e.message}`); }
}
console.log(`Ueberlebenszeit: ${neu} eingetragen, ${gleich} schon aktuell, ${ohne} ohne Rohdaten oder Buszeit`);
