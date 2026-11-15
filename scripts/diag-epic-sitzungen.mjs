// Diagnose (15.11.2026, exakt-mats-strecke): Epics Werte je Spieler und Match (sessionHistory.trackedStats) eines Fensters - nur lesen, nichts ablegen.
// Zeigt, welche Stat-Schluessel Epic fuer das Fenster fuehrt (z. B. Travel_Distance_Ground, WoodAcquired) und schreibt alles nach <datei>.
//   node scripts/diag-epic-sitzungen.mjs <eventId> <windowId> <datei> [seiten]
import fs from 'node:fs';
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';
const [eventId, windowId, datei, seitenArg] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
async function seite(nr) {
  for (let versuch = 0; versuch < 4; versuch++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`,
      { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) return r.json();
    console.log('EPIC Seite', nr, 'Status', r?.status);
    if (r?.status === 401) verwirfNutzerToken();
    await warte(2000 * (versuch + 1));
  }
  return null;
}
const raus = [];
const erste = await seite(0);
const seiten = Math.min(erste?.totalPages ?? 1, Number(seitenArg) || 3);
for (let nr = 0; nr < seiten; nr++) {
  const j = nr === 0 ? erste : await seite(nr);
  for (const e of j?.entries ?? []) raus.push({ ids: e.teamAccountIds, rang: e.rank, sitzungen: (e.sessionHistory ?? []).map((s) => ({ id: s.sessionId, ende: s.endTime, st: s.trackedStats })) });
}
const schluessel = {};
for (const e of raus) for (const s of e.sitzungen) for (const k of Object.keys(s.st ?? {})) schluessel[k] = (schluessel[k] ?? 0) + 1;
console.log('EPIC Eintraege', raus.length, 'Schluessel', JSON.stringify(schluessel));
fs.writeFileSync(datei, JSON.stringify(raus));
