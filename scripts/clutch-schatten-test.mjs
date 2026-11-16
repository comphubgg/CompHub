// Probe fuer den Schatten beim Neu-Lesen eines Spieltags (scripts/clutch-zusammen.mjs, 16.11.2026).
//
// Spielt ein erzwungenes Neu-Lesen (neuAnfang) eines fertigen Spieltags durch die echten Skripte: Runde A mit drei Rechnern (der dritte schafft den Spieltag
// nicht), Sofort-Ablage nach jedem, Abschluss; dann der Plan fuer Runde B, Runde B bis zum letzten Rechner. Zwischen den Laeufen steht ein nachgebautes Release
// (ein Ordner; Marker ".weg" loeschen wie scripts/ablage-github.mjs). Geprueft wird, was die Seite zeigen wuerde - die Regeln von app/api/cup-stats (extraFuer:
// Schaden da und alle Spiele gelesen; Builds mit invSpiele) und app/api/cup-spieler (nichts bei "teilweise"): nie weniger Spieler mit Treffern, Builds, Damage
// und Epic-Werten als vor dem Neu-Lesen; nach dem letzten Rechner die neuen Werte (die Teile bringen je Zeile 7 Schaden mehr), Schatten weg, Lage passt.
//
//   node scripts/clutch-schatten-test.mjs                              ein erfundener Spieltag (4 Matches, 6 Spieler)
//   node scripts/clutch-schatten-test.mjs --aus <data-Ordner> <windowId>  ein echter: data/clutch, clutch-je, clutch-roh (z. B. mit ablage-github-holen.mjs geholt),
//                                                                       dann auch mit clutch-neu-rechnen.mjs und clutch-leben.mjs wie im Ablauf
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JE_SPALTEN, jeDatei, jeLesen, jeZeile } from '../lib/jeSpiel.mjs';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const echt = argv[0] === '--aus';
const arbeit = fs.mkdtempSync(path.join(os.tmpdir(), 'clutch-schatten-'));
const rel = path.join(arbeit, 'release');
let w = argv[2];
for (const o of ['clutch', 'clutch-je', 'clutch-roh']) fs.mkdirSync(path.join(rel, o), { recursive: true });
if (echt) {
  for (const o of ['clutch', 'clutch-je', 'clutch-roh']) fs.copyFileSync(path.join(argv[1], o, `${w}.json`), path.join(rel, o, `${w}.json`));
} else {
  // Ein erfundener, fertiger Spieltag.
  w = 'S43_SchattenProbe_EU';
  const hex = (n) => n.toString(16).padStart(32, '0');
  const ms = [1, 2, 3, 4].map((i) => hex(0xa000 + i));
  const sp = [1, 2, 3, 4, 5, 6].map((i) => hex(0xb000 + i));
  const alle = {}; const schaden = {}; const spiele = {};
  ms.forEach((m, mi) => sp.forEach((p, pi) => {
    if ((mi + pi) % 5 === 4) return; // nicht jeder spielt jedes Match
    const v = { dmg: 100 * (pi + 1) + mi, treffer: 10 + pi, erlitten: 50 + mi, krit: 1, selbstHolz: 20 + pi, selbstStein: 5, selbstMetall: 1, sturm: 3 };
    (alle[p] ??= []).push(jeZeile(m, v, 600, 900));
    const s = schaden[p] ?? { dmg: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0, selbstHolz: 0, selbstStein: 0, selbstMetall: 0, invSpiele: 0 };
    for (const k of Object.keys(v)) s[k] += v[k];
    s.invSpiele += 1; schaden[p] = s; spiele[p] = (spiele[p] ?? 0) + 1;
  }));
  const { inhalt, lage } = jeDatei(alle);
  fs.writeFileSync(path.join(rel, 'clutch-je', `${w}.json`), inhalt);
  fs.writeFileSync(path.join(rel, 'clutch', `${w}.json`), JSON.stringify({ version: 4, schadenFassung: 19, windowId: w, eventId: 'epicgames_S43_SchattenProbe', gesamt: ms.length,
    matches: ms.map((id) => ({ id, spieler: {} })), summe: {}, spiele, schaden, ohne: [], regeln: [], je: { spalten: JE_SPALTEN, lage, bytes: inhalt.length }, jeGeprueft: inhalt.length,
    gerechnet: new Date(Date.now() - 3 * 3600_000).toISOString() }));
  fs.writeFileSync(path.join(rel, 'clutch-roh', `${w}.json`), JSON.stringify({ windowId: w, matches: ms.map((id) => ({ id, alt: true, spieler: [], feed: [], figuren: [] })) }));
}
// Der Stand vor dem Neu-Lesen bekommt Epics Werte, wie nach epic-schaden-holen.mjs.
const vorher = JSON.parse(fs.readFileSync(path.join(rel, 'clutch', `${w}.json`), 'utf8'));
vorher.epicDmg = Object.fromEntries(Object.entries(vorher.schaden).map(([k, v]) => [k, v.dmg + 1000]));
vorher.epicKopf = Object.fromEntries(Object.keys(vorher.schaden).map((k) => [k, 3]));
vorher.epicZeit = Object.fromEntries(Object.keys(vorher.schaden).map((k) => [k, 999]));
vorher.epicDmgStand = '2026-11-16T07:00:00.000Z';
fs.writeFileSync(path.join(rel, 'clutch', `${w}.json`), JSON.stringify(vorher));

