// Diagnose (15.11.2026, exakt-mats-strecke): Strecke aus jedem ReplicatedMovement-Update (MS_SPUR des Lesers) gegen Epics Travel_Distance_Ground je Spieler und Match.
// Prueft mehrere Lesarten von "Ground" und zeigt je Lesart die Abweichung.
//   node scripts/diag-strecke-varianten.mjs <spur.json> <aus.json> <epic-sitzungen.json>
import fs from 'node:fs';
const [spurDatei, aus, epicDatei] = process.argv.slice(2);
const { spur, zust } = JSON.parse(fs.readFileSync(spurDatei, 'utf8'));
const d = JSON.parse(fs.readFileSync(aus, 'utf8'));
const epic = JSON.parse(fs.readFileSync(epicDatei, 'utf8'));
const match = String(d.match ?? '').toLowerCase();
const epicVon = {};
for (const e of epic) for (const s of e.sitzungen) if (String(s.id).toLowerCase() === match) epicVon[String(e.ids[0]).toLowerCase()] = (s.st?.Travel_Distance_Ground ?? 0) / 100;
const busAb = d.busAb ?? 0;

// Zustand zur Zeit t (letzte Aenderung <= t) je Feld.
function zustandsLeser(liste) {
  const je = {};
  for (const [t, n, v] of liste ?? []) (je[n] ??= []).push([t, v]);
  return (n, t) => { const l = je[n]; if (!l) return undefined; let a = undefined; for (const [tt, v] of l) { if (tt <= t) a = v; else break; } return a; };
}
const modusStrecke = {}; const feldWerte = {};
const VAR = ['2D alle', '3D alle', '2D Modus1', '3D Modus1', '2D Modus1+2', '2D ohne Fahrzeug', '2D v-Integral Modus1', '2D Modus1 ohne Fahrzeug', '2D Modus1 Pawn', '2D <=12m/s', '2D Modus!=3'];
const ergebnis = [];
for (const p of d.spieler ?? []) {
  const e = epicVon[String(p.epic).toLowerCase()]; const pts = spur[p.id]; if (e == null || !pts?.length) continue;
  const z = zustandsLeser(zust[p.id]);
  for (const [, n, v] of zust[p.id] ?? []) { feldWerte[n] ??= {}; feldWerte[n][v] = (feldWerte[n][v] ?? 0) + 1; }
  const v = new Array(VAR.length).fill(0); let spruenge = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b[0] < busAb || a[7] !== b[7]) continue;
    const dt = Math.max(b[0] - a[0], 0.001);
    const d2 = Math.hypot(b[1] - a[1], b[2] - a[2]) / 100; const d3 = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / 100;
    if (d2 / dt > 120) { spruenge++; continue; }
    const modus = String(z('ReplicatedMovementMode', a[0]) ?? '?');
    const fahrzeug = (z('Vehicle', a[0]) ?? '0') !== '0';
    modusStrecke[modus] = (modusStrecke[modus] ?? 0) + d2;
    v[0] += d2; v[1] += d3;
    if (modus === '1') { v[2] += d2; v[3] += d3; v[6] += Math.hypot(a[4], a[5]) / 100 * dt; if (!fahrzeug) v[7] += d2; }
    if (modus === '1' || modus === '2') v[4] += d2;
    if (!fahrzeug) v[5] += d2;
    if (modus === '1' && d2 / dt <= 12) v[9] += d2;
    if (modus !== '3') v[10] += d2;
  }
  ergebnis.push({ name: p.name, e, v, spruenge, n: pts.length });
}
console.log('VARIANTE Modus-Strecke (m, alle Spieler)', JSON.stringify(Object.fromEntries(Object.entries(modusStrecke).map(([k, x]) => [k, Math.round(x)]))));
console.log('VARIANTE Feldwerte', JSON.stringify(feldWerte).slice(0, 1500));
for (let k = 0; k < VAR.length; k++) {
  const r = ergebnis.filter((x) => x.e > 50).map((x) => x.v[k] / x.e).sort((a, b) => a - b);
  if (!r.length) continue;
  const ab = r.map((x) => Math.abs(1 - x));
  console.log('VARIANTE', VAR[k].padEnd(26), 'Spieler', r.length, 'Median', r[r.length >> 1].toFixed(4), 'min', r[0].toFixed(4), 'max', r[r.length - 1].toFixed(4), 'mittl.|Abw|', (ab.reduce((s, x) => s + x, 0) / ab.length * 100).toFixed(2) + '%', '<=0,1%', ab.filter((x) => x <= 0.001).length, '<=1%', ab.filter((x) => x <= 0.01).length);
}
// Fuer die Anpassung: je Spieler die Strecke je Modus (2D/3D), vor und nach der ersten Landung, dt = 0 mitgezaehlt, Spruenge ueber 30 m je Update getrennt.
for (const p of d.spieler ?? []) {
  const e = epicVon[String(p.epic).toLowerCase()]; const pts = spur[p.id]; if (e == null || !pts?.length) continue;
  const z = zustandsLeser(zust[p.id]); const k = {}; let gelandet = false; let sprung = 0, sprungM = 0; const leben = []; const spr = []; let kanal = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (b[0] < busAb || a[7] !== b[7]) continue;
    if (b[7] !== kanal) { kanal = b[7]; leben.push([Math.round(b[0]), 0]); gelandet = false; }
    leben[leben.length - 1][1] = Math.round(b[0]);
    const d2 = Math.hypot(b[1] - a[1], b[2] - a[2]) / 100; const d3 = Math.hypot(b[1] - a[1], b[2] - a[2], b[3] - a[3]) / 100;
    if (d3 > 30) { sprung++; sprungM += d2; if (spr.length < 25) spr.push([Math.round(a[0]), Math.round((b[0] - a[0]) * 100) / 100, Math.round(d2), String(z('ReplicatedMovementMode', a[0]) ?? '?')]); const jk = 'J' + (gelandet ? 'n' : 'v') + String(z('ReplicatedMovementMode', a[0]) ?? '?'); const jx = k[jk] ??= [0, 0]; jx[0] += d2; jx[1] += d3; continue; }
    const modus = String(z('ReplicatedMovementMode', a[0]) ?? '?');
    if (modus === '1') gelandet = true;
    const fz = (z('Vehicle', a[0]) ?? '0') !== '0' ? 'F' : '';
    const key = 'L' + (leben.length - 1) + (gelandet ? 'n' : 'v') + modus + fz;
    const x = k[key] ??= [0, 0]; x[0] += d2; x[1] += d3;
  }
  console.log('FIT', JSON.stringify({ m: match.slice(0, 6), n: p.name, e: Math.round(e * 10) / 10, sprung, sprungM: Math.round(sprungM), leben, spr, tod: (d.feed ?? []).filter((f) => f.opfer === p.id).map((f) => [Math.round(f.t), f.ursache]), platz: p.platz, k: Object.fromEntries(Object.entries(k).map(([a, b]) => [a, b.map((y) => Math.round(y * 10) / 10)])) }));
}
for (const x of ergebnis.slice(0, 40)) console.log('VARIANTE-SPIELER', x.name, 'epic', Math.round(x.e), x.v.map((y, i) => `${i}:${(y / x.e).toFixed(4)}`).join(' '), 'spruenge', x.spruenge, 'n', x.n);
