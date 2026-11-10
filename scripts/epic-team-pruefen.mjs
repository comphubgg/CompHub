// Diagnose: Epics Bestenlisten-Eintrag eines Teams (alle Spiele mit sessionId und trackedStats) - Gegenprobe fuer Schaden, Kills und Spielzahl.
//   node scripts/epic-team-pruefen.mjs <eventId> <windowId> <epicId>[+epicId...]
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [eventId, windowId, wer] = process.argv.slice(2);
const gesucht = wer.toLowerCase().split('+');
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
async function seite(nr) {
  for (let v = 0; v < 4; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token } }).catch(() => null);
    if (r?.ok) return r.json();
    await new Promise((x) => setTimeout(x, 2000 * (v + 1)));
  }
  return null;
}
const erste = await seite(0);
const seiten = Math.min(erste?.totalPages ?? 1, 100);
let gefunden = 0;
const zeig = (j) => {
  for (const e of j?.entries ?? []) {
    if (!(e.teamAccountIds ?? []).some((x) => gesucht.includes(x.toLowerCase()))) continue;
    gefunden++;
    console.log('TEAM', e.rank, e.pointsEarned, (e.teamAccountIds ?? []).join(','));
    for (const s of e.sessionHistory ?? []) console.log('SPIEL', s.sessionId, s.endTime, JSON.stringify(s.trackedStats));
  }
};
zeig(erste);
for (let n = 1; n < seiten && gefunden < gesucht.length; n++) zeig(await seite(n));
console.log('Seiten', seiten, 'gefunden', gefunden);
