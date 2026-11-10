// Schaden je Spieler und Match gegen Epic (10.11.2026): in Solo-Cups fuehrt Epics Bestenliste "DamageDealt" je Spiel (sessionHistory). Damit laesst sich
// unsere Zaehlung aus dem Replay Match fuer Match pruefen - fuer jeden Spieler, nicht nur die auf Osirions Screenshots.
//   node scripts/epic-schaden-vergleich.mjs <eventId> <windowId> <ordner mit aus-<match>.json>
import fs from 'node:fs';
import path from 'node:path';
import { holeNutzerToken } from '../lib/replayKern.mjs';
const [eventId, windowId, ordner] = process.argv.slice(2);
const dateien = fs.readdirSync(ordner).filter((f) => /^aus-[0-9a-f]{32}\.json$/.test(f));
const gesucht = new Set(dateien.map((f) => f.slice(4, 36)));
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
const epic = new Map(); // epic|match -> {dmg, stats}
const erste = await seite(0); const seiten = Math.min(erste?.totalPages ?? 1, 100);
const nehmen = (j) => { for (const e of j?.entries ?? []) { if ((e.teamAccountIds ?? []).length !== 1) continue; for (const s of e.sessionHistory ?? []) if (gesucht.has(s.sessionId)) epic.set(`${e.teamAccountIds[0].toLowerCase()}|${s.sessionId}`, s.trackedStats ?? {}); } };
nehmen(erste);
let n = 1; await Promise.all(Array.from({ length: 5 }, async () => { while (n < seiten) nehmen(await seite(n++)); }));
const varianten = { ohneBoden: (x) => x.gemachtOhneBoden ?? x.gemacht, alle: (x) => x.gemacht, ohneFatal: (x) => x.gemachtOhneFatal };
const erg = Object.fromEntries(Object.keys(varianten).map((k) => [k, { n: 0, gleich: 0, nah: 0, wir: 0, epic: 0 }]));
const abw = [];
for (const f of dateien) {
  const id = f.slice(4, 36); const d = JSON.parse(fs.readFileSync(path.join(ordner, f), 'utf8'));
  const sp = new Map((d.spieler ?? []).map((p) => [p.id, p]));
  for (const x of d.schaden ?? []) {
    const p = sp.get(x.id); if (!p?.epic) continue;
    const st = epic.get(`${p.epic.toLowerCase()}|${id}`); if (!st || st.DamageDealt == null) continue;
    const soll = Number(st.DamageDealt);
    for (const [k, fn] of Object.entries(varianten)) { const ist = Math.round(fn(x) ?? 0); const e = erg[k]; e.n++; e.wir += ist; e.epic += soll; if (Math.abs(ist - soll) <= 1) e.gleich++; if (Math.abs(ist - soll) <= Math.max(2, soll * 0.01)) e.nah++; }
    const ist = Math.round(varianten.ohneBoden(x) ?? 0);
    if (Math.abs(ist - soll) > 1) abw.push({ match: id.slice(0, 8), id: x.id, name: p.name, epic: soll, wir: ist, alle: Math.round(x.gemacht), treffer: x.treffer, diff: ist - soll });
  }
}
console.log(`Epic-Eintraege fuer diese Matches: ${epic.size}`, 'Felder:', JSON.stringify([...epic.values()][0] ?? {}));
for (const [k, e] of Object.entries(erg)) console.log(`VARIANTE ${k}: ${e.n} Spieler-Spiele, genau (±1) ${e.gleich} (${(e.gleich / Math.max(1, e.n) * 100).toFixed(1)} %), ±1 % ${e.nah}, Summe wir ${e.wir} / Epic ${e.epic} (${((e.wir - e.epic) / Math.max(1, e.epic) * 100).toFixed(2)} %)`);
abw.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
for (const a of abw.slice(0, 40)) console.log('ABW', JSON.stringify(a));
const hist = {}; for (const a of abw) { const b = a.diff > 0 ? '+' : '-'; const g = Math.abs(a.diff) <= 10 ? '<=10' : Math.abs(a.diff) <= 50 ? '<=50' : Math.abs(a.diff) <= 150 ? '<=150' : '>150'; hist[b + g] = (hist[b + g] ?? 0) + 1; }
console.log('VERTEILUNG', JSON.stringify(hist));
