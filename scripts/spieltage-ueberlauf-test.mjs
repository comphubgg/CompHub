// Probe (18.11.2026) fuer den Ueberlauf der Spieltag- und Platzierungs-Releases (lib/releaseTags.mjs: geteiltUeberlauf, GETEILT_GRENZE).
//   node scripts/spieltage-ueberlauf-test.mjs [--alt <alte releaseTags.mjs>]
// 1. Jeder Anhang, der heute im Verzeichnis eines Spieltag-/Platzierungs-Releases steht, wird weiter im selben Release gefunden wie mit der alten Regel
//    (mit --alt), steht in seiner Schreib-Reihe an erster Stelle oder liegt im alten Release (Umzug), und wird dort ersetzt - auch bei 1000 Anhaengen.
// 2. Ein Release bei GETEILT_GRENZE schickt neue Dateien in sein erstes Ueberlauf-Release mit Platz; sind alle voll, gibt es kein Ziel (-> ::error::).
// 3. Mit --alt: alles ausser epic-spieltage/ und platzierungen/ liefert dieselben Releases wie vorher; der erste Lese- und Schreib-Tag bleibt fuer alle gleich.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GETEILT_GRENZE, geteiltUeberlauf, schreibGrenze, schreibTagsFuer, schreibZiel, tagFuer, tagsFuer } from '../lib/releaseTags.mjs';

const REPO = process.env.COMPHUB_GITHUB_REPO || 'comphubgg/CompHub';
const VOLL = 998;
const grenze = (tag) => Math.min(VOLL, schreibGrenze(tag) ?? VOLL);
const ablageName = (anhang) => anhang.replace(/-eq-/g, '=').replace(/__/g, '/');
const i = process.argv.indexOf('--alt');
const alt = i > 0 ? await import(pathToFileURL(path.resolve(process.argv[i + 1])).href) : null;

const manifeste = new Map();
async function manifest(tag) {
  if (manifeste.has(tag)) return manifeste.get(tag);
  const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', headers: { 'User-Agent': 'comphub-ablage' } });
  if (r.status === 404) { manifeste.set(tag, {}); return {}; }
  if (!r.ok) throw new Error(`${tag}/manifest.json: ${r.status}`);
  const m = await r.json();
  manifeste.set(tag, m);
  return m;
}
const erstesMit = async (tags, anhang) => { for (const t of tags) if ((await manifest(t))[anhang]) return t; return null; };

const STAEMME = ['daten-spieltage', 'daten-spieltage-s42', 'daten-spieltage-s43', 'daten-platzierungen', 'daten-platzierungen-s42', 'daten-platzierungen-s43'];
let geprueft = 0;
for (const stamm of STAEMME) {
  const m = await manifest(stamm);
  const namen = Object.keys(m).filter((a) => a !== 'manifest.json' && !a.endsWith('.neu') && /^(epic-spieltage|platzierungen)__/.test(a));
  assert.ok(namen.length > 5, `${stamm}: Verzeichnis zu klein (${namen.length})`);
  let umzug = 0;
  for (const anhang of namen) {
    const name = ablageName(anhang);
    const lesen = tagsFuer(name);
    assert.ok(lesen.includes(stamm), `${anhang}: ${stamm} nicht in der Lesereihe ${lesen}`);
    // Der Leser kommt zum selben Release wie vorher.
    if (alt) assert.equal(await erstesMit(lesen, anhang), await erstesMit(alt.tagsFuer(name), anhang), `${anhang}: anderes Release beim Lesen`);
    assert.equal(tagFuer(name), alt ? alt.tagFuer(name) : tagFuer(name), `${anhang}: tagFuer`);
    const reihe = schreibTagsFuer(name);
    assert.deepEqual(reihe, [lesen[0], ...geteiltUeberlauf(lesen[0])], `${anhang}: Schreib-Reihe`);
    if (reihe[0] === stamm) {
      // Liegt sie im Stamm, wird sie dort ersetzt - auch wenn er voll ist.
      for (const n of [namen.length + 1, 999, 1000]) {
        assert.equal(await schreibZiel(name, async (tag) => ({ hat: tag === stamm, anzahl: tag === stamm ? n : 0 }), grenze), stamm, `${anhang}: Ziel bei ${n}`);
      }
    } else {
      // Eine S42-Datei von vor dem Umzug im alten Release: sie wird nie dorthin geschrieben, eine neue Fassung geht ins Saison-Release (oder seinen Ueberlauf)
      // und wird dort vor der alten Kopie gelesen.
      assert.ok(/^daten-(spieltage|platzierungen)$/.test(stamm), `${anhang}: liegt in ${stamm}, schreibt nach ${reihe[0]}`);
      assert.ok(lesen.indexOf(stamm) > lesen.indexOf(reihe.at(-1)), `${anhang}: alte Kopie vor dem Ueberlauf gelesen`);
      umzug += 1;
    }
    geprueft += 1;
  }
  console.log(`  ${stamm}: ${namen.length} Anhaenge (${umzug} von vor dem Umzug) - gelesen wie vorher, dort ersetzt`);
}

