// Ein Spieler ueber viele Spieltage (Jahresrueckblick, 11.11.2026): je Fenster Platz, Punkte, Team-Elims, Spiele und Teamkollegen aus Epics Bestenliste.
//   node scripts/spieler-jahr.mjs <epicId> <eventId:windowId> [...]
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [wer, ...fenster] = process.argv.slice(2);
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
async function seite(e, w, nr) {
  for (let v = 0; v < 4; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(e)}/${encodeURIComponent(w)}/${accountId}?page=${nr}&rank=0&teamAccountIds=`, { headers: { Authorization: token } }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 404) return null;
    await new Promise((x) => setTimeout(x, 2000 * (v + 1)));
  }
  return null;
}
for (const f of fenster) {
  const [e, w] = f.split(':');
  let gefunden = null; let seiten = 1;
  for (let n = 0; n < Math.min(seiten, 60) && !gefunden; n++) {
    const j = await seite(e, w, n); if (!j) break; seiten = j.totalPages ?? 1;
    gefunden = (j.entries ?? []).find((x) => (x.teamAccountIds ?? []).some((a) => a.toLowerCase() === wer));
  }
  if (!gefunden) { console.log('JAHR', JSON.stringify({ w, nicht: true })); continue; }
  const s = gefunden.sessionHistory ?? [];
  const sum = (k) => s.reduce((a, x) => a + (Number(x.trackedStats?.[k]) || 0), 0);
  console.log('JAHR', JSON.stringify({ w, platz: gefunden.rank, punkte: gefunden.pointsEarned, spiele: s.length, elims: sum('TEAM_ELIMS_STAT_INDEX'), siege: sum('VICTORY_ROYALE_STAT'), schaden: sum('DamageDealt') || undefined, team: (gefunden.teamAccountIds ?? []).filter((a) => a.toLowerCase() !== wer) }));
}
