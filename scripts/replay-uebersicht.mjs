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
import { ERSTE_GETEILTE_SAISON, LETZTE_SAISON } from '../lib/releaseTags.mjs';

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

/*
 * --vom-release (28.10.2026): die Zustaende aller Spieltage erst von den Releases holen (oeffentliche Adressen, kein Kontingent). Die Uebersicht schrieb nur der
 * stuendliche Lauf, und der hing - die Startseite zeigte tagelang dieselben "361.459 ausgewertet / 8.473 offen". Jetzt rechnet sie die Replay-Schleife
 * selbst, aus dem Stand aller Rechner.
 */
async function vomRelease() {
  const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
  const neueste = new Map();
  // Nur Saisons bis zur laufenden (bis zu zwei weiter, falls eine neue beginnt) - die Releases kuenftiger gibt es noch nicht.
  const bis = Math.min(LETZTE_SAISON, ERSTE_GETEILTE_SAISON + 3);
  for (let n = ERSTE_GETEILTE_SAISON; n <= bis; n += 1) {
    for (const tag of ['', '-b', '-c', '-d'].map((x) => `daten-replays-s${n}${x}`)) {
      const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' } }).catch(() => null);
      if (!r?.ok) continue;
      for (const [name, e] of Object.entries(await r.json())) {
        const m = /^replays__(S\d+)__(.+)___zustand\.json$/.exec(name);
        if (!m) continue;
        const zeit = Date.parse(e.zeit ?? '') || 0;
        if ((neueste.get(name)?.zeit ?? -1) < zeit) neueste.set(name, { tag, zeit, saison: m[1], fenster: m[2] });
      }
    }
  }
  const liste = [...neueste.entries()];
  let i = 0; let geholt = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < liste.length) {
      const [name, e] = liste[i++];
      try {
        const r = await fetch(`https://github.com/${REPO}/releases/download/${e.tag}/${encodeURIComponent(name)}`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' } });
        if (!r.ok) continue;
        const ordner = path.join(ABLAGE, e.saison, e.fenster);
        await fs.mkdir(ordner, { recursive: true });
        await fs.writeFile(path.join(ordner, '_zustand.json'), Buffer.from(await r.arrayBuffer()));
        geholt += 1;
      } catch { /* dieser eine fehlt in der Uebersicht */ }
    }
  }));
  console.log(`Vom Release: ${geholt} von ${liste.length} Zustaenden geholt.`);
}

async function main() {
  if (process.argv.includes('--vom-release')) await vomRelease();
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
