// Probe (15.11.2026): gibt Epic den Eintrag eines beliebigen Teams heraus, auch hinter Platz 10.000, wenn man seine Konten in teamAccountIds nennt?
//   node scripts/team-probe.mjs <eventId> <windowId>
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [eventId, windowId] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const roh = await (await fetch(`https://github.com/comphubgg/CompHub/releases/download/daten-clutch/clutch__${windowId}.json`)).json();
const ids = Object.keys(roh.spiele ?? roh.namen ?? {}).filter((i) => /^[0-9a-f]{32}$/i.test(i));
console.log('Konten aus den Replays:', ids.length);
// Gleichmaessig verteilt 40 Konten - unter ihnen sollten viele hinter Platz 10.000 stehen.
const probe = ids.filter((_, i) => i % Math.max(1, Math.floor(ids.length / 40)) === 0).slice(0, 1);
let hinter = 0, gefunden = 0;
for (const id of probe) {
  const { token, accountId } = await holeNutzerToken();
  // Weg 2: Verlauf des Spielers im Event (history/<konto>).
  const h = await fetch(`${EVENTS}/api/v1/events/Fortnite/${encodeURIComponent(eventId)}/history/${id}`, { headers: { Authorization: token } });
  const hj = h.ok ? await h.json().catch(() => null) : null;
  const hw = Array.isArray(hj) ? hj.find((x) => x.scoreKey?.eventWindowId === windowId) : null;
  console.log('PROBE history', id.slice(0, 8), h.status, hw ? `rang ${hw.rank} punkte ${hw.pointsEarned} spiele ${(hw.sessionHistory ?? []).length}` : (h.ok ? `eintraege ${Array.isArray(hj) ? hj.length : '-'}` : (await h.text()).slice(0, 400)));
  if (hw?.rank > 10000) hinter += 1; if (hw) gefunden += 1;
  // Weg 3: die Bestenliste mit dem fremden Konto im Pfad.
  const p3 = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${id}?page=0&rank=0&teamAccountIds=`, { headers: { Authorization: token } });
  console.log('PROBE pfad', id.slice(0, 8), p3.status, p3.ok ? '' : (await p3.text()).slice(0, 300));
  const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(eventId)}/${encodeURIComponent(windowId)}/${accountId}?page=0&rank=0&teamAccountIds=${id}`, { headers: { Authorization: token } });
  const j = r.ok ? await r.json() : null; if (!r.ok) console.log('PROBE filter', (await r.text()).slice(0, 300));
  const e = (j?.entries ?? []).find((x) => (x.teamAccountIds ?? []).includes(id));
  console.log('PROBE', id.slice(0, 8), r.status, e ? `rang ${e.rank} punkte ${e.pointsEarned} spiele ${(e.sessionHistory ?? []).length}` : `nicht dabei (eintraege ${j?.entries?.length ?? '-'})`);
}
console.log(`PROBE ERGEBNIS: ${gefunden}/${probe.length} gefunden (history), davon ${hinter} hinter Platz 10.000`);
