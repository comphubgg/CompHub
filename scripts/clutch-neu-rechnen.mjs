// Die Solo Clutch Points aller Spieltage aus den abgelegten Rohdaten neu
// rechnen (data/clutch-roh, geschrieben von scripts/clutch-berechnen.mjs) -
// ohne ein einziges Replay erneut zu laden. Gebraucht, sobald sich die Regel
// aendert (lib/clutch.mjs, clutchAusVoll). Schaden und Spielzahlen in
// data/clutch/<windowId>.json bleiben, nur die Punkte (und die Solo-Zeit in
// Sekunden, "solo") werden ersetzt.
//
// Fehlt einem Spieltag die Punktetabelle (Epic fuehrt sie nur, solange der Cup
// laeuft), wird sie hergeleitet und gegen Epics Teampunkte geprueft
// (lib/clutchRegeln.mjs). Nur eine belegte Tabelle wird benutzt.
//
//   node scripts/clutch-neu-rechnen.mjs

import fs from 'node:fs';
import path from 'node:path';
import { clutchAusVoll } from '../lib/clutch.mjs';
import { regelnHerleiten } from '../lib/clutchRegeln.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ROH = path.join(DATEN, 'clutch-roh');
const ZIEL = path.join(DATEN, 'clutch');
let gerechnet = 0; let hergeleitet = 0; let ohneTabelle = 0;

/** Duos? Clutch gibt es nur im Team aus zwei - bei Solos und Squads lohnt die Herleitung nicht. */
function istDuo(matches) {
  const m = matches?.[0];
  if (!m) return false;
  const je = new Map();
  for (const p of m.spieler ?? []) if (!p.bot) je.set(p.team, (je.get(p.team) ?? 0) + 1);
  const haeufigkeit = new Map();
  for (const n of je.values()) haeufigkeit.set(n, (haeufigkeit.get(n) ?? 0) + 1);
  return [...haeufigkeit.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] === 2;
}

for (const f of fs.existsSync(ROH) ? fs.readdirSync(ROH).filter((x) => x.endsWith('.json')) : []) {
  const roh = JSON.parse(fs.readFileSync(path.join(ROH, f), 'utf8'));
  let herkunft = null;
  if (!roh.regeln?.length) {
    if (!istDuo(roh.matches)) continue;
    const h = await regelnHerleiten(roh.windowId, roh.matches);
    if (!h) { ohneTabelle += 1; continue; }
    roh.regeln = h.regeln;
    herkunft = h.beleg;
    hergeleitet += 1;
  }
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
    regeln: roh.regeln, ...(herkunft ? { regelHerkunft: herkunft } : { regelHerkunft: undefined }),
    neuGerechnet: new Date().toISOString(), matches, summe, solo }, null, 1));
  gerechnet += 1;
}
console.log(`Clutch aus Rohdaten neu gerechnet: ${gerechnet} Spieltage (Tabelle hergeleitet: ${hergeleitet}, ohne belegte Tabelle: ${ohneTabelle})`);
