// Diagnose (15.11.2026, exakt-mats-strecke): fuehrte Epic in frueheren Fenstern Mats-Werte (WoodAcquired, WoodExpended)? Seite 0 je Fenster, Schluessel der Sitzungen.
//   node scripts/diag-epic-alt.mjs <liste.tsv: eventId TAB windowId>   -> /tmp/epic-alt.json
import fs from 'node:fs';
import { holeNutzerToken, verwirfNutzerToken, warte } from '../lib/replayKern.mjs';
const EVENTS = 'https://events-public-service-live.ol.epicgames.com';
const liste = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map((z) => z.split('\t')).filter((x) => x[0] && x[1]);
const raus = [];
for (const [ev, w] of liste) {
  let j = null;
  for (let v = 0; v < 3 && !j; v++) {
    const { token, accountId } = await holeNutzerToken();
    const r = await fetch(`${EVENTS}/api/v1/leaderboards/Fortnite/${encodeURIComponent(ev)}/${encodeURIComponent(w)}/${accountId}?page=0&rank=0&teamAccountIds=`, { headers: { Authorization: token }, signal: AbortSignal.timeout(30_000) }).catch(() => null);
    if (r?.ok) { j = await r.json(); break; }
    if (r?.status === 401) verwirfNutzerToken();
    if (r?.status === 404) break;
    await warte(1500);
  }
  const k = {}; let n = 0;
  for (const e of j?.entries ?? []) for (const s of e.sessionHistory ?? []) { n++; for (const q of Object.keys(s.trackedStats ?? {})) if (!/^(SILVER|GOLD|PLATINUM|DIAMOND|BRONZE|ELITE|CHAMPION|UNREAL)_/.test(q)) k[q] = (k[q] ?? 0) + 1; }
  raus.push({ ev, w, eintraege: j?.entries?.length ?? null, sitzungen: n, k });
  const mats = Object.keys(k).filter((q) => /Wood|Stone|Metal|Acquired|Expended/.test(q));
  console.log('ALT', w, j ? j.entries?.length : '404', n, mats.length ? 'MATS ' + mats.join(',') : '', Object.keys(k).length);
}
fs.writeFileSync('/tmp/epic-alt.json', JSON.stringify(raus));
