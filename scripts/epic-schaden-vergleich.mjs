// Schaden je Spieler und Match gegen Epic (10.11.2026): in Solo-Cups fuehrt Epics Bestenliste "DamageDealt" je Spiel (sessionHistory). Damit laesst sich
// unsere Zaehlung aus dem Replay Match fuer Match pruefen - fuer jeden Spieler, nicht nur die auf Osirions Screenshots.
//   node scripts/epic-schaden-vergleich.mjs <eventId> <windowId> <ordner mit aus-<match>.json>
//
// Stand 15.11.2026, FNCS Solo Reload Heat 1 EU (8 Matches, 40 Spieler, 284 Spieler-Spiele): 236 genau (±1), Summe 120.943 zu Epics 123.663 (-2,2 %). Die Abweichung sitzt
// in rund 20 Spieler-Spielen, fast nur zu wenig (JUU IY11 in d987c982: 407 statt 768) - Treffer, deren Ziel der Leser nicht zuordnet. Drei Versuche, sie ueber den Akteur
// (SCHADEN_AKTEUR=1: 0 von 449 bestaetigt) oder ueber den zeitgleichen Lebensverlust zuzuordnen (lose: Abweichung 3.056 -> 6.796, streng: 3.056 -> 2.939, zwei Spieler
// darueber), schlossen die Luecke nicht - der Leser blieb unveraendert. Epics DamageReceived zaehlt den Sturm mit (frxstyy: Epic 5.352, von Spielern 2.977, Sturm 2.038).
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
// Epics Werte je Spieler und Match mit ablegen (Artefakt der Schaden-Diagnose) - zum Nachrechnen ohne Epic-Zugang.
fs.writeFileSync(path.join(ordner, 'aus-epic.json'), JSON.stringify(Object.fromEntries(epic)));
console.log(`Epic-Eintraege fuer diese Matches: ${epic.size}`, 'Felder:', JSON.stringify([...epic.values()][0] ?? {}));
for (const [k, e] of Object.entries(erg)) console.log(`VARIANTE ${k}: ${e.n} Spieler-Spiele, genau (±1) ${e.gleich} (${(e.gleich / Math.max(1, e.n) * 100).toFixed(1)} %), ±1 % ${e.nah}, Summe wir ${e.wir} / Epic ${e.epic} (${((e.wir - e.epic) / Math.max(1, e.epic) * 100).toFixed(2)} %)`);
abw.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
for (const a of abw.slice(0, 40)) console.log('ABW', JSON.stringify(a));
const hist = {}; for (const a of abw) { const b = a.diff > 0 ? '+' : '-'; const g = Math.abs(a.diff) <= 10 ? '<=10' : Math.abs(a.diff) <= 50 ? '<=50' : Math.abs(a.diff) <= 150 ? '<=150' : '>150'; hist[b + g] = (hist[b + g] ?? 0) + 1; }
console.log('VERTEILUNG', JSON.stringify(hist));

/*
 * Erlittener Schaden (15.11.2026): Epics DamageReceived gegen genommenOhneBoden (nur Treffer anderer Spieler - so steht es als "Damage Taken" auf der Seite) und gegen dieselbe
 * Zahl plus Sturmschaden (extra[17]) - zeigt, ob Epic Sturm/Fall/Selbstschaden mitzaehlt. Dazu je Spieler die Summe ueber alle Matches.
 */
