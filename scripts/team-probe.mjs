// Probe (15.11.2026): gibt Epic den Eintrag eines beliebigen Teams heraus, auch hinter Platz 10.000, wenn man seine Konten in teamAccountIds nennt?
//   node scripts/team-probe.mjs <eventId> <windowId>
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [eventId, windowId] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const roh = await (await fetch(`https://github.com/comphubgg/CompHub/releases/download/daten-clutch/clutch__${windowId}.json`)).json();
const ids = Object.keys(roh.spiele ?? roh.namen ?? {}).filter((i) => /^[0-9a-f]{32}$/i.test(i));
console.log('Konten aus den Replays:', ids.length);
// Gleichmaessig verteilt 40 Konten - unter ihnen sollten viele hinter Platz 10.000 stehen.
const probe = ids.filter((_, i) => i % Math.max(1, Math.floor(ids.length / 40)) === 0).slice(0, 40);
let hinter = 0, gefunden = 0;
for (const id of probe) {
  const { token, accountId } = await holeNutzerToken();
  const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=0&rank=0&teamAccountIds=${id}`, { headers: { Authorization: token } });
  const j = r.ok ? await r.json() : null;
  const e = (j?.entries ?? []).find((x) => (x.teamAccountIds ?? []).includes(id));
  if (e) { gefunden += 1; if (e.rank > 10000) hinter += 1; }
  console.log('PROBE', id.slice(0, 8), r.status, e ? `rang ${e.rank} punkte ${e.pointsEarned} spiele ${(e.sessionHistory ?? []).length}` : `nicht dabei (eintraege ${j?.entries?.length ?? '-'})`);
}
console.log(`PROBE ERGEBNIS: ${gefunden}/${probe.length} gefunden, davon ${hinter} hinter Platz 10.000`);
