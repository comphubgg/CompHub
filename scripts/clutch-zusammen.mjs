// Die Teilstaende der vollen Replays (scripts/clutch-berechnen.mjs --verteilt) in die Spieltags-Dateien einarbeiten.
//
// Jeder Rechner liest von jedem offenen Spieltag jedes N-te Match und legt nur seinen Teil ab: data/clutch-teil/<windowId>__<n>.json. Hier - an einer
// einzigen Stelle, im Schritt "ablegen" - kommen die Teile auf den Stand vom Release: Matches anhaengen, Summen addieren (Clutch-Punkte, Schaden,
// Treffer, Sturmzeit, Reboots, Spiele, Ueberlebenszeit), Plattform je Spieler, Matches ohne Replay merken. Solange nicht jedes bekannte Match gelesen ist,
// steht "teilweise" in der Datei - die Seite zeigt Werte dann nur bei Spielern, deren Spiele alle gelesen sind (app/api/cup-spieler).
//
// Rohdaten (Kill-Feed, Figuren - fuer spaetere Neuberechnungen) gibt es nur bei kleinen Spieltagen (bis 250 Matches). Grosse Spieltage tragen
// "ohneRohRechnung": clutch-neu-rechnen.mjs und clutch-leben.mjs rechnen sie nicht aus Rohdaten neu, denn die decken dort nur einen Teil ab.
//
//   node scripts/clutch-zusammen.mjs

import fs from 'node:fs';
import path from 'node:path';

const DATEN = path.join(process.cwd(), 'data');
const TEILE = path.join(DATEN, 'clutch-teil');
const ZIEL = path.join(DATEN, 'clutch');
const ROH = path.join(DATEN, 'clutch-roh');
const GROSS_MAX = 250;
const liesDatei = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const addiere = (ziel, quelle) => { for (const [k, v] of Object.entries(quelle ?? {})) ziel[k] = (ziel[k] ?? 0) + v; };

const jeTag = new Map();
for (const f of fs.existsSync(TEILE) ? fs.readdirSync(TEILE).filter((x) => x.endsWith('.json')) : []) {
  const w = f.replace(/__\d+\.json$/, '');
  jeTag.set(w, [...(jeTag.get(w) ?? []), path.join(TEILE, f)]);
}

fs.mkdirSync(ZIEL, { recursive: true });
fs.mkdirSync(ROH, { recursive: true });
let tage = 0; let neu = 0; let fertigTage = 0;
for (const [w, dateien] of jeTag) {
  const zielDatei = path.join(ZIEL, `${w}.json`);
  const alt = liesDatei(zielDatei);
  // Vor Fassung 4 (alte Schadensregel) wird nichts weitergefuehrt - der Spieltag ist ganz neu gelesen.
  const d = alt && (alt.version ?? 0) >= 4 ? alt : { version: 4, windowId: w, matches: [], summe: {}, spiele: {} };
  d.matches ??= []; d.summe ??= {}; d.spiele ??= {}; d.ohne ??= [];
  const da = new Set([...d.matches.map((m) => m.id), ...d.ohne]);
  const rohDatei = path.join(ROH, `${w}.json`);
  let roh = null;
  for (const datei of dateien) {
    const t = liesDatei(datei);
    if (!t) continue;
    d.eventId ??= t.eventId;
    if (t.regeln?.length && !d.regeln?.length) d.regeln = t.regeln;
    d.gesamt = Math.max(d.gesamt ?? 0, t.gesamt ?? 0);
    const gross = d.gesamt > GROSS_MAX;
    // Ein Teil traegt nur Matches, die der Rechner zu Beginn offen sah - schon vorhandene kommen nicht doppelt.
    const neuHier = (t.matches ?? []).filter((m) => !da.has(m.id));
    if (neuHier.length !== (t.matches ?? []).length) {
      console.log(`  ${w}: ${t.matches.length - neuHier.length} Matches standen schon da - Teil ${path.basename(datei)} uebersprungen`);
      continue;
    }
    for (const m of neuHier) { d.matches.push(m); da.add(m.id); }
    for (const id of t.ohne ?? []) if (!da.has(id)) { d.ohne.push(id); da.add(id); }
    addiere(d.summe, t.summe);
    addiere(d.spiele, t.spiele);
    if (Object.keys(t.solo ?? {}).length) { d.solo ??= {}; addiere(d.solo, t.solo); }
    if (Object.keys(t.leben ?? {}).length) { d.leben ??= {}; addiere(d.leben, t.leben); }
    if (Object.keys(t.schaden ?? {}).length) {
      d.schaden ??= {};
      for (const [k, v] of Object.entries(t.schaden)) {
        const s = d.schaden[k] ?? { dmg: 0, dmgAlle: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
        for (const f of Object.keys(v)) s[f] = (s[f] ?? 0) + (v[f] ?? 0);
        d.schaden[k] = s;
      }
    }
    if (Object.keys(t.plattform ?? {}).length) { d.plattform ??= {}; Object.assign(d.plattform, t.plattform); }
    if (gross) d.ohneRohRechnung = true;
    else if ((t.roh ?? []).length) {
      roh ??= liesDatei(rohDatei) ?? { eventId: d.eventId, windowId: w, regeln: d.regeln ?? [], matches: [] };
      const rohDa = new Set(roh.matches.map((m) => m.id));
      for (const m of t.roh) if (!rohDa.has(m.id)) roh.matches.push(m);
    }
    neu += neuHier.length;
  }
  const gelesen = d.matches.length;
  const erledigt = gelesen + d.ohne.length;
  if (erledigt < (d.gesamt ?? 0)) d.teilweise = { teams: 0, matches: gelesen, vonMindestens: d.gesamt };
  else { delete d.teilweise; fertigTage += 1; }
  d.gerechnet = new Date().toISOString();
  fs.writeFileSync(zielDatei, JSON.stringify(d));
  if (roh) fs.writeFileSync(rohDatei, JSON.stringify(roh));
  tage += 1;
}
console.log(`Zusammengefuehrt: ${neu} neue Matches in ${tage} Spieltagen, davon ${fertigTage} jetzt ganz gelesen.`);
