// Diagnose (15.11.2026, exakt-mats-strecke): MS_DIAG-Ausgabe des Lesers - jede Mengen-Aenderung von Holz/Stein/Metall je Spieler einordnen (Pickup, Spitzhacke, Rest).
//   node scripts/diag-mats.mjs <aus.json> [spielername-muster]
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const muster = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const m = d.msDiag;
const name = Object.fromEntries(d.spieler.map((p) => [p.id, p.name]));
const STOFF = ['Holz', 'Stein', 'Metall'];

// 1) Wurzeln: welche gehoeren Spielern, welche nicht (Pfade)?
const wurzelSpieler = {};
for (const [w, l] of Object.entries(m.wurzelFigur)) { const s = l.find((x) => x >= 0); if (s !== undefined) wurzelSpieler[w] = s; }
const pfade = {};
for (const r of m.inv) { const w = String(r[1]); const k = wurzelSpieler[w] !== undefined ? 'SPIELER' : (r[6] ?? '?'); pfade[k] = (pfade[k] ?? 0) + 1; }
console.log('INV Zeilen', m.inv.length, 'nach Wurzel-Art', JSON.stringify(pfade).slice(0, 600));

// 2) Pickups: welche Felder sind ueberhaupt belegt?
const belegt = {};
const FELD = ['t', 'kanal', 'akteur', 'name', 'Count', 'A', 'B', 'C', 'D', 'PickupTarget', 'bPickedUp', 'bTossedFromContainer', 'PawnWhoDropped', 'Owner', 'ItemOwner', 'OptionalOwnerID', 'bCombine', 'CombineTarget'];
for (const r of m.pickups) r.forEach((v, i) => { if (v !== null && v !== undefined) belegt[FELD[i]] = (belegt[FELD[i]] ?? 0) + 1; });
console.log('PICKUP Zeilen', m.pickups.length, 'belegt', JSON.stringify(belegt));

// Je Pickup-Kanal: Material, Herkunft (Kiste / fallen gelassen von / Boden), aufgehoben von wem und wann.
const pk = new Map();
for (const r of m.pickups) {
  const [t, kanal, akteur, nm, count, A, B, C, D, ziel, auf, kiste, wer] = r;
  const key = `${kanal}|${akteur}`;
  const e = pk.get(key) ?? { kanal, akteur, nm, t0: t, counts: [], kiste: false, fallen: null, ziel: null, tAuf: null, A, B };
  if (count != null) e.counts.push(count);
  if (kiste) e.kiste = true;
  if (wer != null) e.fallen = wer;
  if (ziel != null && e.ziel == null) { e.ziel = ziel; e.tAuf = t; }
  if (A != null) { e.A = A; e.B = B; }
  pk.set(key, e);
}
const aufgehoben = [...pk.values()].filter((e) => typeof e.ziel === 'number' && e.ziel >= 0);
console.log('PICKUP Kanaele', pk.size, 'aufgehoben von Spielern', aufgehoben.length, 'mit Count', aufgehoben.filter((e) => e.counts.length).length);

// Inventar der Pickups selbst (Wurzel = Akteur des Pickups?)
const invVon = new Map();
for (const r of m.inv) { const w = String(r[1]); if (wurzelSpieler[w] !== undefined) continue; (invVon.get(w) ?? invVon.set(w, []).get(w)).push(r); }
let treffer = 0; for (const e of aufgehoben) if (invVon.has(String(e.akteur))) treffer++;
console.log('PICKUP mit eigenem Inventar (Wurzel = Akteur)', treffer, 'von', aufgehoben.length);

