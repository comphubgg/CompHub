// Gegenprobe gegen Epic selbst (10.11.2026): je Team und Match nennt Epics Bestenliste Platz und Team-Eliminierungen. Unser Kill-Feed aus den Replays
// muss dazu passen - fuer jedes Team des Spieltags, nicht nur die Spieler auf Osirions Screenshots.
//   node scripts/epic-gegenprobe.mjs <eventId> <windowId> <clutch-roh.json>
import fs from 'node:fs';
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [eventId, windowId, rohDatei] = process.argv.slice(2);
const roh = JSON.parse(fs.readFileSync(rohDatei, 'utf8'));
const matches = new Map((roh.matches ?? []).map((m) => [m.id, m]));
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
const erste = await seite(0); const seiten = Math.min(erste?.totalPages ?? 1, 100);
const eintraege = [...(erste?.entries ?? [])];
for (let n = 1; n < seiten; n++) eintraege.push(...((await seite(n))?.entries ?? []));
let verglichen = 0, killsGleich = 0, platzGleich = 0, ohneReplay = 0, ohneTeam = 0; const fehler = [];
const killsJeMatch = new Map();
for (const e of eintraege) {
  const epics = (e.teamAccountIds ?? []).map((x) => x.toLowerCase());
  for (const s of e.sessionHistory ?? []) {
    const m = matches.get(s.sessionId); if (!m) { ohneReplay++; continue; }
    const sp = (Array.isArray(m.spieler) ? m.spieler : Object.values(m.spieler)).filter((p) => epics.includes(String(p.epic ?? '').toLowerCase()));
    if (!sp.length) { ohneTeam++; continue; }
    const ids = new Set(sp.map((p) => p.id));
    const unsere = (m.feed ?? []).filter((f) => f.art === 'tot' && ids.has(f.taeter) && !ids.has(f.opfer)).length;
    const epicKills = Number(s.trackedStats?.TEAM_ELIMS_STAT_INDEX ?? 0), epicPlatz = Number(s.trackedStats?.PLACEMENT_STAT_INDEX ?? 0);
    const unserPlatz = Math.min(...sp.map((p) => p.platz ?? 999));
    verglichen++; if (unsere === epicKills) killsGleich++; if (unserPlatz === epicPlatz) platzGleich++;
    const k = killsJeMatch.get(m.id) ?? { epic: 0, wir: 0 }; k.epic += epicKills; k.wir += unsere; killsJeMatch.set(m.id, k);
    if (unsere !== epicKills || unserPlatz !== epicPlatz) fehler.push({ match: m.id.slice(0, 8), team: sp.map((p) => p.name).join(' / ').slice(0, 60), killsEpic: epicKills, killsWir: unsere, platzEpic: epicPlatz, platzWir: unserPlatz });
  }
}
console.log(`Teams ${eintraege.length}, Team-Spiele verglichen ${verglichen} (ohne Replay ${ohneReplay}, Team im Replay nicht gefunden ${ohneTeam})`);
console.log(`Kills gleich: ${killsGleich} von ${verglichen} (${(killsGleich / Math.max(1, verglichen) * 100).toFixed(1)} %), Platz gleich: ${platzGleich} von ${verglichen}`);
const diffs = {}; for (const f of fehler) { const d = f.killsWir - f.killsEpic; diffs[d] = (diffs[d] ?? 0) + 1; }
console.log('Abweichung Kills (wir - Epic) -> Anzahl Team-Spiele:', JSON.stringify(diffs));
for (const f of fehler.slice(0, 40)) console.log('ABWEICHUNG', JSON.stringify(f));
for (const [id, k] of killsJeMatch) if (k.epic !== k.wir) console.log('MATCH', id.slice(0, 8), 'Epic', k.epic, 'wir', k.wir);
