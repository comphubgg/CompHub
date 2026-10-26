// Den Index der voll ausgelesenen Replays mit dem Release abgleichen.
//
// Der Betreiber (26.10.2026): "Die Replays muessen immer funktionieren." Gefunden: das Release daten-replayvoll-2026-10 hatte am 20.10. die tausend Anhaenge
// erreicht (999), danach kam keine Auswertung mehr hinein - im Index (replay-voll/index.json) standen sie aber als fertig. 2181 von 4135 Eintraegen hatten
// keine Datei am Release, und weil der Index sie als "fertig" fuehrte, hat sie nie jemand neu gelesen.
//
// Dieses Skript wirft aus dem Index, wofuer es weder am Release noch auf der Platte eine Datei gibt:
//   - juenger als 29 Tage und kein Massen-Qualifier: der Match ist wieder offen und wird im naechsten Durchgang erneut ausgelesen (Epic haelt 31 Tage)
//   - sonst (zu alt, oder ein Qualifier mit tausenden Lobbys, den der Leser gar nicht mehr liest): der Eintrag verschwindet, damit nichts auf eine Datei zeigt,
//     die es nicht gibt
// Bei jedem Fehler beim Lesen der Verzeichnisse bleibt der Index unveraendert.
//
//   node scripts/replay-voll-abgleich.mjs [--probe]

import fs from 'node:fs';
import path from 'node:path';
import { tagsFuer } from '../lib/releaseTags.mjs';

const probe = process.argv.includes('--probe');
const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const DATEN = path.join(process.cwd(), 'data');
const INDEX = path.join(DATEN, 'replay-voll', 'index.json');
const anhangName = (name) => name.replace(/\//g, '__').replace(/=/g, '-eq-');
const MASSEN = /LastChanceQualifier|FNCSSoloQualifiers_/i;

if (!fs.existsSync(INDEX)) { console.log('Abgleich: kein Index auf der Platte.'); process.exit(0); }
const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
const matches = index.matches ?? {};

const manifeste = new Map();
async function manifestVon(tag) {
  if (manifeste.has(tag)) return manifeste.get(tag);
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' }, signal: AbortSignal.timeout(120_000) });
  // Ein Release, das es (noch) nicht gibt, hat keine Dateien - jeder andere Fehler bricht den Abgleich ab.
  const m = r.status === 404 ? {} : r.ok ? await r.json() : (() => { throw new Error(`${tag}: HTTP ${r.status}`); })();
  manifeste.set(tag, m);
  return m;
}

const heute = Date.now();
let offen = 0; let verworfen = 0; let ganz = 0;
const entfernen = [];
try {
  for (const [id, x] of Object.entries(matches)) {
    const datei = x.datei;
    if (!datei) continue;
    if (fs.existsSync(path.join(DATEN, datei))) { ganz += 1; continue; }
    const anhang = anhangName(datei);
    let da = false;
    for (const tag of tagsFuer(datei)) { if ((await manifestVon(tag))[anhang]) { da = true; break; } }
    if (da) { ganz += 1; continue; }
    const alter = heute - (Date.parse(x.beginn ?? '') || 0);
    if (!MASSEN.test(x.windowId ?? '') && alter < 29 * 864e5) offen += 1; else verworfen += 1;
    entfernen.push(id);
  }
} catch (e) {
  console.log(`Abgleich abgebrochen (${e.message}) - der Index bleibt, wie er ist.`);
  process.exit(0);
}

console.log(`Abgleich: ${ganz} Eintraege mit Datei, ${offen} wieder offen (werden neu gelesen), ${verworfen} verworfen (zu alt oder Massen-Qualifier)${probe ? ' - nur eine Probe' : ''}.`);
if (!probe && entfernen.length) {
  for (const id of entfernen) { delete matches[id]; delete (index.fehler ?? {})[id]; }
  fs.writeFileSync(INDEX, JSON.stringify(index));
}
