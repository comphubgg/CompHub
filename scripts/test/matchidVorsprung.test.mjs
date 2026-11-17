// node --test scripts/test/matchidVorsprung.test.mjs
// Werte aus der echten Bestenliste des EU LCQ Final, Game 1 (17.11.2026, Stand 18:24:12 UTC: nur ein Spieler gelistet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchZeiten } from '../matchid-vorsprung.mjs';

test('EU LCQ Final Game 1: Bus 18:10:45, erster gelisteter Tod 18:22:10 auf Platz 37', () => {
  const daten = { entries: [{ matches: [{ sessionId: '1190e145ad8746c681ebbb8fe3471e7b', endTime: '2026-11-17T18:22:10.510Z', timeAlive: 685, placement: 37 }] }] };
  const [z] = matchZeiten(daten);
  assert.equal(new Date(z.bus).toISOString(), '2026-11-17T18:10:45.510Z');
  assert.equal(new Date(z.ersterTod).toISOString(), '2026-11-17T18:22:10.510Z');
  assert.equal(z.ersterTodPlatz, 37);
});

test('mehrere Spieler: Bus als Median, erster Tod als fruehestes Ende, Matches nach Bus sortiert', () => {
  const m = (id, ende, alive, platz) => ({ sessionId: id, endTime: ende, timeAlive: alive, placement: platz });
  const daten = { entries: [
    { matches: [m('b', '2026-11-17T16:00:44Z', 116, 37), m('a', '2026-11-17T15:29:15Z', 1104, 2)] },
    { matches: [m('a', '2026-11-17T15:14:11Z', 200, 38)] },
    { matches: [m('a', '2026-11-17T15:20:00Z', 540, 20), { sessionId: 'c' }] },
  ] };
  const z = matchZeiten(daten);
  assert.deepEqual(z.map((x) => x.matchId), ['a', 'b']);
  assert.equal(z[0].spieler, 3);
  assert.equal(new Date(z[0].ersterTod).toISOString(), '2026-11-17T15:14:11.000Z');
  assert.equal(z[0].ersterTodPlatz, 38);
  assert.equal(new Date(z[0].bus).toISOString(), '2026-11-17T15:10:51.000Z');
});