/* ---------- teile from the per-match rows: what a re-read with the new rule would bring (dmg +7 per row, so new values are visible) ---------- */
const je = jeLesen(fs.readFileSync(path.join(rel, 'clutch-je', `${w}.json`)));
const roh = JSON.parse(fs.readFileSync(path.join(rel, 'clutch-roh', `${w}.json`), 'utf8'));
const SUMMEN = JE_SPALTEN.filter((k) => !['leben', 'strecke', 'killsEcht', 'todeEcht', 'killsNachAus'].includes(k));
const iDmg = 1 + JE_SPALTEN.indexOf('dmg');
function beitrag(teil, m) {
  teil.matches.push({ id: m.id, spieler: m.spieler });
  for (const [k, v] of Object.entries(m.spieler ?? {})) teil.summe[k] = (teil.summe[k] ?? 0) + v;
  for (const [id, zeilen] of Object.entries(je)) {
    const z = zeilen.find((x) => x[0] === m.id);
    if (!z) continue;
    const zz = [...z]; if (typeof zz[iDmg] === 'number') zz[iDmg] += 7;
    (teil.jeSpiel[id] ??= []).push(zz);
    const s = teil.schaden[id] ?? { dmg: 0, erlitten: 0, treffer: 0, krit: 0, sturm: 0, wiederbelebt: 0, rebootet: 0 };
    for (const k of SUMMEN) { const v = zz[1 + JE_SPALTEN.indexOf(k)]; if (typeof v === 'number') s[k] = (s[k] ?? 0) + v; }
    if (typeof zz[1 + JE_SPALTEN.indexOf('selbstHolz')] === 'number') s.invSpiele = (s.invSpiele ?? 0) + 1;
    teil.schaden[id] = s;
    teil.spiele[id] = (teil.spiele[id] ?? 0) + 1;
    const l = zz[1 + JE_SPALTEN.indexOf('leben')]; if (typeof l === 'number') teil.leben[id] = (teil.leben[id] ?? 0) + l;
  }
  const r = roh.matches.find((x) => x.id === m.id); if (r) teil.roh.push({ ...r, alt: false });
}
const neuerTeil = (neuAnfang) => ({ eventId: vorher.eventId, windowId: w, regeln: vorher.regeln ?? [], gesamt: vorher.gesamt ?? vorher.matches.length,
  matches: [], ohne: [], summe: {}, spiele: {}, schaden: {}, solo: {}, leben: {}, plattform: {}, strecke: {}, roh: [], jeSpiel: {}, jeSpalten: true, fehler: [], neuAnfang });

