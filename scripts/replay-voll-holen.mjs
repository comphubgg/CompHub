// Server-Replays der Finals und LANs vollstaendig auslesen und fuer immer ablegen.
//
// Der Betreiber (26./28.9.2026): eine Seite /admin/replay "wie eine echte
// Seite zu jedem Match ... Spieler Stats, Team Stats, Zone Stats", und "alles
// speichern, dass alles fuer immer bleibt" - Epic loescht ein Replay nach 31
// Tagen. Dieser Lauf holt jedes Match eines Finaltags (Epics Bestenliste
// nennt die Sitzungen), liest es mit tools/replay-voll aus (Zonen, Kill-Feed
// mit Ort und Zeit, Spieler) und legt das Ergebnis ab:
//
//   data/replay-voll/<JJJJ-MM>/<windowId>/<matchId>.json   je Match
//   data/replay-voll/index.json                            was es gibt
//
// Beides geht mit scripts/ablage-github.mjs ans Release (je Monat ein eigenes,
// ein Release fasst hoechstens tausend Dateien).
//
//   node scripts/replay-voll-holen.mjs [--hoechstens 24]
//   node scripts/replay-voll-holen.mjs <eventId> <windowId>   ein Tag, egal wie alt

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { matchIds } from '../lib/replayKern.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'replay-voll');
const INDEX = path.join(ZIEL, 'index.json');
const WERKZEUG = path.join(process.cwd(), 'tools', 'replay-voll', 'bin', 'Release', 'net10.0', 'ReplayVoll.dll');

const liesJson = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };
const arg = process.argv.slice(2);
const hoechstens = Number(arg[arg.indexOf('--hoechstens') + 1]) || 24;

if (!fs.existsSync(WERKZEUG)) {
  console.log(`Leser fehlt (${WERKZEUG}) - erst: dotnet build tools/replay-voll -c Release`);
  process.exit(0);
}

const index = liesJson(INDEX, { matches: {} });

/** Welche Tage: Finals und LANs der letzten 31 Tage aus Epics Spieltagen. */
function tage() {
  if (arg.length >= 2 && !arg[0].startsWith('--')) return [{ eventId: arg[0], windowId: arg[1], datum: Date.now(), titel: arg[1] }];
  const grenze = Date.now() - 31 * 864e5;
  const raus = [];
  const ordner = path.join(DATEN, 'epic-spieltage');
  for (const s of fs.existsSync(ordner) ? fs.readdirSync(ordner) : []) {
    const o = path.join(ordner, s);
    if (!fs.statSync(o).isDirectory()) continue;
    for (const f of fs.readdirSync(o).filter((x) => x.endsWith('.json'))) {
      const t = liesJson(path.join(o, f), null);
      if (!t?.windowId || (t.datum ?? 0) < grenze) continue;
      if (!(t.istFinale || /MannekenPis|Global|LAN|Escargo/i.test(`${t.windowId} ${t.cupId} ${t.titel}`))) continue;
      raus.push({ eventId: t.eventId, windowId: t.windowId, datum: t.datum, titel: t.titel, region: t.region, season: t.season });
    }
  }
  // Die juengsten zuerst - dort ist die Frist am weitesten weg, aber dort
  // schaut man zuerst hin; die aeltesten kommen in den naechsten Laeufen.
  return raus.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
}

let erledigt = 0;
for (const tag of tage()) {
  if (erledigt >= hoechstens) break;
  let ids = [];
  try { ids = [...await matchIds(tag.eventId, tag.windowId, 3)]; } catch (e) { console.log(`  ${tag.windowId}: ${e.message}`); continue; }
  for (const id of ids) {
    if (erledigt >= hoechstens) break;
    if (index.matches[id]) continue;
    const tmp = path.join(os.tmpdir(), `voll-${id}.replay`);
    try {
      const puffer = await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
      fs.writeFileSync(tmp, puffer);
      const aus = execFileSync('dotnet', [WERKZEUG, tmp], { maxBuffer: 256 * 1024 * 1024, timeout: 10 * 60_000 }).toString('utf8');
      const m = JSON.parse(aus);
      const monat = (m.beginn ?? new Date(tag.datum ?? Date.now()).toISOString()).slice(0, 7);
      const rel = path.join('replay-voll', monat, tag.windowId, `${id}.json`);
      fs.mkdirSync(path.dirname(path.join(DATEN, rel)), { recursive: true });
      fs.writeFileSync(path.join(DATEN, rel), JSON.stringify({ ...m, windowId: tag.windowId, eventId: tag.eventId }));
      const sieger = (m.spieler ?? []).filter((p) => !p.bot && p.team === m.sieger).map((p) => p.name);
      index.matches[id] = {
        datei: rel.replace(/\\/g, '/'), windowId: tag.windowId, eventId: tag.eventId, titel: tag.titel,
        region: tag.region, season: tag.season, beginn: m.beginn, ende: m.ende, sieger,
        spieler: (m.spieler ?? []).filter((p) => !p.bot).length, zonen: (m.zonen ?? []).length,
      };
      fs.mkdirSync(ZIEL, { recursive: true });
      fs.writeFileSync(INDEX, JSON.stringify(index));
      erledigt += 1;
      console.log(`  ${tag.windowId} ${id}: ${(puffer.length / 1e6).toFixed(0)} MB, ${index.matches[id].spieler} Spieler, ${index.matches[id].zonen} Zonen`);
    } catch (e) {
      console.log(`  ${tag.windowId} ${id}: ${String(e.message).slice(0, 160)}`);
    } finally { fs.rmSync(tmp, { force: true }); }
  }
}
console.log(`ausgelesen ${erledigt}, im Verzeichnis ${Object.keys(index.matches).length}`);
