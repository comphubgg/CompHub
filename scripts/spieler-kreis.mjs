// Der Spieler-Kreis: ein Profil fuer jeden, der regelmaessig gut platziert ist.
//
// Der Betreiber (4.11.2026): "wir haben gerade mal 8000 Profile" - "ein Bot im Hintergrund, der jedes Leaderboard analysiert und schaut, welche Spieler
// regelmaessig gut platzieren. Nicht ueber den Username, jeder kann ihn jede zweite Woche aendern." Die Akten entstanden bisher nur fuer Konten aus dem Archiv der
// Szene, und das bekommt seit dem 10.10.2026 nichts mehr. Epics Bestenlisten liegen aber laengst hier (data/epic-spieltage), je Team mit Konto-Ids: ueber
// 900.000 Konten. Hier wird daraus gefiltert, wer es verdient - allein ueber die Konto-Id, Ranked Cups zaehlen nicht:
//
//   data/spieler-kreis/_index.json   [{ epicId, name, region, cups, top500, top100, beste, matches }]  fuer die Suche
//   data/spieler-kreis/<xx>.json     { <epicId>: [Zeile je Spieltag] }  je ersten zwei Zeichen der Kennung, dieselben Zeilen wie die Akte (EpicZeile)
//
// Kein Name, keine Flagge und kein Foto werden erfunden: der Name ist der letzte, den Epic zu diesem Konto nannte; Schaden und Clutch stehen nur, wo ein volles
// Replay gelesen ist. Laeuft auf GitHub (spieler-kreis.yml), nie auf dem PC des Betreibers.
//
//   node scripts/spieler-kreis.mjs

import fs from 'node:fs';
import path from 'node:path';

const DATEN = path.join(process.cwd(), 'data');
const SPIELTAGE = path.join(DATEN, 'epic-spieltage');
const ZIEL = path.join(DATEN, 'spieler-kreis');
/*
 * Wer gilt als stark (Betreiber, 4.11.2026: "ein Top 500 oder Top 300 in einem normalen Cup ist gut ... Top 10 in Runde 2 der FNCS, solche Leute, die immer wieder
 * Top 10, Top 100 kommen, suche ich"). Das haengt am Feld: ab so vielen Teams ist es eine offene Runde.
 */
const OFFEN_AB = 3000;
const istStark = (x) => x.top10 >= 1 || x.spaet100 >= 2 || x.offen100 >= 2 || x.offen300 >= 3;

const lies = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };
const dateien = [];
for (const ordner of fs.existsSync(SPIELTAGE) ? fs.readdirSync(SPIELTAGE) : []) {
  const voll = path.join(SPIELTAGE, ordner);
  if (!fs.statSync(voll).isDirectory()) continue;
  for (const f of fs.readdirSync(voll)) if (f.endsWith('.json') && !f.startsWith('_')) dateien.push(path.join(voll, f));
}
const zaehlt = (tag) => tag?.windowId && Array.isArray(tag.teams) && !/ranked/i.test(`${tag.windowId} ${tag.titel ?? ''} ${tag.cupId ?? ''}`);

// Erster Durchgang: wer kommt in den Kreis?
const stand = new Map();
const zaehler = (id) => { let x = stand.get(id); if (!x) { x = { top10: 0, spaet100: 0, offen100: 0, offen300: 0 }; stand.set(id, x); } return x; };
let tage = 0;
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  tage += 1;
  const offen = tag.teams.length >= OFFEN_AB;
  for (const t of tag.teams) {
    if (t.platz > 300) continue;
    for (const id of t.spieler ?? []) {
      const x = zaehler(id);
      if (t.platz <= 10) x.top10 += 1;
      if (offen) { x.offen300 += 1; if (t.platz <= 100) x.offen100 += 1; } else if (t.platz <= 100) x.spaet100 += 1;
    }
  }
}
const kreis = new Set([...stand].filter(([, x]) => istStark(x)).map(([id]) => id));
stand.clear();
console.log(`${tage} Spieltage ohne Ranked, ${kreis.size} Konten im Kreis.`);
if (!kreis.size) { console.log('Kein Konto im Kreis - nichts geschrieben.'); process.exit(1); }

// Zweiter Durchgang: die Zeilen. Schaden und Clutch aus den vollen Replays, wo der Spieltag gelesen ist.
const zeilen = new Map();
for (const datei of dateien) {
  const tag = lies(datei, null);
  if (!zaehlt(tag)) continue;
  const voll = lies(path.join(DATEN, 'clutch', `${tag.windowId}.json`), null);
  const gelesen = voll && !voll.teilweise ? voll : null;
  for (const t of tag.teams) {
    for (const id of t.spieler ?? []) {
      if (!kreis.has(id)) continue;
      const sch = gelesen?.schaden?.[id];
      const dmg = gelesen?.epicDmg?.[id] ?? sch?.dmg;
      const liste = zeilen.get(id) ?? [];
      liste.push({
        event: tag.windowId, windowId: tag.windowId, region: tag.region, season: tag.season, titel: tag.titel, datum: tag.datum ?? null,
        platz: t.platz, punkte: t.punkte, matches: t.matches, mitspieler: (t.spieler ?? []).filter((x) => x !== id), nurEpic: true,
        ...(sch ? { replaySchaden: { dmg: Math.round(dmg), erlitten: Math.round(sch.erlitten), treffer: sch.treffer, krit: sch.krit } } : {}),
        ...(gelesen?.summe && Object.keys(gelesen.summe).length ? { replayClutch: gelesen.summe[id] ?? 0 } : {}),
      });
      zeilen.set(id, liste);
    }
  }
}

const namen = lies(path.join(DATEN, 'epic-namen.json'), {});
const eimer = new Map();
const index = [];
for (const [id, liste] of zeilen) {
  liste.sort((a, b) => (b.datum ?? 0) - (a.datum ?? 0));
  const k = id.slice(0, 2);
  const e = eimer.get(k) ?? {};
  e[id] = liste;
  eimer.set(k, e);
  const regionen = new Map();
  for (const z of liste) regionen.set(z.region, (regionen.get(z.region) ?? 0) + 1);
  index.push({
    epicId: id, name: namen[id] ?? '', region: [...regionen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
    cups: liste.length, top500: liste.filter((z) => z.platz <= 500).length, top100: liste.filter((z) => z.platz <= 100).length,
    beste: Math.min(...liste.map((z) => z.platz)), matches: liste.reduce((a, z) => a + (z.matches ?? 0), 0),
  });
}
index.sort((a, b) => b.top100 - a.top100 || b.top500 - a.top500);

fs.rmSync(ZIEL, { recursive: true, force: true });
fs.mkdirSync(ZIEL, { recursive: true });
for (const [k, e] of eimer) fs.writeFileSync(path.join(ZIEL, `${k}.json`), JSON.stringify(e));
fs.writeFileSync(path.join(ZIEL, '_index.json'), JSON.stringify(index));
console.log(`${index.length} Profile in ${eimer.size} Dateien, ${index.filter((x) => !x.name).length} ohne Namen.`);
