// Je ausgewertetem Spieltag eine schlanke Fassung fuer die Seite.
//
// Die Auswertungen (data/replays/<S>/<window>/_aggregat.json) sind bei einem
// offenen Cup bis zu 54 MB gross: 140.000 Spieler, je Spieler seine Opfer
// und Waffen. Die Seite liest daraus nur Spiele, Elims, Knocks und Tode je
// Spieler und die Lobbys - und auf dem kostenlosen Host (512 MB) riss das
// Laden der ganzen Datei den Server um (28.9.2026, Matches eines
// Solo-Qualifiers).
//
// Hier entsteht deshalb data/replays-schlank/<S>/<window>.json:
//   spieler: [[epicId, matches, kills, knocks, gestorben, umgehauen], ...]
//            nur wer etwas geholt hat (Kill oder Knock), nach Kills geordnet
//   spielerGesamt, matches, elims, quelle, gerechnet, rundenGesamt, teams, lobbys
//
// Neu geschrieben wird nur, wo die Auswertung neuer ist als die schlanke Fassung.
//
//   node scripts/replays-schlank.mjs

import fs from 'node:fs';
import path from 'node:path';

const QUELLE = path.join(process.cwd(), 'data', 'replays');
const ZIEL = path.join(process.cwd(), 'data', 'replays-schlank');

let neu = 0; let gleich = 0; let kaputt = 0;
for (const saison of fs.existsSync(QUELLE) ? fs.readdirSync(QUELLE) : []) {
  if (!/^S\d+$/i.test(saison)) continue;
  const ordner = path.join(QUELLE, saison);
  if (!fs.statSync(ordner).isDirectory()) continue;
  for (const fenster of fs.readdirSync(ordner)) {
    const agg = path.join(ordner, fenster, '_aggregat.json');
    if (!fs.existsSync(agg)) continue;
    const ziel = path.join(ZIEL, saison, `${fenster}.json`);
    if (fs.existsSync(ziel) && fs.statSync(ziel).mtimeMs >= fs.statSync(agg).mtimeMs) { gleich += 1; continue; }
    let a;
    try { a = JSON.parse(fs.readFileSync(agg, 'utf8')); } catch { kaputt += 1; continue; }
    const echte = (a.spieler ?? []).filter((s) => s.epicId && s.epicId !== 'bot');
    const spieler = echte
      .filter((s) => (s.kills ?? 0) > 0 || (s.knocks ?? 0) > 0)
      .sort((x, y) => (y.kills ?? 0) - (x.kills ?? 0) || (y.knocks ?? 0) - (x.knocks ?? 0))
      .map((s) => [s.epicId, s.matches ?? 0, s.kills ?? 0, s.knocks ?? 0, s.gestorben ?? 0, s.umgehauen ?? 0]);
    let rundenGesamt = null;
    try {
      const z = JSON.parse(fs.readFileSync(path.join(ordner, fenster, '_zustand.json'), 'utf8'));
      rundenGesamt = Object.keys(z.matches ?? {}).length || null;
    } catch { /* ohne Zustand */ }
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, JSON.stringify({
      v: 1, windowId: fenster, season: saison,
      matches: a.matches ?? 0, elims: a.elims ?? null, quelle: a.quelle ?? null, gerechnet: a.gerechnet ?? null,
      rundenGesamt, spielerGesamt: echte.length, spieler,
      teams: a.teams ?? [], lobbys: a.lobbys ?? {},
    }));
    neu += 1;
  }
}
console.log(`schlank: ${neu} neu, ${gleich} unveraendert, ${kaputt} unlesbar`);