// 3) Spieler: Schritte je Material.
const schritte = {};
const stand = {};
for (const r of m.inv.slice().sort((a, b) => a[0] - b[0])) {
  const w = String(r[1]); const sid = wurzelSpieler[w]; if (sid === undefined) continue;
  const key = `${w}:${r[2]}:${r[3]}`; const alt = stand[key] ?? 0; stand[key] = r[5];
  if (r[5] !== alt) (schritte[sid] ??= []).push({ t: r[0], s: r[4], d: r[5] - alt, neu: r[5], key });
}
// Spitzhacken-Einschlaege je Spieler (aus schuesse + hand)
const axt = {};
for (const s of d.schuesse ?? []) {
  const h = d.hand?.[s[1]] ?? []; let k = -1; for (let i = 0; i < h.length && h[i][0] <= s[0]; i++) k = i;
  const wn = k >= 0 ? d.waffenNamen[h[k][1]] ?? '' : '';
  if (/Pickaxe|Melee/i.test(wn)) (axt[s[1]] ??= []).push(s[0]);
}
const nahe = (l, a, b) => (l ?? []).some((x) => x >= a && x <= b);
const sum = {};
for (const [sid, l] of Object.entries(schritte)) {
  if (muster && !muster.test(name[sid] ?? '')) continue;
  const z = sum[sid] = { plus: [0, 0, 0], minus: [0, 0, 0], auf: [0, 0, 0], axt: [0, 0, 0], beides: [0, 0, 0], rest: [0, 0, 0], restListe: [] };
  const auf = aufgehoben.filter((e) => e.ziel === Number(sid));
  for (const x of l) {
    if (x.d < 0) { z.minus[x.s] += -x.d; continue; }
    z.plus[x.s] += x.d;
    const istAuf = auf.some((e) => e.nm.startsWith(['Wood', 'Stone', 'Metal'][x.s]) && x.t - e.tAuf >= -0.3 && x.t - e.tAuf <= 1.5);
    const istAxt = nahe(axt[sid], x.t - 2, x.t + 0.6);
    if (istAuf && istAxt) z.beides[x.s] += x.d; else if (istAuf) z.auf[x.s] += x.d; else if (istAxt) z.axt[x.s] += x.d; else { z.rest[x.s] += x.d; if (z.restListe.length < 12) z.restListe.push([x.t, STOFF[x.s], x.d, x.neu]); }
  }
}
for (const [sid, z] of Object.entries(sum)) console.log('SPIELER', (name[sid] ?? sid).padEnd(20), 'plus', z.plus.join('/'), 'minus', z.minus.join('/'), '| auf', z.auf.join('/'), 'axt', z.axt.join('/'), 'beides', z.beides.join('/'), 'rest', z.rest.join('/'), JSON.stringify(z.restListe));
console.log('PAWN je Spieler [Updates, Location, RepMovement, Enc, EncBytes, LinVel, ReplayTS]', JSON.stringify(Object.entries(m.pawnZahl).slice(0, 6)));
console.log('ENC Proben', JSON.stringify(m.encProben.slice(0, 6)));