/* ---------- the pipeline of one ablage job: release -> fresh data folder -> scripts -> upload (with .weg) ---------- */
function holen(data) {
  for (const o of ['clutch', 'clutch-roh', 'clutch-je', 'clutch-neu/clutch', 'clutch-neu/clutch-roh', 'clutch-neu/clutch-je']) {
    const q = path.join(rel, o); if (!fs.existsSync(q)) continue;
    for (const f of fs.readdirSync(q).filter((x) => x.endsWith('.json'))) { fs.mkdirSync(path.join(data, o), { recursive: true }); fs.copyFileSync(path.join(q, f), path.join(data, o, f)); }
  }
}
function hochladen(data) {
  const alle = []; const walk = (o) => { for (const e of fs.readdirSync(path.join(data, o), { withFileTypes: true })) { const n = o ? `${o}/${e.name}` : e.name; if (e.isDirectory()) walk(n); else alle.push(n); } };
  walk('');
  for (const n of alle.filter((x) => /^clutch(-roh|-je|-neu)?\//.test(x) && x.endsWith('.json') && !x.endsWith('.weg'))) {
    const z = path.join(rel, n); fs.mkdirSync(path.dirname(z), { recursive: true }); fs.copyFileSync(path.join(data, n), z);
  }
  for (const n of alle.filter((x) => x.endsWith('.weg'))) fs.rmSync(path.join(rel, n.slice(0, -4)), { force: true });
}
let jobNr = 0;
function ablegen(teile, { folge = echt } = {}) {
  const job = path.join(arbeit, `job${++jobNr}`); const data = path.join(job, 'data');
  fs.mkdirSync(path.join(data, 'clutch-teil'), { recursive: true });
  holen(data);
  teile.forEach((t, i) => fs.writeFileSync(path.join(data, 'clutch-teil', `${w}__${i}.json`), JSON.stringify(t)));
  const lauf = (s, a = []) => execFileSync(process.execPath, [path.join(repo, 'scripts', s), ...a], { cwd: job, env: { ...process.env, GITHUB_REPOSITORY: 'nicht/da' } }).toString().trim();
  const aus = [lauf('clutch-zusammen.mjs')];
  if (folge) for (const s of ['clutch-neu-rechnen.mjs', 'clutch-leben.mjs']) { try { aus.push(lauf(s).split('\n').slice(-1)[0]); } catch { aus.push(`${s} scheiterte`); } }
  hochladen(data);
  return aus.join('\n');
}

/* ---------- what the site would show: the rules of app/api/cup-stats extraFuer and app/api/cup-spieler ---------- */
const spieleVorher = vorher.spiele;
function seite() {
  const d = JSON.parse(fs.readFileSync(path.join(rel, 'clutch', `${w}.json`), 'utf8'));
  let treffer = 0; let builds = 0; let dmg = 0; let epic = 0; let neuWerte = 0;
  for (const [id, g] of Object.entries(spieleVorher)) {
    const s = d.schaden?.[id];
    if (!s || (d.spiele?.[id] ?? 0) < g) continue;
    if ((s.treffer ?? 0) > 0 || (s.erlitten ?? 0) > 0) treffer += 1;
    if (typeof s.selbstHolz === 'number' && (s.invSpiele ?? 0) >= g) builds += 1;
    if (!d.teilweise) dmg += 1;
    if (d.epicDmg?.[id] != null) epic += 1;
    if (s.dmg === vorher.schaden[id].dmg + 7 * g) neuWerte += 1;
  }
  return { matches: d.matches.length, teilweise: !!d.teilweise, treffer, builds, cupSpielerDmg: dmg, epic, neuWerte,
    rohNeu: (() => { try { return JSON.parse(fs.readFileSync(path.join(rel, 'clutch-roh', `${w}.json`), 'utf8')).matches.every((m) => m.alt === false); } catch { return null; } })(),
    schatten: fs.existsSync(path.join(rel, 'clutch-neu', 'clutch', `${w}.json`)), schattenJe: fs.existsSync(path.join(rel, 'clutch-neu', 'clutch-je', `${w}.json`)),
    jePasst: (() => { const b = fs.statSync(path.join(rel, 'clutch-je', `${w}.json`)).size; return d.je?.bytes === b; })() };
}

/* ---------- the scenario: run A with 3 runners (runner 3 times out with nothing for this day), run B finishes ---------- */
const ms = vorher.matches;
const A = [neuerTeil(true), neuerTeil(true)];
ms.forEach((m, i) => { if (i % 4 === 0) beitrag(A[0], m); else if (i % 4 === 1) beitrag(A[1], m); });
const B = [neuerTeil(false), neuerTeil(false)];
ms.forEach((m, i) => { if (i % 4 === 2) beitrag(B[0], m); else if (i % 4 === 3) beitrag(B[1], m); });

const zeilen = [['vor dem Neu-Lesen', seite()]];
const log = (t, o) => { zeilen.push([t, seite()]); if (process.env.LAUT) console.log(o); };
log('A: Sofort-Ablage nach Rechner 1', ablegen([A[0]]));
log('A: Sofort-Ablage nach Rechner 2', ablegen([A[0], A[1]]));
log('A: Abschluss der Runde', ablegen([A[0], A[1]]));
let planOk = false;
// Runde B: der Plan muss den Schatten sehen (die Matches aus A fertig, kein neues neuAnfang). must see the shadow (A's matches done, no new neuAnfang).
{
  const job = path.join(arbeit, 'plan'); const data = path.join(job, 'data'); holen(data);
  const t0 = Math.min(Date.now() - 3 * 3600_000, Date.parse(vorher.gerechnet) - 3600_000);
  fs.mkdirSync(path.join(data, 'epic-spieltage', 'S43'), { recursive: true });
  fs.writeFileSync(path.join(data, 'epic-spieltage', 'S43', `${w}.json`), JSON.stringify({ eventId: vorher.eventId, windowId: w, datum: t0 }));
  fs.writeFileSync(path.join(data, 'clutch', '_listen.json'), JSON.stringify({ [w]: { zeit: Date.now(), ids: ms.map((m) => m.id) } }));
  execFileSync(process.execPath, [path.join(repo, 'scripts', 'clutch-berechnen.mjs'), '--plan', path.join(data, 'plan.json'), '--minuten', '1'], { cwd: job, stdio: 'ignore', timeout: 120_000 });
  const p = JSON.parse(fs.readFileSync(path.join(data, 'plan.json'), 'utf8')).fenster.find((f) => f.windowId === w);
  const soll = ms.filter((m, i) => i % 4 >= 2).map((m) => m.id).sort();
    planOk = !!p && JSON.stringify(p.offen.sort()) === JSON.stringify(soll) && !p.neuAnfang;
  console.log(`Plan fuer Runde B: ${p ? `${p.offen.length} offen von ${p.gesamt}, neuAnfang ${p.neuAnfang}` : 'nichts offen'} - erwartet ${soll.length} offen, neuAnfang false: ${p && JSON.stringify(p.offen.sort()) === JSON.stringify(soll) && !p.neuAnfang ? 'OK' : 'FALSCH'}`);
}
log('B: Sofort-Ablage nach Rechner 1', ablegen([B[0]]));
log('B: Abschluss der Runde (letzter Rechner)', ablegen([B[0], B[1]]));
log('C: naechste Ablage ohne Teile', ablegen([]));

console.table(zeilen.map(([t, s]) => ({ Schritt: t, ...s })));
const v = zeilen[0][1];
const schlechter = zeilen.filter(([, s]) => s.treffer < v.treffer || s.builds < v.builds || s.cupSpielerDmg < v.cupSpielerDmg || s.epic < v.epic || s.teilweise);
const ende = zeilen[zeilen.length - 2][1];
const nachher = zeilen[zeilen.length - 1][1];
const ziel = Object.keys(spieleVorher).filter((id) => vorher.schaden[id]).length;
const vorEnde = zeilen.slice(1, -2).every(([, s]) => s.neuWerte === 0 && s.schatten && s.matches === v.matches);
const fehler = [
  ...(schlechter.length ? [`weniger Spieler mit Werten in: ${schlechter.map(([t]) => t).join(', ')}`] : []),
  ...(planOk ? [] : ['Plan fuer Runde B sieht den Schatten nicht']),
  ...(vorEnde ? [] : ['vor dem letzten Rechner hat sich die Datei am Release geaendert (oder der Schatten fehlt)']),
  ...(ende.neuWerte === ziel ? [] : [`nach dem letzten Rechner ${ende.neuWerte} von ${ziel} Spielern mit neuen Werten`]),
  ...(!ende.schatten && !ende.schattenJe && ende.jePasst ? [] : ['Schatten nicht geloescht oder Lage passt nicht zu clutch-je']),
  ...(ende.rohNeu ? [] : ['clutch-roh ist nicht die des Neu-Lesens']),
  ...(JSON.stringify(nachher) === JSON.stringify(ende) ? [] : ['die naechste Ablage ohne Teile aendert den Stand']),
];
fs.rmSync(arbeit, { recursive: true, force: true });
if (fehler.length) { for (const f of fehler) console.log(`FEHLER: ${f}`); process.exit(1); }
console.log(`ok - nie weniger Spieler mit Treffern/Builds/Damage/Epic-Werten (${v.treffer}/${v.builds}/${v.cupSpielerDmg}/${v.epic}); neue Werte erst nach dem letzten Rechner, Schatten danach geloescht`);
