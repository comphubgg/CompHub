// Abgleich alter gegen neuer Leser (tools/replay-voll-alt = Bibliothek 3.0.0, tools/replay-voll = 3.2.0) an echten Replays - nur auf einem Probezweig.
//   node scripts/abgleich-leser.mjs <eventId> <windowId> <anzahl> [seiten]
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
import { execFile } from 'node:child_process'; import { promisify } from 'node:util'; import { createRequire } from 'node:module';
import { schadenAus } from '../lib/vollSchaden.mjs';
import { matchIds } from '../lib/replayKern.mjs';

const lauf = promisify(execFile);
const [eventId, windowId, anzahlS, seitenS] = process.argv.slice(2);
const require = createRequire(import.meta.url);
const { downloadReplay } = require('fortnite-serverreplay-downloader');
const DLL = (o) => path.join(process.cwd(), 'tools', o, 'bin', 'Release', 'net10.0', 'ReplayVollReplayReader.dll');
const ALT = DLL('replay-voll-alt'); const NEU = DLL('replay-voll');
const AUS = path.join(process.cwd(), 'abgleich-aus'); fs.mkdirSync(AUS, { recursive: true });

async function lies(dll, datei) {
  const s = Date.now();
  try {
    const { stdout, stderr } = await lauf('dotnet', [dll, datei], { maxBuffer: 1024 * 1024 * 1024, timeout: 400_000, env: { ...process.env, REPLAY_SEKUNDEN: '300' } });
    return { v: JSON.parse(stdout), sek: (Date.now() - s) / 1000, err: stderr.trim().split('\n').filter(Boolean).slice(0, 4) };
  } catch (e) { return { v: null, sek: (Date.now() - s) / 1000, err: [String(e.message).slice(0, 300)] }; }
}

const ids = (await matchIds(eventId, windowId, Number(seitenS) || 3)).sort().slice(0, Number(anzahlS) || 20);
console.log(`${ids.length} Matches`);
const metr = new Map(); // name -> {n, gleich, altSum, neuSum, maxAbw, bsp}
const m = (name, a, b, wo) => {
  const x = metr.get(name) ?? { n: 0, gleich: 0, altSum: 0, neuSum: 0, maxAbw: 0, bsp: '', nurAlt: 0, nurNeu: 0 }; metr.set(name, x);
  x.n += 1;
  if (a == null && b != null) x.nurNeu += 1; if (b == null && a != null) x.nurAlt += 1;
  const na = typeof a === 'number' ? a : null; const nb = typeof b === 'number' ? b : null;
  if (JSON.stringify(a) === JSON.stringify(b)) { x.gleich += 1; } else {
    const abw = na != null && nb != null ? Math.abs(na - nb) : Infinity;
    if (abw >= x.maxAbw) { x.maxAbw = abw; x.bsp = `${wo}: ${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)}`; }
  }
  if (na != null) x.altSum += na; if (nb != null) x.neuSum += nb;
};
const abschnitt = new Map(); // Schluessel der Ausgabe -> [gleich, verschieden]
const zeiten = { alt: 0, neu: 0 }; let verglichen = 0; const fehler = [];
const waffe = { treffer: 0, mitWaffe: 0, passtHand: 0, mitHand: 0 };

