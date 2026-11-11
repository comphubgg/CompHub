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
const MAX = Number(process.env.JAHR_SEITEN ?? 60);
async function einer(f) {
  const [e, w] = f.split(':');
  let gefunden = null; let seiten = 1; let anzahl = 0; let erster = null;
  for (let n = 0; n < Math.min(seiten, MAX) && !gefunden; n++) {
    const j = await seite(e, w, n); if (!j) break; seiten = j.totalPages ?? 1;
    anzahl += (j.entries ?? []).length; erster ??= j.entries?.[0] ? { r: j.entries[0].rank, p: j.entries[0].pointsEarned, n: j.entries[0].sessionHistory?.length } : null;
    gefunden = (j.entries ?? []).find((x) => (x.teamAccountIds ?? []).some((a) => a.toLowerCase() === wer));
  }
  if (!gefunden) return { w, nicht: true, seiten, anzahl, erster };
  const s = gefunden.sessionHistory ?? [];
  const sum = (k) => s.reduce((a, x) => a + (Number(x.trackedStats?.[k]) || 0), 0);
  return { w, platz: gefunden.rank, punkte: gefunden.pointsEarned, spiele: s.length, elims: sum('TEAM_ELIMS_STAT_INDEX'), siege: sum('VICTORY_ROYALE_STAT'), schaden: sum('DamageDealt') || undefined, team: (gefunden.teamAccountIds ?? []).filter((a) => a.toLowerCase() !== wer) };
}
let i = 0;
await Promise.all(Array.from({ length: 5 }, async () => { while (i < fenster.length) { const f = fenster[i++]; try { console.log('JAHR', JSON.stringify(await einer(f))); } catch (e) { console.log('JAHR', JSON.stringify({ w: f, fehler: String(e.message).slice(0, 80) })); } } }));
