// Spieltage neu lesen, in deren Auswertung Matches stecken, die gelesen wurden, bevor sie zu Ende waren.
//
// Der Betreiber (28.10.2026): "dass wirklich alle Stats genau stimmen". Gefunden: der Live-Sammler (replays-holen.mjs) las ein Match, sobald seine Kennung in Epics
// Bestenliste stand - oft zehn Minuten nach dem Start, mitten im Spiel. Das Replay war dann nur der Anfang, und das blieb so stehen: in den FNCS Solos Finals Day 2 EU
// trugen die Spiele 2 bis 5 nur 11 bis 27 statt rund hundert Eliminierungen, in der Qualifier-Runde 3 EU 85 von 90 Matches. Kills, Knocks und Tode der Player Stats
// kamen von dort. Neue Matches prueft der Sammler jetzt vorher und nachher gegen Epics Metadaten (bIsLive, LengthInMS); dieses Skript repariert, was schon falsch
// abgelegt ist:
//
//   1. Verdacht: ein ausgewertetes Match, das weniger als 40 Minuten nach seinem Start gelesen wurde (zuletzt - zeitpunkt im Zustand).
//   2. Pruefung je Verdacht bei Epic: gelesen vor Start + Spieldauer (LengthInMS) = nur ein Teil.
//   3. Spieltage mit mindestens einem Teil-Match und hoechstens --groesse Matches (Standard 300) werden ganz neu gelesen (replays-holen --neu), neu gerechnet
//      (replays-aggregieren --neu) und schlank geschrieben (replays-schlank). Die Einzeldateien liegen nicht am Release, nur Zustand und Aggregat - ein Match
//      laesst sich im Aggregat nicht austauschen, nur das ganze Fenster neu rechnen.
//   Danach, nachrangig: kleine Spieltage, deren Aggregat noch nicht nach der Kill-Regel von Fassung 5 gerechnet ist (keine Selbst-Eliminierung, kein Kill nach
//   dem eigenen letzten Tod, siehe replays-aggregieren.mjs) - auch sie lassen sich nur durch Neulesen richtig rechnen.
//   4. Kommt beim Neulesen nicht jedes zuvor ausgewertete Match wieder an, bleiben Zustand und Aggregat, wie sie waren (lieber das alte als ein lueckenhaftes),
//      und der Spieltag ist beim naechsten Lauf wieder dran.
//
// Erwartet den Stand vom Release auf der Platte (ablage-github-holen.mjs --ordner replays, dazu epic-spieltage fuer die Teams).
//
//   node scripts/replays-teil-reparieren.mjs [--probe] [--minuten 300] [--groesse 300]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ABLAGE, replayVorhanden } from '../lib/replayKern.mjs';

const arg = process.argv.slice(2);
const zahl = (name, standard) => { const i = arg.indexOf(name); const v = i >= 0 ? Number(arg[i + 1]) : NaN; return Number.isFinite(v) && v > 0 ? v : standard; };
const probe = arg.includes('--probe');
const schluss = Date.now() + zahl('--minuten', 300) * 60_000;
const GROESSE = zahl('--groesse', 300);
// Epic haelt ein Replay 31 Tage; ein Tag Abstand, damit das Neulesen nicht an der Frist scheitert.
const grenze = Date.now() - 30 * 864e5;
const VERDACHT_MIN = 40;
// Einzelne Spieltage von Hand: node scripts/replays-teil-reparieren.mjs S42_FNCSSolo_Final_Day2_EU
const nurFenster = new Set(arg.filter((a, i) => !a.startsWith('--') && !/^--(minuten|groesse)$/.test(arg[i - 1] ?? '')));
const wichtig = (w) => (/FNCSSolo_Final|Global|MannekenPis|LAN|_Final/i.test(w) ? 0 : 1);

const lies = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

/** Epics Metadaten mit einer Wiederholung - null, wenn es das Replay nicht (mehr) gibt oder Epic nicht antwortet. */
async function meta(id) {
  for (let i = 0; i < 2; i += 1) {
    try { const r = await replayVorhanden(id); return r.vorhanden ? r.metadaten : null; } catch { await new Promise((r) => setTimeout(r, 1500)); }
  }
  return null;
}

