/*
 * Die Replay-Uebersicht fuer /admin/replays ablegen - ohne den Server.
 *
 * Die Seite liest auf dem Host eine fertige Antwort ("replays|uebersicht").
 * Die schrieb bisher nur das Vorrechnen im stuendlichen Lauf, und das
 * scheiterte tagelang (der alte Server hielt den Port). Die Uebersicht blieb
 * auf einem Zwischenstand vom 26.9.2026 stehen: "24.000 offen", waehrend die
 * Ablage dieselben Spieltage laengst vollstaendig ausgewertet fuehrte. Der
 * Betreiber: "es sind immer noch 24.000 fast offen".
 *
 * Deshalb hier dieselbe Liste wie in app/api/replays (alleFenster), direkt
 * aus den Zustaenden im Datenordner, als Antwortdatei unter data/antworten -
 * der Schritt "Zwischenstand ans GitHub-Release" nimmt sie mit.
 *
 * Aufruf:  node scripts/replay-uebersicht.mjs
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ABLAGE, liesZustand, zustandAusOrdner } from '../lib/replayKern.mjs';

/** Wie app/api/replays: "S42_SoloVictoryCup_Event1Round2_EU" -> "Event 1 Round 2". */
function rundeName(windowId, region) {
  let rest = windowId.replace(/^S\d+_/i, '');
  if (region) rest = rest.replace(new RegExp(`_${region}$`, 'i'), '');
  const teile = rest.split('_').slice(1);
  if (!teile.length) return '';
  return teile.join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const fenster = [];
  let saisons = [];
  try { saisons = await fs.readdir(ABLAGE); } catch { /* nichts da */ }
  for (const season of saisons) {
    let liste = [];
    try { liste = await fs.readdir(path.join(ABLAGE, season)); } catch { continue; }
    for (const windowId of liste) {
      let z = await liesZustand(season, windowId);
      if (!Object.keys(z.matches ?? {}).length) z = await zustandAusOrdner(season, windowId) ?? z;
      if (!z?.windowId && !Object.keys(z?.matches ?? {}).length) continue;
      const zaehler = {};
      for (const m of Object.values(z.matches ?? {})) zaehler[m.stand] = (zaehler[m.stand] ?? 0) + 1;
      fenster.push({
        ...z, matches: {}, zaehler,
        gesamt: Object.keys(z.matches ?? {}).length,
        runde: rundeName(z.windowId ?? windowId, z.region),
      });
    }
  }
  if (!fenster.length) { console.log('Keine Replay-Zustaende im Datenordner - nichts abgelegt.'); return; }
  fenster.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));

  // Der Datenordner ist der, in dem die Replays liegen.
  const ziel = path.join(path.dirname(ABLAGE), 'antworten', 'replays_uebersicht.json');
  await fs.mkdir(path.dirname(ziel), { recursive: true });
  await fs.writeFile(ziel, JSON.stringify({ zeit: Date.now(), wert: { success: true, fenster } }, null, 1));
  const summe = {};
  for (const f of fenster) for (const [k, n] of Object.entries(f.zaehler)) summe[k] = (summe[k] ?? 0) + n;
  console.log(`${fenster.length} Spieltage abgelegt: ${JSON.stringify(summe)}`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