for (const id of ids) {
  const datei = path.join(os.tmpdir(), `${id}.replay`);
  let ok = false;
  for (let v = 0; v < 3 && !ok; v += 1) {
    try { fs.writeFileSync(datei, await downloadReplay({ matchId: id, dataCount: 100000, checkpointCount: 0, eventCount: 100000 })); ok = true; } catch (e) { console.log(id, 'Laden', String(e.message).slice(0, 80)); await new Promise((r) => setTimeout(r, 5000)); }
  }
  if (!ok) { fehler.push(`${id} Laden`); continue; }
  const [a, b] = [await lies(ALT, datei), await lies(NEU, datei)];
  fs.rmSync(datei, { force: true });
  zeiten.alt += a.sek; zeiten.neu += b.sek;
  console.log(`${id.slice(0, 8)} alt ${a.sek.toFixed(1)} s ${a.v ? 'ok' : 'FEHLER'} | neu ${b.sek.toFixed(1)} s ${b.v ? 'ok' : 'FEHLER'} ${[...a.err.map((x) => `alt: ${x}`), ...b.err.map((x) => `neu: ${x}`)].join(' / ').slice(0, 400)}`);
  if (!a.v || !b.v) { fehler.push(`${id} alt=${Boolean(a.v)} neu=${Boolean(b.v)}`); if (b.v) fs.writeFileSync(path.join(AUS, `${id}.neu.json`), JSON.stringify(b.v)); continue; }
  verglichen += 1;
  // Die Waffe je Treffer gibt es nur neu - fuer den Abschnittsvergleich abschneiden, getrennt pruefen.
  const trNeu = b.v.treffer ?? [];
  b.v.treffer = trNeu.map((t) => t.slice(0, 8));
  for (const k of new Set([...Object.keys(a.v), ...Object.keys(b.v)])) {
    if (k === 'fassung' || k === 'waffenNamen') continue;
    const g = JSON.stringify(a.v[k]) === JSON.stringify(b.v[k]);
    const z = abschnitt.get(k) ?? [0, 0]; z[g ? 0 : 1] += 1; abschnitt.set(k, z);
  }
  // Waffennamen: die alten muessen vorne gleich sein (neue nur angehaengt).
  const wa = a.v.waffenNamen ?? []; const wb = b.v.waffenNamen ?? [];
  m('waffenNamen Praefix gleich', 1, JSON.stringify(wa) === JSON.stringify(wb.slice(0, wa.length)) ? 1 : 0, id.slice(0, 8));
  // Je Spieler: was Cup-Statistiken tragen.
  const sa = schadenAus(a.v) ?? {}; const sb = schadenAus(b.v) ?? {};
  for (const k of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
    for (const f of new Set([...Object.keys(sa[k] ?? {}), ...Object.keys(sb[k] ?? {})])) m(`spieler.${f}`, sa[k]?.[f], sb[k]?.[f], `${id.slice(0, 8)}/${k.slice(0, 6)}`);
  }
  const pa = new Map((a.v.spieler ?? []).map((p) => [p.id, p])); const pb = new Map((b.v.spieler ?? []).map((p) => [p.id, p]));
  for (const pid of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(pid); const y = pb.get(pid); const wo = `${id.slice(0, 8)}/${pid}`;
    for (const f of ['epic', 'team', 'platz', 'kills', 'tod', 'todX', 'todY', 'todUrsache', 'bot']) m(`roh.${f}`, x?.[f], y?.[f], wo);
    m('landung', a.v.landung?.[pid], b.v.landung?.[pid], wo);
    m('streckeBoden', a.v.streckeBoden?.[pid], b.v.streckeBoden?.[pid], wo);
    m('orte (Anzahl)', a.v.orte?.[pid]?.length ?? 0, b.v.orte?.[pid]?.length ?? 0, wo);
    m('leben (Anzahl)', a.v.leben?.[pid]?.length ?? 0, b.v.leben?.[pid]?.length ?? 0, wo);
    m('schild (Anzahl)', a.v.schild?.[pid]?.length ?? 0, b.v.schild?.[pid]?.length ?? 0, wo);
    m('hand (Anzahl)', a.v.hand?.[pid]?.length ?? 0, b.v.hand?.[pid]?.length ?? 0, wo);
  }
  for (const t of new Set([...(a.v.bau ?? []).map((x) => x.team), ...(b.v.bau ?? []).map((x) => x.team)])) {
    const x = (a.v.bau ?? []).find((q) => q.team === t); const y = (b.v.bau ?? []).find((q) => q.team === t);
    for (const f of ['holz', 'stein', 'metall', 'wand', 'boden', 'treppe', 'dach', 'sonst', 'bearbeitet']) m(`bau.${f}`, x?.[f] ?? 0, y?.[f] ?? 0, `${id.slice(0, 8)}/t${t}`);
  }
  m('match.feed', a.v.feed?.length, b.v.feed?.length, id.slice(0, 8));
  m('match.treffer', a.v.treffer?.length, b.v.treffer?.length, id.slice(0, 8));
  m('match.zonen', a.v.zonen?.length, b.v.zonen?.length, id.slice(0, 8));
  m('match.schadenEreignisse', a.v.schadenEreignisse, b.v.schadenEreignisse, id.slice(0, 8));
  m('match.laenge', a.v.laenge, b.v.laenge, id.slice(0, 8));
  // Waffe je Treffer gegen die Waffe in der Hand im selben Moment.
  for (const t of trNeu) {
    waffe.treffer += 1;
    if (!(t[8] >= 0)) continue;
    waffe.mitWaffe += 1;
    const h = (b.v.hand?.[t[1]] ?? []).filter((x) => x[0] <= t[0] + 0.05).at(-1);
    if (h) { waffe.mitHand += 1; if (wb[h[1]] === wb[t[8]]) waffe.passtHand += 1; }
  }
  fs.writeFileSync(path.join(AUS, `${id}.alt.json`), JSON.stringify(a.v)); fs.writeFileSync(path.join(AUS, `${id}.neu.json`), JSON.stringify({ ...b.v, treffer: trNeu }));
}

console.log(`\nVERGLICHEN ${verglichen} Matches; Lesezeit alt ${zeiten.alt.toFixed(0)} s, neu ${zeiten.neu.toFixed(0)} s; Fehler: ${fehler.join('; ') || 'keine'}`);
console.log('\nABSCHNITTE (gleich/verschieden):');
for (const [k, [g, v]] of [...abschnitt].sort()) console.log(`  ${k.padEnd(24)} ${g}/${v}`);
console.log('\nMETRIK | n | gleich | Summe alt | Summe neu | max Abw | nur alt | nur neu | Beispiel');
for (const [k, x] of [...metr].sort()) console.log(`  ${k} | ${x.n} | ${x.gleich} | ${Math.round(x.altSum * 10) / 10} | ${Math.round(x.neuSum * 10) / 10} | ${x.maxAbw === Infinity ? 'inf' : Math.round(x.maxAbw * 100) / 100} | ${x.nurAlt} | ${x.nurNeu} | ${x.bsp}`);
console.log(`\nWAFFE je Treffer: ${waffe.treffer} Treffer, mit Waffe ${waffe.mitWaffe}, davon mit Hand-Eintrag ${waffe.mitHand}, Hand passt ${waffe.passtHand}`);
