// Diagnose (15.11.2026, exakt-mats-strecke): jede Mats-Zunahme je Spieler und Match zerlegen und als Zeile ausgeben (JSON je Zeile).
// Quelle: MS_DIAG-Ausgabe des Lesers (msDiag.inv = jede Mengen-Aenderung im Inventar, msDiag.pickups/pickupMenge = Aufheben samt exakter Menge des Pickups).
//   node scripts/diag-ms-zerlegen.mjs <aus.json> >> zeilen.jsonl
// Felder je Zeile (Arrays immer [Holz, Stein, Metall]):
//   plus = Summe aller Zunahmen im Inventar; minus = Summe aller Abnahmen
//   auf = davon durch Aufheben, aufQ = je Quelle (kiste, boden, selbst, andere, unbekannt)
//   hacke = Rest mit Spitzhackenschlag (-2 s/+0,6 s) oder Spitzhacke in der Hand; respawn = Rest im Moment einer neuen Figur (Reload)
//   rueck = Rest in Zehnern bis 2 s nach einem Minus (abgebrochener Bau); offen = was keiner Quelle zuzuordnen ist, offenListe = Beispiele
//   teile = gesetzte Bauteile laut Bau-Akteuren (extra 14-16), invTeile = Minus in Zehnern unter 70 abzueglich Rueckgaben
import fs from 'node:fs';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const m = d.msDiag;
if (!m) { console.error('kein msDiag in', process.argv[2]); process.exit(1); }
const STOFFNAME = ['Wood', 'Stone', 'Metal'];
const busAb = d.busAb ?? 0;
const wurzelSpieler = {};
for (const [w, l] of Object.entries(m.wurzelFigur)) { const s = l.find((x) => x >= 0); if (s !== undefined) wurzelSpieler[w] = s; }

// Pickups je Kanal/Akteur
const pk = new Map();
for (const r of m.pickups) {
  const [t, kanal, akteur, nm, , A, B, , , ziel, , kiste, wer] = r;
  const key = `${kanal}|${akteur}`;
  const e = pk.get(key) ?? { kanal, akteur, nm, t0: t, kiste: false, fallen: null, ziel: null, tAuf: null };
  if (kiste) e.kiste = true;
  if (wer != null) e.fallen = wer;
  if (ziel != null && e.ziel == null) { e.ziel = ziel; e.tAuf = t; }
  pk.set(key, e);
}
const lesungen = new Map();
for (const r of m.pickupMenge ?? []) { if (typeof r[3] !== 'number') continue; (lesungen.get(r[1]) ?? lesungen.set(r[1], []).get(r[1])).push(r); }
const aufgehoben = [...pk.values()].filter((e) => typeof e.ziel === 'number' && e.ziel >= 0);

// Inventar-Schritte je Spieler
const schritte = {}; const stand = {};
for (const r of m.inv.slice().sort((a, b) => a[0] - b[0])) {
  const w = String(r[1]); const sid = wurzelSpieler[w]; if (sid === undefined) continue;
  const key = `${w}:${r[2]}:${r[3]}`; const alt = stand[key] ?? 0; stand[key] = r[5];
  if (r[5] !== alt) (schritte[sid] ??= []).push({ t: r[0], s: r[4], d: r[5] - alt, neu: r[5] });
}
// Spitzhacken-Einschlaege
const handName = (sid, t) => { const h = d.hand?.[sid] ?? []; let k = -1; for (let i = 0; i < h.length && h[i][0] <= t; i++) k = i; return k >= 0 ? String(d.waffenNamen[h[k][1]] ?? '') : ''; };
const axt = {};
for (const s of d.schuesse ?? []) if (/Pickaxe|Melee/i.test(handName(s[1], s[0]))) (axt[s[1]] ??= []).push(s[0]);
const nahe = (l, a, b) => (l ?? []).some((x) => x >= a && x <= b);
const name = Object.fromEntries(d.spieler.map((p) => [p.id, p]));