// 4) Exakte Pickup-Mengen (DataList des Pickups, MS_DIAG pickupMenge): je aufgehobenem Pickup die letzte Menge vor dem Aufheben, Abgleich mit dem Inventar.
const lesungen = new Map();
for (const r of m.pickupMenge ?? []) { if (typeof r[3] !== 'number') continue; (lesungen.get(r[1]) ?? lesungen.set(r[1], []).get(r[1])).push(r); }
const fehlend = (m.pickupMenge ?? []).filter((r) => typeof r[3] !== 'number').length;
console.log('MENGE Lesungen', (m.pickupMenge ?? []).length, 'ohne Menge', fehlend, 'Beispiele', JSON.stringify((m.pickupMenge ?? []).slice(0, 4)));
const STOFFNAME = ['Wood', 'Stone', 'Metal'];
const ergebnis = [];
const gesamt = { C: [0, 0, 0], P: [0, 0, 0], H: [0, 0, 0], R: [0, 0, 0], O: [0, 0, 0], quelle: {} };
for (const [sid, l] of Object.entries(schritte)) {
  // Pickups dieses Spielers mit uebertragener Menge = Stapel davor - Stapel danach (0, wenn der Pickup weg ist).
  const pool = [];
  for (const e of aufgehoben.filter((x) => x.ziel === Number(sid))) {
    const s = STOFFNAME.findIndex((x) => e.nm.startsWith(x)); if (s < 0) continue;
    const ls = lesungen.get(e.kanal) ?? [];
    const vor = ls.filter((r) => r[0] >= e.t0 - 0.05 && r[0] <= e.tAuf + 0.05).pop();
    const nach = ls.find((r) => r[0] > e.tAuf + 0.05 && r[0] <= e.tAuf + 3 && r[2] === e.akteur);
    const quelle = e.kiste ? 'kiste' : e.fallen == null ? 'boden' : e.fallen === Number(sid) ? 'selbst' : (typeof e.fallen === 'number' && e.fallen >= 0 ? 'andere' : 'fallenUnbekannt');
    pool.push({ s, t: e.tAuf, rest: vor ? vor[3] - (nach ? nach[3] : 0) : null, quelle });
  }
  const C = [0, 0, 0], P = [0, 0, 0], H = [0, 0, 0], R = [0, 0, 0], O = [0, 0, 0], q = {}, ohne = pool.filter((x) => x.rest == null).length, oListe = [];
  for (let i = 0; i < l.length; i++) {
    const x = l[i]; if (x.d <= 0) continue;
    C[x.s] += x.d; let rest = x.d;
    for (const pk of pool) {
      if (rest <= 0) break;
      if (pk.s !== x.s || !(pk.rest > 0) || x.t - pk.t < -0.3 || x.t - pk.t > 1.5) continue;
      const k = Math.min(rest, pk.rest); pk.rest -= k; rest -= k; P[x.s] += k; q[pk.quelle] = (q[pk.quelle] ?? 0) + k;
    }
    if (rest <= 0) continue;
    if (nahe(axt[sid], x.t - 2, x.t + 0.6)) { H[x.s] += rest; continue; }
    const rueck = rest % 10 === 0 && l.slice(Math.max(0, i - 8), i).some((y) => y.s === x.s && y.d < 0 && x.t - y.t <= 2);
    if (rueck) { R[x.s] += rest; continue; }
    O[x.s] += rest; if (oListe.length < 8) oListe.push([x.t, STOFFNAME[x.s], rest, x.neu]);
  }
  ergebnis.push({ sid, name: name[sid], C, P, H, R, O, q, ohne, oListe });
  for (const k of ['C', 'P', 'H', 'R', 'O']) for (let s = 0; s < 3; s++) gesamt[k][s] += ({ C, P, H, R, O })[k][s];
  for (const [k, v] of Object.entries(q)) gesamt.quelle[k] = (gesamt.quelle[k] ?? 0) + v;
}
for (const e of ergebnis.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))) console.log('EXAKT', (e.name ?? e.sid).padEnd(20), 'gesammelt', e.C.join('/'), 'aufgehoben', e.P.join('/'), 'spitzhacke', e.H.join('/'), 'rueckgabe', e.R.join('/'), 'unerklaert', e.O.join('/'), 'quellen', JSON.stringify(e.q), 'ohneMenge', e.ohne, JSON.stringify(e.oListe));
console.log('EXAKT-SUMME', JSON.stringify(gesamt));
// Leser-Werte von heute zum Vergleich (extra: Gesammelt 6-8, Gefarmt 9-11, Bauten 14-16)
for (const e of ergebnis.slice(0, 50)) { const x = d.extra?.[e.sid]; if (x) console.log('HEUTE', (e.name ?? e.sid).padEnd(20), 'farm', [9, 10, 11].map((i) => x[i]).join('/'), 'sam', [6, 7, 8].map((i) => x[i]).join('/'), 'bauten', [14, 15, 16].map((i) => x[i]).join('/')); }
console.log('FELDER', JSON.stringify(m.felder));
console.log('RM Proben', JSON.stringify((m.rmProben ?? []).slice(0, 12)));
