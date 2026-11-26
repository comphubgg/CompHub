// node --test scripts/test/dropFormen.test.mjs
// Die Formen der Drop-Karte (lib/dropFormen) und das Verteilen der Namen (lib/prognoseKarte) - Faelle vom 26.11.2026 (Performance Evaluation EU).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rechtecke, entzerre, mindestGroesse, ecken } from '../../lib/dropFormen.ts';
import { verteilteBeschriftungen } from '../../lib/prognoseKarte.ts';

const breite = (f) => f.kasten.x1 - f.kasten.x0;
const hoehe = (f) => f.kasten.y1 - f.kasten.y0;
const noble = (k) => ({ p: { x: (k.x0 + k.x1) / 2, y: (k.y0 + k.y1) / 2 }, ort: k, form: { kasten: { ...k }, ecke: null } });
const trio = (a) => [[`${a}1`, `${a}2`, `${a}3`]];

test('Prognose-Stelle in einer Noble-Stelle: eine Form, egal in welcher Reihenfolge (ADRIIBOOT in QUIX)', () => {
  const quix = { x0: 52.5, y0: 60.25, x1: 66.5, y1: 71.75 };
  const adrii = [{ p: { x: 60.2, y: 63.4 } }];
  for (const gruppen of [[adrii, [noble(quix)]], [[noble(quix)], adrii]]) {
    const r = rechtecke(gruppen, [], 1.26, [trio('A'), trio('Q')]);
    assert.equal(r.length, 1);
    assert.deepEqual(r[0].gruppen.sort(), [0, 1]);
    assert.deepEqual(r[0].form.kasten, quix);
  }
});

test('Zwei Noble-Stellen mit sich ueberschneidenden Kaesten bleiben getrennt, auch mit einem Prognose-Team darauf', () => {
  const a = { x0: 40.5, y0: 72, x1: 59.75, y1: 82 };
  const b = { x0: 54.5, y0: 71.75, x1: 63.75, y1: 83.75 };
  const r = rechtecke([[noble(a)], [noble(b), { p: { x: 57.5, y: 77.8 } }]], [], 1.26, [trio('A'), [...trio('B'), ...trio('C')]]);
  assert.equal(r.length, 2);
});

test('Eine kleine Stelle zwischen grossen Nachbarn behaelt ihre Mindestgroesse', () => {
  const mins = [mindestGroesse([trio('ADRIIBOOT')]), mindestGroesse([trio('X')]), mindestGroesse([trio('Y')])];
  const klein = { kasten: { x0: 59, y0: 62.25, x1: 61.5, y1: 64.75 }, ecke: null };
  const links = { kasten: { x0: 52.5, y0: 60.25, x1: 61, y1: 72 }, ecke: null };
  const oben = { kasten: { x0: 52.25, y0: 53, x1: 62.5, y1: 63 }, ecke: null };
  // die Mindestgroesse wie in rechtecke
  const fs = [klein, links, oben];
  fs.forEach((f, i) => {
    const k = f.kasten;
    if (k.x1 - k.x0 < mins[i].b) { const m = (k.x0 + k.x1) / 2; k.x0 = m - mins[i].b / 2; k.x1 = m + mins[i].b / 2; }
    if (k.y1 - k.y0 < mins[i].h) { const m = (k.y0 + k.y1) / 2; k.y0 = m - mins[i].h / 2; k.y1 = m + mins[i].h / 2; }
  });
  entzerre(fs, mins);
  assert.ok(breite(klein) >= mins[0].b - 1e-9, `Breite ${breite(klein)} < ${mins[0].b}`);
  assert.ok(hoehe(klein) >= mins[0].h - 1e-9, `Hoehe ${hoehe(klein)} < ${mins[0].h}`);
  // und nichts ueberlappt mehr
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
    const a = fs[i].kasten, b = fs[j].kasten;
    assert.ok(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) <= 1e-9 || Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) <= 1e-9);
  }
});

test('mindestGroesse: nie unter 2,5, nie ueber 6', () => {
  assert.deepEqual(mindestGroesse([]), { b: 2.5, h: 2.5 });
  const g = mindestGroesse([[['EINSEHRSEHRLANGERNAME', 'B', 'C']], [['D', 'E', 'F']], [['G', 'H', 'I']], [['J']], [['K']], [['L']]]);
  assert.ok(g.b <= 6 && g.h <= 6);
});

const besch = (id, k, zeilen, breiteJe = 6) => {
  const p = ecken(k);
  return { id, oben: k.y0, hoehe: k.y1 - k.y0, breite: k.x1 - k.x0, ax: (k.x0 + k.x1) / 2, ay: (k.y0 + k.y1) / 2, punkte: p, verteilt: false,
    zeilen: Array.from({ length: zeilen }, () => ({ x: (k.x0 + k.x1) / 2, breite: breiteJe })) };
};

test('Verteilen: hohes Rechteck mit drei Teams ja, niedriges nein, ein Team nein', () => {
  const hoch = besch('hoch', { x0: 10, y0: 10, x1: 30, y1: 24 }, 3);
  const niedrig = besch('niedrig', { x0: 50, y0: 10, x1: 70, y1: 14 }, 3);
  const allein = besch('allein', { x0: 10, y0: 60, x1: 30, y1: 74 }, 3);
  const v = verteilteBeschriftungen([hoch, niedrig, allein], 1.2, 1.3, (b) => b.id !== 'allein');
  assert.deepEqual([...v], ['hoch']);
});

test('Verteilen: nicht, wenn die Namen oben oder unten an die einer Nachbarstelle stiessen', () => {
  const gross = besch('gross', { x0: 10, y0: 10, x1: 30, y1: 24 }, 3);
  const drunter = besch('drunter', { x0: 10, y0: 24, x1: 30, y1: 27 }, 1);
  assert.equal(verteilteBeschriftungen([gross, drunter], 1.2, 1.3, () => true).size, 0);
  const weit = besch('weit', { x0: 60, y0: 60, x1: 70, y1: 64 }, 1);
  assert.equal(verteilteBeschriftungen([gross, weit], 1.2, 1.3, () => true).size, 1);
});