for (const [sid, l] of Object.entries(schritte)) {
  const p = name[sid]; if (!p || p.bot) continue;
  const pool = [];
  for (const e of aufgehoben.filter((x) => x.ziel === Number(sid))) {
    const s = STOFFNAME.findIndex((x) => e.nm.startsWith(x)); if (s < 0) continue;
    const ls = lesungen.get(e.kanal) ?? [];
    // Die Menge des Pickups: hoechste Lesung desselben Akteurs bis 1,5 s nach dem Aufheben. Hingeworfene Stapel verschmelzen (bCombinePickupsWhenTossCompletes),
    // die verschmolzene Menge kommt oft erst nach dem Aufheben an (05d996d5, faded: Lesung 50 bei 1702,66, Aufheben 1703,06, Lesung 520 bei 1703,16, Inventar +418 auf 500).
    const ms = ls.filter((r) => r[2] === e.akteur && r[0] <= e.tAuf + 1.5).map((r) => r[3]);
    const quelle = e.kiste ? 'kiste' : e.fallen == null ? 'boden' : e.fallen === Number(sid) ? 'selbst' : (typeof e.fallen === 'number' && e.fallen >= 0 ? 'andere' : 'unbekannt');
    const spaet = ls.filter((r) => r[2] === e.akteur).map((r) => r[3]);
    pool.push({ s, t: e.tAuf, rest: ms.length ? Math.max(...ms) : spaet.length ? Math.max(...spaet) : null, quelle, ohne: !ms.length && !spaet.length });
  }
  const z = () => [0, 0, 0];
  const r = { match: d.match, id: Number(sid), epic: String(p.epic ?? '').toLowerCase(), name: p.name, team: p.team, platz: p.platz, plus: z(), minus: z(), auf: z(), aufQ: {}, hacke: z(), hackeFenster: z(), respawn: z(), rueck: z(), offen: z(), vorBus: z(), aufOhneMenge: z(), offenListe: [], ohneMenge: pool.filter((x) => x.rest == null).length };
  const figurAb = (d.figuren ?? []).filter((f) => f.id === Number(sid)).map((f) => f.t).slice(1);
  for (let i = 0; i < l.length; i++) {
    const x = l[i];
    if (x.d < 0) { r.minus[x.s] += -x.d; continue; }
    if (x.t < busAb) { r.vorBus[x.s] += x.d; continue; }
    r.plus[x.s] += x.d; let rest = x.d;
    for (const q of pool) {
      if (rest <= 0) break;
      if (q.ohne && q.s === x.s && q.rest == null && x.t - q.t >= -2.5 && x.t - q.t <= 2.5) { r.aufOhneMenge[x.s] += rest; r.auf[x.s] += rest; (r.aufQ[q.quelle] ??= z())[x.s] += rest; rest = 0; q.rest = 0; break; }
      if (q.s !== x.s || !(q.rest > 0) || x.t - q.t < -2.5 || x.t - q.t > 2.5) continue;
      const k = Math.min(rest, q.rest); q.rest -= k; rest -= k; r.auf[x.s] += k; (r.aufQ[q.quelle] ??= z())[x.s] += k;
    }
    if (rest <= 0) continue;
    if (figurAb.some((f) => x.t - f >= -0.3 && x.t - f <= 1)) { r.respawn[x.s] += rest; continue; }
    const rueck = rest % 10 === 0 && l.slice(Math.max(0, i - 8), i).some((y) => y.s === x.s && y.d < 0 && x.t - y.t <= 2);
    const fenster = nahe(axt[sid], x.t - 2, x.t + 0.6);
    if (fenster || /Pickaxe|Melee/i.test(handName(sid, x.t))) { r.hacke[x.s] += rest; (r.hackeSchritte ??= []).push(rest); if (fenster) r.hackeFenster[x.s] += rest; continue; }
    if (rueck) { r.rueck[x.s] += rest; continue; }
    r.offen[x.s] += rest; (r.offenAlle ??= []).push([Math.round(x.t * 100) / 100, x.s, rest, x.d, handName(sid, x.t).split('/').pop().slice(0, 30), Math.min(...(axt[sid] ?? [Infinity]).map((h) => Math.round((x.t - h) * 100) / 100).filter((v) => v > 0)), pool.filter((q) => q.s === x.s && Math.abs(x.t - q.t) < 5).map((q) => [Math.round((x.t - q.t) * 100) / 100, q.rest, q.quelle])]); if (r.offenListe.length < 6) r.offenListe.push([x.t, STOFFNAME[x.s], rest, x.neu, handName(sid, x.t).split('/').pop().slice(0, 40)]);
  }
  const x = d.extra?.[sid];
  r.teile = x ? [x[14], x[15], x[16]] : null;
  r.heuteFarm = x ? [x[9], x[10], x[11]] : null; r.heuteSam = x ? [x[6], x[7], x[8]] : null;
  const inv = z(); for (const y of l) if (y.d < 0 && -y.d < 70 && y.d % 10 === 0) inv[y.s] += -y.d / 10;
  for (let i = 0; i < l.length; i++) { const y = l[i]; if (y.d > 0 && y.d % 10 === 0 && l.slice(Math.max(0, i - 8), i).some((w) => w.s === y.s && w.d < 0 && y.t - w.t <= 2)) inv[y.s] -= y.d / 10; }
  r.invTeile = inv;
  console.log(JSON.stringify(r));
}