const erl = { nurSpieler: { n: 0, gleich: 0, wir: 0, epic: 0 }, mitSturm: { n: 0, gleich: 0, wir: 0, epic: 0 }, verlustAlle: { n: 0, gleich: 0, wir: 0, epic: 0 } };
const jeSpielerErl = new Map();
for (const f of dateien) {
  const id = f.slice(4, 36); const d = JSON.parse(fs.readFileSync(path.join(ordner, f), 'utf8'));
  const sp = new Map((d.spieler ?? []).map((p) => [p.id, p]));
  const schadenVon = new Map((d.schaden ?? []).map((x) => [x.id, x]));
  // Gesamter Verlust an Leben + Schild + Overshield nach dem Bus (wie DIAGVERLUST, aus den Verlaeufen der Ausgabe).
  const verlust = (pid) => {
    const zeiten = new Set(); for (const k of ['leben', 'schild', 'ueberschild']) for (const [t] of d[k]?.[pid] ?? []) zeiten.add(t);
    const w = (k, t, std) => { let v = std; for (const [tt, x] of d[k]?.[pid] ?? []) { if (tt <= t) v = x; else break; } return v; };
    let vor = null; let sum = 0;
    for (const t of [...zeiten].sort((a, b) => a - b)) { if (d.busAb != null && t < d.busAb) continue; const x = w('leben', t, 100) + w('schild', t, 0) + w('ueberschild', t, 0); if (vor !== null && x < vor) sum += vor - x; vor = x; }
    return sum;
  };
  for (const p of d.spieler ?? []) {
    if (!p.epic) continue;
    const st = epic.get(`${p.epic.toLowerCase()}|${id}`); if (!st || st.DamageReceived == null) continue;
    const soll = Number(st.DamageReceived); const x = schadenVon.get(p.id) ?? {};
    const nur = Math.round(x.genommenOhneBoden ?? x.genommen ?? 0);
    const sturm = Math.round(Number(d.extra?.[p.id]?.[17]) || 0);
    const alle = Math.round(verlust(p.id));
    for (const [k, ist] of [['nurSpieler', nur], ['mitSturm', nur + sturm], ['verlustAlle', alle]]) { const e = erl[k]; e.n++; e.wir += ist; e.epic += soll; if (Math.abs(ist - soll) <= 1) e.gleich++; }
    const j = jeSpielerErl.get(p.epic) ?? { name: p.name, epic: 0, nur: 0, sturm: 0, alle: 0 }; j.epic += soll; j.nur += nur; j.sturm += sturm; j.alle += alle; jeSpielerErl.set(p.epic, j);
  }
}
for (const [k, e] of Object.entries(erl)) console.log(`ERLITTEN ${k}: ${e.n} Spieler-Spiele, genau (±1) ${e.gleich}, Summe wir ${e.wir} / Epic ${e.epic} (${((e.wir - e.epic) / Math.max(1, e.epic) * 100).toFixed(2)} %)`);
for (const j of [...jeSpielerErl.values()].sort((a, b) => b.epic - a.epic)) console.log('ERLITTEN-SPIELER', JSON.stringify(j));
// Und der Schaden je Spieler ueber alle Matches (Epic gegen uns), damit alle Spieler des Spieltags dastehen.
const jeSpielerDmg = new Map();
for (const f of dateien) {
  const id = f.slice(4, 36); const d = JSON.parse(fs.readFileSync(path.join(ordner, f), 'utf8'));
  const sp = new Map((d.spieler ?? []).map((p) => [p.id, p]));
  const schadenVon = new Map((d.schaden ?? []).map((x) => [x.id, x]));
  for (const p of d.spieler ?? []) {
    if (!p.epic) continue;
    const st = epic.get(`${p.epic.toLowerCase()}|${id}`); if (!st || st.DamageDealt == null) continue;
    const j = jeSpielerDmg.get(p.epic) ?? { name: p.name, epic: 0, wir: 0, spiele: 0 }; j.epic += Number(st.DamageDealt); j.wir += Math.round(schadenVon.get(p.id)?.gemachtOhneBoden ?? schadenVon.get(p.id)?.gemacht ?? 0); j.spiele++; jeSpielerDmg.set(p.epic, j);
  }
}
for (const j of [...jeSpielerDmg.values()].sort((a, b) => b.epic - a.epic)) console.log('SCHADEN-SPIELER', JSON.stringify(j));
