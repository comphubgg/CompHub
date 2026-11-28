// node --test scripts/test/vipFormular.test.mjs
// Die echten Anfragen aus #access-requests (Screenshots des Betreibers, 28.11.2026): drei Unsinns-Anfragen und die gute von Lyr7k.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pruefeAnfrage, xHandle, kanaeleAus, gemansche, aehnlich, BEISPIEL } from '../../lib/vipFormular.mjs';

const codes = (f) => pruefeAnfrage(f).hinweise.map((h) => h.code);

const LYR7K = {
  name: 'Lyr7k',
  x: 'https://x.com/lyr7k',
  kanaele: 'https://www.twitch.tv/lyr7k\nhttps://www.tiktok.com/@lyr7k.fnr',
  grund: 'gib her Goty osman weil Trio gooners muss dir noch vid schicken ist gute und schau mehr IGLs an bei vid also auch drauf achten wieso und so LG,GL',
  folgt: true,
};

test('Lyr7k (gut ausgefuellt, deutsch und umgangssprachlich): kein Hinweis, Links erkannt', () => {
  const p = pruefeAnfrage(LYR7K);
  assert.deepEqual(p.hinweise, []);
  assert.equal(p.x, 'lyr7k');
  assert.deepEqual(p.kanaele.map((k) => k.link), ['https://www.twitch.tv/lyr7k', 'https://www.tiktok.com/@lyr7k.fnr']);
});

test('BENZHA.: dasselbe in jedem Feld', () => {
  const c = codes({ name: 'BENZHA.', x: 'BENZHA.', kanaele: 'BENZHA.', grund: 'BENZHA.', folgt: true });
  assert.ok(c.includes('gleich'), c.join());
  assert.ok(c.includes('kanal-unklar'), c.join());
  // Ein Punkt gehoert nicht in einen X-Namen.
  assert.ok(c.includes('x-format'), c.join());
  // Name gleich X-Handle ist dagegen normal und kein Hinweis.
  assert.deepEqual(codes({ ...LYR7K, name: 'lyr7k', x: '@lyr7k' }), []);
});

test('Reteteas: "reteteas" ohne Plattform, Grund "ganes"', () => {
  const c = codes({ name: 'Reteteas', x: '', kanaele: 'reteteas', grund: 'ganes', folgt: true });
  assert.ok(c.includes('kurz'), c.join());
  assert.ok(c.includes('x-leer'), c.join());
  assert.ok(c.includes('kanal-unklar'), c.join());
});

test('Juanito-Test: "Sjsjj" / "Jejej" ist Tastatur-Gemansche', () => {
  const c = codes({ name: 'Juanito', x: 'Sjsjj', kanaele: '', grund: 'Jejej', folgt: true });
  assert.ok(c.includes('gemansche'), c.join());
  assert.ok(gemansche('Sjsjj'));
  assert.ok(gemansche('Jejej'));
  assert.ok(gemansche('asdfghjkl asdf'));
  assert.ok(gemansche('qwertzuiop'));
  assert.ok(gemansche('test test test test'));
  assert.ok(!gemansche(LYR7K.grund));
  assert.ok(!gemansche('I run a small Fortnite channel and would love the overlays for scrims.'));
});

test('Beispiel abgeschrieben - auch mit anderer Schreibung', () => {
  assert.ok(codes({ ...LYR7K, grund: BEISPIEL }).includes('beispiel'));
  assert.ok(codes({ ...LYR7K, grund: 'i stream fortnite comp 4x a week and want the live overlays and stats for my viewers' }).includes('beispiel'));
  assert.ok(codes({ ...LYR7K, grund: 'I stream Fortnite comp 3x a week & want the live overlays + stats for my viewers!!' }).includes('beispiel'));
  assert.ok(aehnlich(LYR7K.grund, BEISPIEL) < 0.5);
  // Ein eigener Satz, der nur das Thema teilt, ist kein Abschreiben.
  assert.ok(!codes({ ...LYR7K, grund: 'I am a duo player from EU and want the match finder to scout opponents before cash cups.' }).includes('beispiel'));
});

test('X-Handle: Formen und Fehler', () => {
  assert.equal(xHandle('@Lyr7k').handle, 'Lyr7k');
  assert.equal(xHandle('lyr7k').handle, 'lyr7k');
  assert.equal(xHandle('https://twitter.com/Some_Name?s=21').handle, 'Some_Name');
  assert.equal(xHandle('x.com/@abc_12').handle, 'abc_12');
  assert.equal(xHandle('https://mobile.twitter.com/abc/status/1').handle, 'abc');
  assert.equal(xHandle('my name').handle, 'my');
  assert.equal(xHandle('').fehler, 'leer');
  assert.equal(xHandle('name-with-dash').fehler, 'format');
  assert.equal(xHandle('waytoolongusername123').fehler, 'format');
  assert.equal(xHandle('x.com/home').fehler, 'format');
  assert.equal(xHandle('@CompHub_gg').fehler, 'unseres');
  assert.equal(xHandle('twitch.tv/lyr7k').fehler, 'andere-plattform');
  assert.ok(codes({ ...LYR7K, x: 'ich.bin.da' }).includes('x-format'));
});

test('Weitere Kanaele: Links, "Twitch: name", Unklares', () => {
  const k = kanaeleAus('Twitch: lyr7k\nyoutube @MyChannel\ntiktok.com/@a.b\nhttps://kick.com/abc\nhttps://example.org/me\nnur text');
  assert.deepEqual(k.map((x) => x.plattform), ['Twitch', 'YouTube', 'TikTok', 'Kick', 'Link', null]);
  assert.equal(k[1].link, 'https://www.youtube.com/@MyChannel');
  assert.deepEqual(kanaeleAus(''), []);
});

test('Nicht gefolgt und leerer Grund', () => {
  const c = codes({ ...LYR7K, folgt: false, grund: '' });
  assert.ok(c.includes('folgt-nicht'));
  assert.ok(c.includes('grund-leer'));
});
