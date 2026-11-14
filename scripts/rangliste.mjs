// Ganze Bestenliste eines Spieltags: je Zeile "RANG <platz> <punkte> <ids...>".
//   node scripts/rangliste.mjs <eventId> <windowId>
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [e, w] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
async function seite(nr) {
  for (let v = 0; v < 5; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(e)}/${encodeURIComponent(w)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token } }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404) return null;
    await new Promise((x) => setTimeout(x, 2000 * (v + 1)));
  }
  return null;
}
let seiten = 1;
for (let n = 0; n < Math.min(seiten, 200); n++) {
  const j = await seite(n); if (!j) break; seiten = j.totalPages ?? 1;
  for (const x of j.entries ?? []) console.log(`RANG ${x.rank} ${x.pointsEarned} ${(x.teamAccountIds ?? []).join(' ')}`);
}