// 1. und 2.: Kandidaten
const kandidaten = [];
let geprueft = 0;
for (const saison of fs.existsSync(ABLAGE) ? fs.readdirSync(ABLAGE) : []) {
  if (!/^S\d+$/i.test(saison)) continue;
  for (const fenster of fs.readdirSync(path.join(ABLAGE, saison))) {
    if (nurFenster.size && !nurFenster.has(fenster)) continue;
    const z = lies(path.join(ABLAGE, saison, fenster, '_zustand.json'));
    if (!z?.matches || (z.datum ?? 0) < grenze) continue;
    const alle = Object.entries(z.matches);
    if (alle.length > GROESSE) continue;
    const verdacht = alle.filter(([, m]) => m.stand === 'PARSED' && m.zeitpunkt && m.zuletzt
      && Date.parse(m.zuletzt) - Date.parse(m.zeitpunkt) < VERDACHT_MIN * 60_000);
    const fassung = Number(lies(path.join(ABLAGE, saison, fenster, '_aggregat.json'))?.aggregatFassung) || 0;
    const fertigZahl = alle.filter(([, m]) => m.stand === 'PARSED').length;
    if (!verdacht.length) {
      if (fertigZahl && fassung < 5) kandidaten.push({ saison, fenster, matches: alle.length, fertig: fertigZahl, datum: z.datum ?? 0, grund: 'fassung' });
      continue;
    }
    let teil = 0;
    for (let i = 0; i < verdacht.length && !teil; i += 6) {
      const satz = verdacht.slice(i, i + 6);
      const antworten = await Promise.all(satz.map(([id]) => meta(id)));
      geprueft += satz.length;
      satz.forEach(([, m], j) => {
        const md = antworten[j];
        if (!md?.LengthInMS) return;
        const start = Date.parse(md.Timestamp ?? m.zeitpunkt);
        if (Date.parse(m.zuletzt) < start + md.LengthInMS - 60_000) teil += 1;
      });
    }
    if (teil) kandidaten.push({ saison, fenster, matches: alle.length, fertig: fertigZahl, datum: z.datum ?? 0, grund: 'teil' });
    else if (fertigZahl && fassung < 5) kandidaten.push({ saison, fenster, matches: alle.length, fertig: fertigZahl, datum: z.datum ?? 0, grund: 'fassung' });
  }
}
const rang = (k) => (k.grund === 'teil' ? 0 : 2) + wichtig(k.fenster);
kandidaten.sort((a, b) => rang(a) - rang(b) || b.datum - a.datum);
console.log(`${kandidaten.filter((k) => k.grund === 'teil').length} Spieltage mit Teil-Matches (${geprueft} Verdachtsfaelle bei Epic geprueft), ${kandidaten.filter((k) => k.grund === 'fassung').length} nach alter Kill-Regel; hoechstens ${GROESSE} Matches je Spieltag:`);
for (const k of kandidaten) console.log(`  ${k.grund.padEnd(7)} ${k.fenster} (${k.fertig}/${k.matches})`);
if (probe || !kandidaten.length) process.exit(0);

// 3. und 4.: je Spieltag neu lesen, pruefen, rechnen
const node = (skript, ...rest) => spawnSync(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), skript), ...rest], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: process.env });
let repariert = 0; let belassen = 0;
for (const k of kandidaten) {
  // Ein Spieltag mit 300 Matches braucht rund eine halbe Stunde.
  if (Date.now() > schluss - 35 * 60_000) { console.log('Zeit um - der Rest kommt beim naechsten Lauf.'); break; }
  const ordner = path.join(ABLAGE, k.saison, k.fenster);
  const zDatei = path.join(ordner, '_zustand.json');
  const aDatei = path.join(ordner, '_aggregat.json');
  const zAlt = fs.readFileSync(zDatei);
  const aAlt = fs.existsSync(aDatei) ? fs.readFileSync(aDatei) : null;
  const vorher = new Set(Object.entries(JSON.parse(zAlt.toString('utf8')).matches).filter(([, m]) => m.stand === 'PARSED').map(([id]) => id));
  const beginn = Date.now();
  console.log(`\n${k.fenster}: ${vorher.size} ausgewertete Matches neu lesen`);
  const r = node('replays-holen.mjs', '--neu', k.fenster);
  console.log(String(r.stdout ?? '').split('\n').filter((z) => /Matches|Fertig|offen|Nichts getroffen|Bestenliste/.test(z)).slice(-4).map((z) => `  ${z.trim()}`).join('\n'));
  const zNeu = lies(zDatei);
  const neuGelesen = new Set(Object.entries(zNeu?.matches ?? {}).filter(([, m]) => m.stand === 'PARSED' && Date.parse(m.zuletzt ?? '') >= beginn - 60_000).map(([id]) => id));
  const fehlen = [...vorher].filter((id) => !neuGelesen.has(id));
  // Die Einzeldateien gehen nicht ans Release - nach dem Rechnen weg, damit die Platte des Rechners nicht vollaeuft.
  const aufraeumen = () => { for (const d of fs.readdirSync(ordner)) if (!d.startsWith('_')) fs.rmSync(path.join(ordner, d), { force: true }); };
  if (fehlen.length) {
    fs.writeFileSync(zDatei, zAlt);
    if (aAlt) fs.writeFileSync(aDatei, aAlt);
    aufraeumen();
    belassen += 1;
    console.log(`  ${fehlen.length} von ${vorher.size} kamen nicht wieder an - Zustand und Aggregat bleiben, wie sie waren`);
    continue;
  }
  const g = node('replays-aggregieren.mjs', '--neu', k.fenster);
  console.log(String(g.stdout ?? '').split('\n').filter((z) => /Matches/.test(z)).map((z) => `  ${z.trim()}`).join('\n'));
  node('replays-schlank.mjs', k.fenster);
  aufraeumen();
  repariert += 1;
  // Gleich ans Release, nicht erst am Ende des Laufs: die Seite zeigt den reparierten Spieltag dann nach Minuten statt nach Stunden.
  if (process.env.GITHUB_TOKEN) {
    const h = node('ablage-github.mjs', '--nur', `replays/${k.saison}/${k.fenster}`, '--nur', `replays-schlank/${k.saison}/${k.fenster}.json`);
    console.log(`  hochgeladen: ${String(h.stdout ?? '').split('\n').filter((z) => /Fertig|hochgeladen|Fehler|!/.test(z)).slice(-2).join(' | ').trim() || (h.status === 0 ? 'ok' : `Code ${h.status}`)}`);
  }
}
console.log(`\nRepariert: ${repariert}, belassen: ${belassen}, offen: ${kandidaten.length - repariert - belassen}`);
