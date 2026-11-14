// Tweets im Stil von Fortnite Tracker aus CompHubs Replay-Auswertung: "Best Stats", "Most Damage Dealt (Ratio)", "Most Eliminations (Damage)".
//   node --experimental-strip-types scripts/ft-posts.mjs <windowId> <titel> <cup-daten.js aus cup-post.yml> [minSpiele]
// Werte je Spieler aus clutch/<w>.json (Schaden, erlitten) und clutch-je (Elims = killsEcht), Sieger und Siege aus Epics Bestenliste.
// Die Texte baut lib/ftPosts.ts - dieselbe Regel wie in der Beitragsseite (/api/admin/ft-posts). Dieses Werkzeug holt nur die Dateien vom Release.
import fs from 'node:fs';
import { JE_SPALTEN, jeLesen } from '../lib/jeSpiel.mjs';
import { tagFuer } from '../lib/releaseTags.mjs';
import { ftKonten, ftPosts } from '../lib/ftPosts.ts';

const [windowId, titel, cupDaten, minSpieleArg] = process.argv.slice(2);
const R = 'https://github.com/comphubgg/CompHub/releases/download';
const hole = async (url, json = true) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return json ? r.json() : r.text(); };
const lokal = (datei) => { try { return JSON.parse(fs.readFileSync(new URL(`../data/${datei}`, import.meta.url), 'utf8')); } catch { return null; } };
const d = await hole(`${R}/daten-clutch/clutch__${windowId}.json`);
let je = {}; let spalten = d.je?.spalten ?? JE_SPALTEN;
if (d.je) {
  const jeName = `clutch-je/${windowId}.json`;
  je = jeLesen(await hole(`${R}/${tagFuer(jeName)}/${jeName.replace(/\//g, '__')}`, false));
} else if (d.jeSpiel) {
  je = d.jeSpiel; spalten = ['killsEcht'];
}
const pro = await hole(`${R}/daten/spieler-namen.json`).catch(() => ({}));
const profile = await hole(`${R}/daten/spieler-profile.json`).catch(() => ({}));
const liste = await hole(`${R}/daten/szene-quelle__spielerliste.json`).catch(() => []);
const streamer = await hole(`${R}/daten/streamers.json`).catch(() => lokal('streamers.json'));
const C = cupDaten ? JSON.parse(fs.readFileSync(cupDaten, 'utf8').replace(/^window\.DATEN=/, '').replace(/;\s*$/, '')) : null;

// Teams aus cup-post-daten.mjs: der Sieger (top[0]) und teamWerte (alle mit Sieg, dazu die 30 mit den meisten Elims je Spiel).
const teams = [];
const gesehen = new Set();
for (const t of [...(C?.top?.slice(0, 1) ?? []), ...(C?.teamWerte ?? [])]) {
  const k = (t.ids ?? []).join('|');
  if (!k || gesehen.has(k)) continue;
  gesehen.add(k);
  teams.push({ ids: t.ids, rang: t.rang, siege: t.siege ?? 0, spiele: t.spiele ?? 0, elims: t.elims ?? 0 });
}

const erg = ftPosts({ titel, clutch: d, je, spalten, teams, konten: ftKonten(profile, liste, streamer, pro), minSpiele: Number(minSpieleArg) || undefined });
console.log(`STAND ${erg.stand.gelesen}/${erg.stand.gesamt ?? '?'} Matches gelesen${erg.stand.teilweise ? ' - TEILWEISE, Werte noch nicht endgueltig' : ''}`);
console.log(`\n${erg.posts.map((p) => p.text).join('\n\n=====\n\n')}\n`);
