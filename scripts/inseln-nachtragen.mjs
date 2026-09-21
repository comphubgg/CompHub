/*
 * Die Playlist (und damit die Reload-Insel) fuer vergangene Spieltage im
 * Cup-Archiv nachtragen.
 *
 * Das Archiv (data/cup-archiv.json) kannte bis zum 21.9.2026 keine
 * Playlist; alle Spieltage davor oeffneten ihre Karte deshalb auf Battle
 * Royale, auch Reload-Cups. Der Betreiber: "die vergangenen Maps ... da
 * wenn ich drauf druecke, ist es die Battle-Royale-Map. Das kann ja nicht
 * sein."
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *
 *   1. Epics Ereignisliste: solange Epic einen Spieltag noch fuehrt, steht
 *      seine Vorlage samt Playlist dort.
 *   2. Ein Server-Replay des Spieltags (Epic haelt sie 31 Tage): darin
 *      steht die tatsaechlich gespielte Playlist. Ein Replay je
 *      Spieltag-Familie genuegt, alle Regionen derselben Familie spielen
 *      dieselbe Vorlage.
 *
 * Aufruf: node scripts/inseln-nachtragen.mjs [--probe]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';
import { holeNutzerToken, matchIds } from '../lib/replayKern.mjs';
import { leseReplay } from '../lib/replayLeser.mjs';

const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');

const PROJEKT = path.resolve(import.meta.dirname, '..');
const ARCHIV = path.join(process.env.COMPHUB_DATEN || path.join(PROJEKT, 'data'), 'cup-archiv.json');
const REGIONEN = ['EU', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];
const PROBE = process.argv.includes('--probe');
const TAGE_31 = 31 * 86_400_000;

const archiv = JSON.parse(fs.readFileSync(ARCHIV, 'utf8'));
const offen = archiv.filter((e) => !e.playlist && /reload|blastberry|escargo/i.test(`${e.id} ${e.windowId}`));
console.log(`  Archiv: ${archiv.length} Eintraege, davon Reload ohne Playlist: ${offen.length}`);

/* ------------------------------------------ 1. Epics Ereignisliste */
const { token, accountId } = await holeNutzerToken();
const ausEpic = new Map();
for (const region of REGIONEN) {
  const r = await fetch(`https://events-public-service-live.ol.epicgames.com/api/v1/events/Fortnite/download/${accountId}`
    + `?region=${region}&platform=Windows&teamAccountIds=${accountId}`, { headers: { Authorization: token } });
  if (!r.ok) { console.log(`  Epic ${region}: ${r.status}`); continue; }
  const j = await r.json();
  const playlists = new Map((j.templates ?? []).map((t) => [t.eventTemplateId, t.playlistId]));
  for (const ev of j.events ?? []) {
    for (const w of ev.eventWindows ?? []) {
      const p = w.eventTemplateId ? playlists.get(w.eventTemplateId) : null;
      if (p) ausEpic.set(w.eventWindowId, p);
    }
  }
}
let ausListe = 0;
for (const e of offen) {
  const p = ausEpic.get(e.windowId);
  if (p) { e.playlist = p; ausListe += 1; }
}
console.log(`  Aus Epics Liste nachgetragen: ${ausListe}`);

/* ------------------------------------------ 2. Server-Replays */
const rest = offen.filter((e) => !e.playlist && e.begin > Date.now() - TAGE_31 && e.begin < Date.now());
// Familie = Fensterkennung ohne Regionsendung; ein Replay je Familie.
const familie = (w) => w.replace(/_(EU|NAC|NAW|BR|ASIA|ME|OCE)$/i, '');
const familien = new Map();
for (const e of rest) {
  const f = familie(e.windowId);
  if (!familien.has(f)) familien.set(f, []);
  familien.get(f).push(e);
}
console.log(`  Ueber Replays zu klaeren: ${familien.size} Familien (${rest.length} Eintraege)`);
let ausReplay = 0;
for (const [f, eintraege] of familien) {
  // EU zuerst - dort gibt es fast immer Replays; sonst irgendeine Region.
  const kandidaten = [...eintraege].sort((a, b) => (a.region === 'EU' ? -1 : 0) - (b.region === 'EU' ? -1 : 0));
  let playlist = null;
  for (const e of kandidaten) {
    try {
      const ids = [...await matchIds(e.eventId, e.windowId, 1)];
      if (!ids.length) continue;
      const puffer = await downloadReplay({ matchId: ids[0], dataCount: 100000, checkpointCount: 100000, eventCount: 100000 });
      const datei = path.join(os.tmpdir(), `comphub-insel-${ids[0]}.replay`);
      fs.writeFileSync(datei, puffer);
      try {
        const j = await leseReplay(datei, 300_000);
        playlist = j?.GameData?.CurrentPlaylist ?? null;
      } finally { fs.unlinkSync(datei); }
      if (playlist) break;
    } catch (err) {
      console.log(`    ${e.windowId}: ${String(err.message).slice(0, 60)}`);
    }
  }
  console.log(`  ${f} -> ${playlist ?? 'kein Replay'}`);
  if (!playlist) continue;
  for (const e of eintraege) { e.playlist = playlist; ausReplay += 1; }
}
console.log(`  Aus Replays nachgetragen: ${ausReplay}`);

if (PROBE) { console.log('  Nur eine Probe - nichts geschrieben.'); process.exit(0); }
fs.writeFileSync(ARCHIV, JSON.stringify(archiv, null, 2));
console.log(`  ${ARCHIV} geschrieben.`);
