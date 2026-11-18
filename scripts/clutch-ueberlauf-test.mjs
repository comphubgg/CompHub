// Probe (15.11.2026) fuer den Ueberlauf der Clutch-Releases (lib/releaseTags.mjs: tagsFuer, schreibTagsFuer, schreibZiel, schreibGrenze).
//   node scripts/clutch-ueberlauf-test.mjs [--alt <alte releaseTags.mjs>]
// 1. Jeder Anhang, der heute im Verzeichnis (manifest.json) von daten-clutch und daten-clutch-roh steht, wird weiter genau dort gefunden und dort ersetzt.
// 2. Ein volles Stamm-Release (980+) schickt neue Dateien ins erste Ueberlauf-Release mit Platz; sind alle voll, gibt es kein Ziel (-> ::error:: im Hochlader).
// 3. Mit --alt: fuer alles ausser clutch/ und clutch-roh/ liefert die neue Regel dieselben Releases wie die alte.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CLUTCH_GRENZE, schreibGrenze, schreibTagsFuer, schreibZiel, tagFuer, tagsFuer } from '../lib/releaseTags.mjs';

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const VOLL = 998;
const grenze = (tag) => Math.min(VOLL, schreibGrenze(tag) ?? VOLL);
const ablageName = (anhang) => anhang.replace(/-eq-/g, '=').replace(/__/g, '/');

async function manifest(tag) {
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' } });
  if (!r.ok) throw new Error(`${tag}/manifest.json: ${r.status}`);
  return r.json();
}

let geprueft = 0;
// 1. Alles, was heute liegt, bleibt, wo es ist.
for (const stamm of ['daten-clutch', 'daten-clutch-roh']) {
  const m = await manifest(stamm);
  const namen = Object.keys(m).filter((a) => a !== 'manifest.json' && !a.endsWith('.neu'));
  assert.ok(namen.length > 100, `${stamm}: Verzeichnis zu klein (${namen.length})`);
  const anzahl = namen.length + 1;
  for (const anhang of namen) {
    const name = ablageName(anhang);
    assert.equal(tagFuer(name), stamm, `${anhang}: tagFuer`);
    assert.equal(tagsFuer(name)[0], stamm, `${anhang}: zuerst gelesen`);
    assert.equal(schreibTagsFuer(name)[0], stamm, `${anhang}: zuerst geschrieben`);
    // Selbst wenn das Stamm-Release voll ist: eine Datei, die dort liegt, wird dort ersetzt.
    for (const n of [anzahl, 999, 1000]) {
      const ziel = await schreibZiel(name, async (tag) => ({ hat: tag === stamm, anzahl: tag === stamm ? n : 0 }), grenze);
      assert.equal(ziel, stamm, `${anhang}: Ziel bei ${n} Anhaengen`);
    }
    geprueft += 1;
  }
  console.log(`  ${stamm}: ${namen.length} Anhaenge des Verzeichnisses -> ${stamm} (gelesen, geschrieben, ersetzt)`);
}

// 2. Simuliert: volles Stamm-Release -> Ueberlauf.
for (const [stamm, name] of [['daten-clutch', 'clutch/S43_FNCSSoloReload_HeatsStage_Heat9_EU.json'], ['daten-clutch-roh', 'clutch-roh/S43_FNCSSoloReload_HeatsStage_Heat9_EU.json']]) {
  const reihe = schreibTagsFuer(name);
  assert.deepEqual(reihe, [stamm, `${stamm}-ueberlauf-1`, `${stamm}-ueberlauf-2`, `${stamm}-ueberlauf-3`, `${stamm}-ueberlauf-4`]);
  assert.deepEqual(tagsFuer(name), reihe, 'Leser sehen dieselbe Reihe, Stamm zuerst, Ueberlauf zuletzt');
  assert.deepEqual(tagsFuer(name.replace(/[^/]+$/, '')), reihe, 'Ordner listet alle');
  const stand = (zahlen) => async (tag) => ({ hat: false, anzahl: zahlen[reihe.indexOf(tag)] ?? 0 });
  assert.equal(await schreibZiel(name, stand([909]), grenze), stamm, 'Platz im Stamm');
  assert.equal(await schreibZiel(name, stand([CLUTCH_GRENZE - 1]), grenze), stamm, 'letzter Platz im Stamm');
  assert.equal(await schreibZiel(name, stand([CLUTCH_GRENZE]), grenze), `${stamm}-ueberlauf-1`, 'Stamm bei der Grenze -> Ueberlauf 1');
  assert.equal(await schreibZiel(name, stand([1000, 980]), grenze), `${stamm}-ueberlauf-2`, 'Ueberlauf 1 voll -> 2');
  assert.equal(await schreibZiel(name, stand([1000, 1000, 1000, 1000, 980]), grenze), null, 'alles voll -> kein Ziel (laut)');
  // Liegt die Datei schon im Ueberlauf, wird sie dort ersetzt - auch wenn im Stamm wieder Platz waere.
  assert.equal(await schreibZiel(name, async (tag) => ({ hat: tag === `${stamm}-ueberlauf-2`, anzahl: tag === stamm ? 10 : 990 }), grenze), `${stamm}-ueberlauf-2`);
  console.log(`  ${stamm}: voll bei ${CLUTCH_GRENZE} -> ${stamm}-ueberlauf-1 ... -4, danach kein Ziel`);
}
assert.equal(schreibGrenze('daten-replayvoll-2026-11-b'), null, 'andere Releases behalten die allgemeine Grenze');
assert.deepEqual(tagsFuer('clutch-je/S43_x.json'), ['daten-clutch-je-s43'], 'clutch-je unveraendert');

// 3. Alles andere unveraendert gegenueber der alten Regel.
const i = process.argv.indexOf('--alt');
if (i > 0) {
  const alt = await import(pathToFileURL(path.resolve(process.argv[i + 1])).href);
  const beispiele = [
    'akten/0123456789abcdef0123456789abcdef.json', 'power-rankings/global.json', 'replays/S42/S42_X_EU/_aggregat.json', 'replays/S43/', 'replays/S41/x.json',
    'tournament-leaderboards/a.json', // epic-spieltage/ und platzierungen/ haben seit dem 18.11.2026 eigenen Ueberlauf - scripts/spieltage-ueberlauf-test.mjs
    'clutch-je/S42_a.json', 'clutch-je/x.json', 'team-verlauf.json', 'scrims/2026-11-03/a.json', 'scrims/index.json', 'replays-schlank/S43/a.json', 'irgendwas.json',
    'replay-voll/2026-09/', 'replay-voll/2026-10/S42_W/abc.json', 'replay-voll/2026-12/S43_W/abc.json', 'replay-voll/index.json',
  ];
  for (let k = 0; k < 3000; k += 1) beispiele.push(`replay-voll/2026-11/S43_W${k % 37}/${k.toString(16).padStart(32, '0')}.json`);
  for (const n of beispiele) {
    assert.deepEqual(tagsFuer(n), alt.tagsFuer(n), `tagsFuer ${n}`);
    assert.deepEqual(schreibTagsFuer(n), alt.schreibTagsFuer(n), `schreibTagsFuer ${n}`);
  }
  console.log(`  ${beispiele.length} andere Namen: dieselben Releases wie vorher`);
}
console.log(`ok - ${geprueft} Anhaenge unveraendert, Ueberlauf simuliert`);
