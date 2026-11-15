// Prueft lib/clutchLiveWahl.mjs (welcher Stand gilt: Live-Stand des Servers oder Release), ohne Netz:  node scripts/clutch-live-test.mjs
// Live mit mehr Matches -> Live; gleich weit / aelter / fehlt / kaputt / live-Marke fehlt / clutch-je passt nicht -> Release.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { jeDatei } from '../lib/jeSpiel.mjs';
import { liesLiveStand, nimmLive, jePasst } from '../lib/clutchLiveWahl.mjs';

const ort = fs.mkdtempSync(path.join(os.tmpdir(), 'clutch-live-test-'));
fs.mkdirSync(path.join(ort, 'clutch'), { recursive: true });
fs.mkdirSync(path.join(ort, 'clutch-je'), { recursive: true });
const W = 'S43_Test_Heat2_EU';
const release = { matches: [{ id: 'a' }, { id: 'b' }], gerechnet: '2026-11-15T18:00:00Z', schaden: { x: { dmg: 1 } } };
const { inhalt, lage } = jeDatei({ x: [['a', 1], ['b', 2], ['c', 3]] });

const schreib = (d, je = inhalt) => {
  fs.writeFileSync(path.join(ort, 'clutch', `${W}.json`), typeof d === 'string' ? d : JSON.stringify(d));
  if (je) fs.writeFileSync(path.join(ort, 'clutch-je', `${W}.json`), je); else fs.rmSync(path.join(ort, 'clutch-je', `${W}.json`), { force: true });
};
// Wie scripts/live-spur.mjs: Release plus Teile, live: true und basis.
const live = (n, extra = {}) => ({ ...release, matches: Array.from({ length: n }, (_, i) => ({ id: `m${i}` })), je: { spalten: ['killsEcht'], lage }, live: true,
  basis: { gerechnet: release.gerechnet, matches: release.matches.length }, ...extra });
const wahl = async () => { const s = await liesLiveStand(W, ort); return s && nimmLive(s.d, release) ? 'live' : 'release'; };
let n = 0;
const fall = async (name, erwartet) => { assert.equal(await wahl(), erwartet, name); n += 1; console.log(`ok  ${name} -> ${erwartet}`); };
// Zeitstempel sicher anders als beim vorigen Fall (der Merker vergleicht Groesse und Aenderungszeit).
const tick = () => new Promise((ok) => setTimeout(ok, 15));

await fall('kein Live-Stand', 'release');
schreib(live(3)); await fall('Live mit mehr Matches (3 > 2)', 'live');
await tick(); schreib(live(2)); await fall('Live gleich weit (2 = 2)', 'release');
await tick(); schreib(live(1)); await fall('Live aelter (1 < 2)', 'release');
await tick(); schreib('{"live":true,"matches":[1,2,3'); await fall('Live kaputt (abgeschnitten)', 'release');
await tick(); schreib(live(3, { live: undefined })); await fall('ohne live-Marke', 'release');
await tick(); schreib(live(3), inhalt.subarray(0, inhalt.length - 5)); await fall('clutch-je passt nicht zu je.lage', 'release');
await tick(); schreib(live(3), null); await fall('clutch-je fehlt', 'release');
await tick(); schreib(live(4)); await fall('wieder gut (4 > 2)', 'live');
assert.equal(nimmLive(live(1), null), true, 'Release fehlt -> Live'); n += 1; console.log('ok  Release fehlt, Live da -> live');
assert.equal(await liesLiveStand('../etc/passwd', ort), null); n += 1; console.log('ok  Fenstername mit Pfad -> abgelehnt');
assert.equal(jePasst({ jeSpiel: {} }, null), true); n += 1; console.log('ok  altes Format ohne je.lage braucht keine clutch-je');
// Live-Stand weg -> Release (live-spur loescht ihn, sobald das Release auf Stand ist).
fs.rmSync(path.join(ort, 'clutch', `${W}.json`)); await fall('Live-Stand geloescht', 'release');
fs.rmSync(ort, { recursive: true, force: true });
console.log(`${n} Faelle ok`);