// 2. Simuliert: voll -> Ueberlauf.
for (const [stamm, name] of [
  ['daten-spieltage', 'epic-spieltage/S36/S36_PerformanceEvaluation_Event1Round1_EU.json'],
  ['daten-spieltage', 'epic-spieltage/_gesucht.json'],
  ['daten-spieltage-s42', 'epic-spieltage/S42/S42_Neu_EU.json'],
  ['daten-spieltage-s43', 'epic-spieltage/S43/S43_FNCSSoloReload_HeatsStage_Heat9_EU.json'],
  ['daten-platzierungen', 'platzierungen/S40/S40_X_EU.json'],
  ['daten-platzierungen-s43', 'platzierungen/S43/S43_X_EU.json'],
]) {
  const reihe = schreibTagsFuer(name);
  assert.deepEqual(reihe, [stamm, `${stamm}-ueberlauf-1`, `${stamm}-ueberlauf-2`, `${stamm}-ueberlauf-3`], `${name}: Reihe`);
  const lesen = tagsFuer(name);
  assert.deepEqual(lesen.slice(0, 4), reihe, `${name}: Leser sehen Stamm, dann Ueberlauf`);
  for (const t of reihe) assert.ok(tagsFuer(name.replace(/[^/]+$/, '')).includes(t), `${name}: Ordner listet ${t}`);
  for (const t of reihe) assert.ok(tagsFuer(name.replace(/^([^/]+\/).*$/, '$1')).includes(t), `${name}: Ordner ohne Saison listet ${t}`);
  const stand = (zahlen) => async (tag) => ({ hat: false, anzahl: zahlen[reihe.indexOf(tag)] ?? 0 });
  assert.equal(await schreibZiel(name, stand([500]), grenze), stamm);
  assert.equal(await schreibZiel(name, stand([GETEILT_GRENZE - 1]), grenze), stamm);
  assert.equal(await schreibZiel(name, stand([GETEILT_GRENZE]), grenze), `${stamm}-ueberlauf-1`);
  assert.equal(await schreibZiel(name, stand([1000]), grenze), `${stamm}-ueberlauf-1`, 'heute: daten-spieltage bei 1000');
  assert.equal(await schreibZiel(name, stand([1000, 950, 3]), grenze), `${stamm}-ueberlauf-2`);
  assert.equal(await schreibZiel(name, stand([1000, 1000, 1000, 950]), grenze), null, 'alles voll -> kein Ziel (laut)');
  assert.equal(await schreibZiel(name, async (tag) => ({ hat: tag === `${stamm}-ueberlauf-1`, anzahl: tag === stamm ? 10 : 990 }), grenze), `${stamm}-ueberlauf-1`, 'ersetzt, wo sie liegt');
}
// Eine S42-Datei: Saison-Release und sein Ueberlauf vor dem alten.
assert.deepEqual(tagsFuer('epic-spieltage/S42/a.json'), ['daten-spieltage-s42', 'daten-spieltage-s42-ueberlauf-1', 'daten-spieltage-s42-ueberlauf-2', 'daten-spieltage-s42-ueberlauf-3', 'daten-spieltage']);
assert.equal(schreibGrenze('daten-spieltage-alt'), null);
assert.equal(schreibGrenze('daten-replays-s42'), null);
assert.deepEqual(tagsFuer('power-rankings/global.json'), ['daten-rangliste', 'daten-spieltage']);
console.log(`  Ueberlauf simuliert: voll bei ${GETEILT_GRENZE} -> -ueberlauf-1 ... -3, danach kein Ziel`);

// 3. Alles andere unveraendert.
if (alt) {
  const beispiele = [
    'akten/0123456789abcdef0123456789abcdef.json', 'power-rankings/global.json', 'spieler-kreis/_wichtig.json', 'replays/S42/S42_X_EU/_aggregat.json', 'replays/S43/',
    'replays/S41/x.json', 'replays/', 'replays/_index.json', 'tournament-leaderboards/a.json', 'clutch/a.json', 'clutch-roh/', 'clutch-je/S42_a.json',
    'team-verlauf.json', 'scrims/2026-11-03/a.json', 'replays-schlank/S43/a.json', 'irgendwas.json', 'replay-voll/2026-11/S43_W/abc.json', 'antworten/x.json',
  ];
  for (const n of beispiele) {
    assert.deepEqual(tagsFuer(n), alt.tagsFuer(n), `tagsFuer ${n}`);
    assert.deepEqual(schreibTagsFuer(n), alt.schreibTagsFuer(n), `schreibTagsFuer ${n}`);
  }
  for (const n of ['epic-spieltage/', 'epic-spieltage/S42/', 'epic-spieltage/S41/', 'platzierungen/', 'epic-spieltage/S43/x.json', 'epic-spieltage/LAN/x.json']) {
    assert.equal(tagsFuer(n)[0], alt.tagsFuer(n)[0], `erster Tag ${n}`);
    for (const t of alt.tagsFuer(n)) assert.ok(tagsFuer(n).includes(t), `${n}: ${t} fehlt`);
  }
  console.log(`  ${beispiele.length} andere Namen: dieselben Releases wie vorher; Spieltage/Platzierungen: alte Releases alle noch in der Lesereihe`);
}
console.log(`ok - ${geprueft} Anhaenge unveraendert, Ueberlauf simuliert`);
