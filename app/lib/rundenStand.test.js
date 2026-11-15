const test = require('node:test');
const assert = require('node:assert/strict');
const { rundenMischen, teamsVereinigen, istIdName } = require('./rundenStand.ts');

/* Eine Lobby mit 39 Teams; ausgeschieden sind die Plaetze von `bis` bis 39. Konto 142a7f94... heisst "dxnx 19!" (oder steht als Id da). */
const DXNX = '142a7f94c0de4b0e9a1b2c3d4e5f6a7b';
function antwort(bis, { dxnxName = 'dxnx 19!', ende = `2026-11-15T19:${String(60 - bis).padStart(2, '0')}:00.000Z`, live = true } = {}) {
  const teams = [];
  for (let p = 39; p >= bis; p--) {
    const id = p === 37 ? DXNX : `konto${p}`;
    teams.push({ platz: p, tagesPlatz: 100 + p, teamId: `t${p}`, spieler: [{ id, name: p === 37 ? dxnxName : `Spieler ${p}` }] });
  }
  return [{ id: 'sitzung1', ende, live, lobby: 39, verbleibend: bis - 1, gesehen: teams.length, fehlend: 0, teams, sieger: [] },
    { id: 'alt', ende: '2026-11-15T18:00:00.000Z', live: false, lobby: 39, verbleibend: 0, teams: [], sieger: [] }];
}

test('abwechselnd neuere und aeltere Antworten: der Stand bleibt beim neuesten', () => {
  // Neu (bis Platz 31 ausgeschieden), alt (bis 36, Name nicht aufgeloest), neuer (bis 30), wieder alt (bis 36), alt aus dem CDN (bis 35).
  const folge = [antwort(31), antwort(36, { dxnxName: '142a7f94' }), antwort(30), antwort(36, { dxnxName: '142a7f94' }), antwort(35)];
  let stand = null;
  const verlauf = [];
  for (const a of folge) {
    stand = rundenMischen(stand, a);
    const r = stand.find((x) => x.id === 'sitzung1');
    verlauf.push(r.verbleibend);
    // Ueberschrift und Zeilen aus demselben Stand: verbleibend = niedrigster gelisteter Platz - 1.
    const niedrigster = Math.min(...r.teams.map((t) => t.platz));
    assert.equal(r.verbleibend, niedrigster - 1);
    assert.equal(r.gesehen, r.teams.length);
    assert.equal(r.fehlend, 0);
    // Ein bekannter Name wird nie durch die Id ersetzt.
    assert.equal(r.teams.find((t) => t.spieler[0].id === DXNX).spieler[0].name, 'dxnx 19!');
  }
  assert.deepEqual(verlauf, [30, 30, 29, 29, 29]);
});

test('eine aeltere Antwort ohne die neueste Runde laesst sie nicht verschwinden', () => {
  let stand = rundenMischen(null, antwort(31));
  stand = rundenMischen(stand, antwort(36).filter((x) => x.id !== 'sitzung1'));
  assert.ok(stand.some((x) => x.id === 'sitzung1'));
  assert.equal(stand[0].id, 'sitzung1');
});

test('Rundenende: Platz 1 beendet die Runde, auch wenn die Antwort noch live sagt', () => {
  let stand = rundenMischen(null, antwort(2));
  stand = rundenMischen(stand, antwort(1, { live: false }));
  stand = rundenMischen(stand, antwort(5)); // alte CDN-Kopie, noch live
  const r = stand.find((x) => x.id === 'sitzung1');
  assert.equal(r.live, false);
  assert.equal(r.verbleibend, 0);
  assert.deepEqual(r.sieger, ['Spieler 1']);
});

test('ein Team ohne Platz ueberschreibt keinen bekannten Platz', () => {
  const alt = [{ platz: 12, spieler: [{ id: 'A', name: 'a' }] }];
  const neu = [{ platz: null, spieler: [{ id: 'a', name: 'a' }] }];
  assert.equal(teamsVereinigen(alt, neu)[0].platz, 12);
});

test('Id-Namen werden erkannt', () => {
  assert.equal(istIdName('142a7f94', DXNX), true);
  assert.equal(istIdName('dxnx 19!', DXNX), false);
  assert.equal(istIdName('', DXNX), true);
});

test('Platz 1 als "b830d2ba": ein aus einer Quelle bekannter Name wird eingesetzt', () => {
  const { namenEinsetzen } = require('./rundenStand.ts');
  const id = 'b830d2bafeb94de48b4c820cada5284e';
  const karte = new Map([[id, 'covx 8ǃ']]);
  const t = namenEinsetzen({ platz: 1, spieler: [{ id, name: 'b830d2ba' }] }, karte);
  assert.equal(t.spieler[0].name, 'covx 8ǃ');
  assert.equal(istIdName('b830d2ba', id), true);
});
