// Diagnose (15.11.2026, exakt-mats-strecke): welche Fenster fuehren bei Epic Mats-Werte (WoodAcquired, WoodExpended ...)?
// 1) Katalog je Region: Bestenlisten-Definitionen samt ihren Statistiken. 2) Fuer jedes Fenster mit Mats-Werten Seite 0 der Bestenliste: Schluessel und Zahl der Sitzungen.
// Schreibt /tmp/epic-schluessel.json.
//   node scripts/diag-epic-schluessel.mjs [EU,NAC]
import fs from 'node:fs';
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const regionen = (process.argv[2] ?? 'EU').split(',');
async function holen(url) {
  for (let v = 0; v < 4; v++) {
    const { token } = await holeNutzerToken();
    const r = await fetch(url, { headers: { Authorization: token }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (r?.ok) return r.json();
    if (r?.status === 401) verwirfNutzerToken();
    if (r?.status === 404) return null;
    await warte(2000 * (v + 1));
  }
  return null;
}
const raus = { defs: [], fenster: [] };
for (const reg of regionen) {
  const { accountId } = await holeNutzerToken();
  const k = await holen(`${EVENTS}/api/v1/events/Fortnite/download/${accountId}?region=${reg}&platform=Windows&teamAccountIds=${accountId}`);
  if (!k) { console.log('SCHLUESSEL Katalog fehlt', reg); continue; }
  const defs = k.leaderboardDefs ?? [];
  { const alles = JSON.stringify(k); const w = {}; for (const x of alles.match(/[A-Za-z_]*(Wood|Stone|Metal|Material|Travel|Expended|Acquired|Harvest)[A-Za-z_]*/g) ?? []) w[x] = (w[x] ?? 0) + 1;
    console.log('SCHLUESSEL KATALOG', reg, 'Schluessel', Object.keys(k).join(','), 'Woerter', JSON.stringify(w).slice(0, 2000)); fs.writeFileSync(`/tmp/katalog-${reg}.json`, alles); }
  const mitMats = new Set();
  for (const d of defs) {
    const txt = JSON.stringify(d);
    const stats = [...new Set(txt.match(/[A-Za-z_]*(Wood|Stone|Metal|Material|Travel|Expended|Acquired|Harvest)[A-Za-z_]*/g) ?? [])];
    if (stats.length) { mitMats.add(d.leaderboardDefId); raus.defs.push({ reg, id: d.leaderboardDefId, stats }); }
  }
  console.log('SCHLUESSEL', reg, 'Definitionen', defs.length, 'mit Mats/Strecke', mitMats.size, JSON.stringify(raus.defs.filter((x) => x.reg === reg).slice(0, 40)).slice(0, 3000));
  for (const ev of k.events ?? []) for (const w of ev.eventWindows ?? []) {
    const lb = (w.scoreLocations ?? []).map((s) => s.leaderboardDefId);
    const treffer = lb.filter((x) => mitMats.has(x));
    if (!treffer.length) continue;
    const j = await holen(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(ev.eventId)}/${encodeURIComponent(w.eventWindowId)}/${accountId}?page=0&rank=0&teamAccountIds=`);
    const sch = {}; let n = 0;
    for (const e of j?.entries ?? []) for (const s of e.sessionHistory ?? []) { n++; for (const q of Object.keys(s.trackedStats ?? {})) sch[q] = (sch[q] ?? 0) + 1; }
    const f = { reg, event: ev.eventId, fenster: w.eventWindowId, beginn: w.beginTime, ende: w.endTime, defs: treffer, eintraege: j?.entries?.length ?? 0, sitzungen: n, schluessel: sch };
    raus.fenster.push(f);
    console.log('SCHLUESSEL FENSTER', JSON.stringify(f).slice(0, 900));
  }
}
fs.writeFileSync('/tmp/epic-schluessel.json', JSON.stringify(raus));
