// node --test scripts/test/freundAnnahme.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { anzunehmen, freigabenAus, annahmeDurchgang } from '../../lib/freundAnnahme.mjs';

const A = 'bf9a368f3ff64e16a045b46fca537627';
const B = 'e229c47ae9d74c519e2c005b0ab0fc2d';
const ICH = '8224fc7512ad42818f381e262e4a6a2b';

test('freigabenAus: Objekt oder Liste, Bindestriche und Grossbuchstaben, Unsinn faellt weg', () => {
  assert.deepEqual([...freigabenAus({ ids: [A.toUpperCase(), 'quatsch', null] })], [A]);
  const mitStrich = `${B.slice(0, 8)}-${B.slice(8, 12)}-${B.slice(12, 16)}-${B.slice(16, 20)}-${B.slice(20)}`;
  assert.deepEqual([...freigabenAus([mitStrich])], [B]);
  assert.equal(freigabenAus(undefined).size, 0);
});

test('anzunehmen: nur freigegebene, nie das eigene Konto, keine Doppelten', () => {
  const frei = new Set([A, ICH]);
  const eingehend = [{ accountId: A }, { accountId: A }, { accountId: B }, { accountId: ICH }, { accountId: 'x' }, {}];
  assert.deepEqual(anzunehmen(eingehend, frei, ICH), [A]);
  assert.deepEqual(anzunehmen(null, frei, ICH), []);
});

test('annahmeDurchgang: holt incoming, nimmt nur Freigegebene an, laesst den Rest liegen', async () => {
  const aufrufe = [];
  const holen = async (url, opt = {}) => {
    aufrufe.push(`${opt.method ?? 'GET'} ${url}`);
    if (url.endsWith('/incoming')) return { ok: true, status: 200, json: async () => [{ accountId: A }, { accountId: B }] };
    return { ok: true, status: 204, json: async () => ({}) };
  };
  const r = await annahmeDurchgang({ konto: ICH, token: 'bearer t', freigaben: new Set([A]), holen, basis: 'https://f' });
  assert.deepEqual(r, { angenommen: [A], liegen: 1, fehler: null });
  assert.deepEqual(aufrufe, [`GET https://f/${ICH}/incoming`, `POST https://f/${ICH}/friends/${A}`]);
});

test('annahmeDurchgang: Fehler von Epic wird gemeldet, nichts angenommen', async () => {
  const holen = async () => ({ ok: false, status: 403, json: async () => ({}) });
  const r = await annahmeDurchgang({ konto: ICH, token: 't', freigaben: new Set([A]), holen, basis: 'https://f' });
  assert.equal(r.angenommen.length, 0);
  assert.match(r.fehler, /incoming HTTP 403/);
});
