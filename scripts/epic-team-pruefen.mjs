// Diagnose: Epics Bestenlisten-Eintrag eines Teams (alle Spiele mit sessionId und trackedStats) - Gegenprobe fuer Schaden, Kills und Spielzahl.
//   node scripts/epic-team-pruefen.mjs <eventId> <windowId> <epicId>
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [eventId, windowId, wer] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const { token, accountId } = await holeNutzerToken();
const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=0&rank=0&teamAccountIds=${wer}`, { headers: { Authorization: token } });
const j = await r.json();
for (const e of j.entries ?? []) {
  if (!(e.teamAccountIds ?? []).map((x) => x.toLowerCase()).includes(wer.toLowerCase())) continue;
  console.log('TEAM', e.rank, e.pointsEarned, (e.teamAccountIds ?? []).join(','));
  for (const s of e.sessionHistory ?? []) console.log('SPIEL', s.sessionId, s.endTime, JSON.stringify(s.trackedStats));
}
if (!(j.entries ?? []).length) console.log('LEER', r.status, JSON.stringify(j).slice(0, 500));
