// Abgleich der Solo Clutch Points: dieselben Games, mehrere Lesarten der
// Regel nebeneinander - um herauszufinden, wie eine andere Quelle (Osirion)
// zaehlt. Liest die abgelegten Ausgaben des Lesers (VOLL_ABLEGEN beim Lauf
// von scripts/clutch-berechnen.mjs) und die Wertung aus data/clutch/.
//
//   node scripts/clutch-varianten.mjs <ordner> Name1,Name2,...

import fs from 'node:fs';
import path from 'node:path';
import { clutchAusVoll } from '../lib/clutch.mjs';

const [ordner, namenText] = process.argv.slice(2);
const gesucht = (namenText ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const VARIANTEN = {
  regel: {}, abKnock: { abKnock: true }, ohneReboot: { ohneReboot: true },
  knockOhneReboot: { abKnock: true, ohneReboot: true }, nurElims: { nurElims: true }, nurPlatz: { nurPlatz: true },
};
const summe = {}; const namen = new Map();
for (const f of fs.readdirSync(ordner).filter((x) => x.endsWith('.json'))) {
  const w = f.split('__')[0];
  const regeln = JSON.parse(fs.readFileSync(path.join('data', 'clutch', `${w}.json`), 'utf8')).regeln ?? [];
  const voll = JSON.parse(fs.readFileSync(path.join(ordner, f), 'utf8'));
  for (const p of voll.spieler ?? []) if (p.epic) namen.set(String(p.epic).toLowerCase(), p.name);
  for (const [v, art] of Object.entries(VARIANTEN)) {
    for (const [k, pkt] of clutchAusVoll(voll, regeln, art)) {
      summe[v] ??= {}; summe[v][k] = (summe[v][k] ?? 0) + pkt;
    }
  }
}
const zeile = (k) => `${String(namen.get(k) ?? k).slice(0, 22).padEnd(23)}` + Object.keys(VARIANTEN).map((v) => String(summe[v]?.[k] ?? 0).padStart(15)).join('');
console.log(`${'Spieler'.padEnd(23)}${Object.keys(VARIANTEN).map((v) => v.padStart(15)).join('')}`);
for (const k of [...namen.keys()].filter((k) => gesucht.some((g) => String(namen.get(k)).toLowerCase().includes(g)))) console.log(zeile(k));
console.log('\nSpitze je Variante:');
for (const v of Object.keys(VARIANTEN)) {
  const top = Object.entries(summe[v] ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, p]) => `${namen.get(k)} ${p}`);
  console.log(`${v.padEnd(16)} ${top.join(' | ')}`);
}
