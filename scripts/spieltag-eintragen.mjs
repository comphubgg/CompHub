// Einen Spieltag direkt aus Epics Bestenliste in data/epic-spieltage schreiben (gleiches Format wie scripts/epic-spieltage-holen.mjs),
// wenn die Seite (und damit der Cup-Katalog) nicht erreichbar ist. Danach liest clutch-rechnen den Spieltag wie jeden anderen.
//   node scripts/spieltag-eintragen.mjs <eventId> <windowId> <beginnMs> [titel] [runde] [istFinale]
import fs from 'node:fs';
import path from 'node:path';
import { holeNutzerToken } from '../lib/replayKern.mjs';

const [eventId, windowId, beginn, titel = '', runde = '1', finale = 'false'] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const season = windowId.match(/^(S\d+)/)?.[1] ?? 'S43';
async function seite(nr) {
  for (let v = 0; v < 5; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token } }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404) return null;
    await new Promise((x) => setTimeout(x, 2000 * (v + 1)));
  }
  throw new Error(`Seite ${nr} nicht lesbar`);
}
const teams = [];
let seiten = 1;
for (let n = 0; n < Math.min(seiten, 100); n++) {
  const j = await seite(n); if (!j) break; seiten = j.totalPages ?? 1;
  for (const e of j.entries ?? []) {
    const s = e.sessionHistory ?? [];
    teams.push({ platz: e.rank, punkte: e.pointsEarned, matches: s.length, teamElims: s.reduce((a, x) => a + (Number(x.trackedStats?.TEAM_ELIMS_STAT_INDEX) || 0), 0), spieler: e.teamAccountIds ?? [] });
  }
}
if (!teams.length) { console.log('Bestenliste leer'); process.exit(2); }
const datei = path.join('data', 'epic-spieltage', season, `${windowId}.json`);
fs.mkdirSync(path.dirname(datei), { recursive: true });
fs.writeFileSync(datei, JSON.stringify({
  eventId, windowId, region: windowId.split('_').pop(), season, titel, runde: Number(runde), istFinale: finale === 'true',
  datum: Number(beginn), geholt: new Date().toISOString(), teams,
}, null, 1));
console.log(`${datei}: ${teams.length} Teams`);
