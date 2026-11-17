// Stat-Posts im CompHub-Stil aus der Replay-Auswertung: Best Stats, Elims, Damage, Best Game, Hits, Builds, Mats, Time Alive, Distance, Storm.
//   node --experimental-strip-types scripts/ft-posts.mjs <windowId> <titel> <cup-daten.js aus cup-post.yml> [minSpiele]
// Werte je Spieler aus clutch/<w>.json (Schaden, Treffer, Inventar, Leben, Strecke, Sturm) und clutch-je (Elims = killsEcht), Sieger und Siege aus Epics Bestenliste.
// Die Texte baut lib/ftPosts.ts - dieselbe Regel wie in der Beitragsseite (/api/admin/ft-posts). Dieses Werkzeug holt nur die Dateien vom Release.
import fs from 'node:fs';
import { JE_SPALTEN, jeLesen } from '../lib/jeSpiel.mjs';
import { tagFuer, tagsFuer } from '../lib/releaseTags.mjs';
import { ftKonten, ftPosts, tweetLaenge } from '../lib/ftPosts.ts';
import { istZeroBuild } from '../lib/zeroBuild.ts';

const [windowId, titel, cupDaten, minSpieleArg] = process.argv.slice(2);
const R = 'https://github.com/comphubgg/CompHub/releases/download';
const hole = async (url, json = true) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return json ? r.json() : r.text(); };
const lokal = (datei) => { try { return JSON.parse(fs.readFileSync(new URL(`../data/${datei}`, import.meta.url), 'utf8')); } catch { return null; } };
// daten-clutch, dann seine Ueberlauf-Releases (lib/releaseTags.mjs) - die erste Fundstelle gilt.
const holeClutch = async () => {
  for (const tag of tagsFuer(`clutch/${windowId}.json`)) { const r = await fetch(`${R}/${tag}/clutch__${windowId}.json`); if (r.ok) return r.json(); if (r.status !== 404) throw new Error(`${tag}/clutch__${windowId}.json: ${r.status}`); }
  throw new Error(`clutch__${windowId}.json: 404 in ${tagsFuer(`clutch/${windowId}.json`).join(', ')}`);
};
const d = await holeClutch();
let je = {}; let spalten = d.je?.spalten ?? JE_SPALTEN;
if (d.je) {
  const jeName = `clutch-je/${windowId}.json`;
  je = jeLesen(await hole(`${R}/${tagFuer(jeName)}/${jeName.replace(/\//g, '__')}`, false));
} else if (d.jeSpiel) {
  je = d.jeSpiel; spalten = ['killsEcht', 'dmg', 'erlitten', 'heilHp', 'schildHeilEcht', 'krit', 'treffer', 'schussEcht', 'matsAlt'];
}
const pro = await hole(`${R}/daten/spieler-namen.json`).catch(() => ({}));
const profile = await hole(`${R}/daten/spieler-profile.json`).catch(() => ({}));
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

const erg = ftPosts({ titel, clutch: d, je, spalten, teams, konten: ftKonten(profile, streamer, pro), minSpiele: Number(minSpieleArg) || undefined,
  fenster: windowId, zeroBuild: istZeroBuild(windowId) });
console.log(`STAND ${erg.stand.gelesen}/${erg.stand.gesamt ?? '?'} Matches gelesen${erg.stand.teilweise ? ' - TEILWEISE, Werte noch nicht endgueltig' : ''}`);
console.log(`\n${erg.posts.map((p) => `${p.text}\n(${tweetLaenge(p.text)}/280)`).join('\n\n=====\n\n')}\n`);
