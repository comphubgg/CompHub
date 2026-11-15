// Abgleich der Live-Spur (scripts/live-spur.mjs) gegen den massgeblichen Stand vom Release - der Beweis, bevor die Seite je einen Live-Wert zeigt.
//
// Nur die Teile des Servers (COMPHUB_LIVE_ORT/teil/<w> und archiv/<w>) werden auf einer LEEREN Grundlage mit dem unveraenderten clutch-zusammen.mjs
// zusammengefuehrt (dazu clutch-neu-rechnen / clutch-leben, wie im Ablauf "ablegen", wo Rohdaten da sind) und mit clutch/<w>.json und
// clutch-je/<w>.json vom Release verglichen:
//   - die Matches: beide, nur Server, nur Release;
//   - je Match die Clutch-Punkte je Spieler;
//   - jede Zeile je Spieler und Match (clutch-je, jede Spalte);
//   - je Spieler, dessen Spiele alle in beiden stehen: spiele, summe, solo, leben, strecke, plattform und jedes Feld von schaden (killsEcht, farm*,
//     selbst*, sturm ...).
// Ganze Zahlen muessen genau stimmen, Kommazahlen auf 1e-9 (relativ). Ausgabe nach Feld und nach Match; Rueckgabe 1, wenn etwas abweicht.
// Dazu (B) die Stufenprobe fuer den Live-Stand: halbe Teile als Grundlage, die andere Haelfte darauf - muss dasselbe ergeben wie alle auf einmal.
//
//   node scripts/live-abgleich.mjs <windowId> [--beispiele 10]

import { JE_SPALTEN, jeLesen } from '../lib/jeSpiel.mjs';
import { LIVE_ORT, liesTeil, releaseDatei, teilIds, zusammenfuehren } from '../lib/liveAblage.mjs';

const arg = process.argv.slice(2);
const w = arg.find((a) => !a.startsWith('--'));
const BEISPIELE = Number(arg[arg.indexOf('--beispiele') + 1]) || 10;
if (!w) { console.log('Aufruf: node scripts/live-abgleich.mjs <windowId>'); process.exit(2); }

/* --------------------------------------------- die Teile des Servers allein */

const ids = [...teilIds(LIVE_ORT, w).keys()];
if (!ids.length) { console.log(`${w}: keine Teile unter ${LIVE_ORT}`); process.exit(2); }
const stempel = new Map();
const teile = [];
for (const id of ids) {
  const t = liesTeil(LIVE_ORT, w, id);
  if (!t) { console.log(`  Teil ${id} nicht lesbar - fehlt im Abgleich`); continue; }
  const k = `Code ${String(t.sha ?? '?').slice(0, 12)}, Schadensregel ${t.schadenFassung ?? '?'}`;
  stempel.set(k, (stempel.get(k) ?? 0) + 1);
  teile.push(t);
}
// Alle Ersatznamen je Spieler aus den Teilen (siehe vergleiche, Feld namen).
const namenVon = new Map();
for (const t of teile) for (const [p, n] of Object.entries(t.namen ?? {})) { if (!namenVon.has(p)) namenVon.set(p, new Set()); namenVon.get(p).add(n); }
// Fest nach Match-Id, damit die Stufenprobe unten bei jedem Lauf dieselbe Teilung nimmt.
teile.sort((x, y) => String(x.matches?.[0]?.id).localeCompare(String(y.matches?.[0]?.id)));
const voll = await zusammenfuehren({ w, teile, log: console.log });
if (!voll.d) { console.log(`${w}: ${voll.text}`); process.exit(2); }
const ours = voll.d;
const oursJe = voll.je ? jeLesen(voll.je) : {};

/* ------------------------------------------------------- der Stand vom Release */

const authBuf = await releaseDatei(`clutch/${w}.json`);
if (!authBuf) { console.log(`${w}: am Release gibt es (gerade) kein clutch/${w}.json - spaeter noch einmal`); process.exit(3); }
const auth = JSON.parse(authBuf.toString('utf8'));
/*
 * Ein Zwischenstand ist kein Bezug: bis zur Korrektur vom 15.11.2026 (clutch-neu-rechnen.mjs / clutch-zusammen.mjs) stand am Release waehrend jeder Runde von
 * "Clutch rechnen" minutenlang der Stand eines einzelnen Rechners (teilweise gesetzt). Rueckgabe 3 - der Probe-Ablauf versucht es dann spaeter noch einmal.
 */
if (auth.teilweise && !arg.includes('--auch-teilweise')) {
  console.log(`${w}: das Release ist gerade ein Zwischenstand (teilweise: ${JSON.stringify(auth.teilweise)}, gerechnet ${auth.gerechnet}) - spaeter noch einmal`);
  process.exit(3);
}
const authJeBuf = await releaseDatei(`clutch-je/${w}.json`);
const authJe = authJeBuf ? jeLesen(authJeBuf) : {};

/* ------------------------------------------------------------------ Vergleich */

/** Gleich? Ganze Zahlen genau, Kommazahlen auf 1e-9 relativ, Texte genau; fehlend zaehlt wie 0 (bzw. leer). */
function gleich(a, b) {
  if (typeof a === 'string' || typeof b === 'string') return (a ?? '') === (b ?? '');
  const x = a ?? 0; const y = b ?? 0;
  if (typeof x !== 'number' || typeof y !== 'number') return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (Number.isInteger(x) && Number.isInteger(y)) return x === y;
  return Math.abs(x - y) <= 1e-9 * Math.max(Math.abs(x), Math.abs(y));
}

/*
 * Ein Vergleich: "unser" Stand (d, je) gegen einen Bezug (ref, refJe). Ergebnis: die Abweichungen je Feld und je Match plus die Zaehler.
 */
function vergleiche(d, dJe, ref, refJe) {
  const erklaert = {};
  const jeFeld = new Map();   // Feld -> { zahl, beispiele }
  const jeMatch = new Map();  // Match -> Zahl der Abweichungen
  const abweichung = (feld, text, match = null) => {
    const e = jeFeld.get(feld) ?? { zahl: 0, beispiele: [] };
    e.zahl += 1; if (e.beispiele.length < BEISPIELE) e.beispiele.push(text);
    jeFeld.set(feld, e);
    if (match) jeMatch.set(match, (jeMatch.get(match) ?? 0) + 1);
  };
  const unsere = new Map((d.matches ?? []).map((m) => [m.id, m]));
  const ihre = new Map((ref.matches ?? []).map((m) => [m.id, m]));
  const beide = [...unsere.keys()].filter((id) => ihre.has(id));
  const nurServer = [...unsere.keys()].filter((id) => !ihre.has(id));
  const nurRelease = [...ihre.keys()].filter((id) => !unsere.has(id));
  const beideSet = new Set(beide);

  // Je Match: Clutch-Punkte je Spieler.
  for (const id of beide) {
    const a = unsere.get(id).spieler ?? {}; const b = ihre.get(id).spieler ?? {};
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) if (!gleich(a[p], b[p])) abweichung('match.clutch', `${id} ${p}: Server ${a[p]} / Release ${b[p]}`, id);
  }

  // Je Spieler und Match: jede Spalte von clutch-je.
  const zeilenVon = (je) => { const m = new Map(); for (const [p, zeilen] of Object.entries(je)) for (const z of zeilen) m.set(`${p} ${z[0]}`, z); return m; };
  const unsereZeilen = zeilenVon(dJe); const ihreZeilen = zeilenVon(refJe);
  let zeilen = 0;
  for (const schluessel of new Set([...unsereZeilen.keys(), ...ihreZeilen.keys()])) {
    const [p, match] = schluessel.split(' ');
    if (!beideSet.has(match)) continue;
    const a = unsereZeilen.get(schluessel); const b = ihreZeilen.get(schluessel);
    if (!a || !b) { abweichung('je.zeile', `${match} ${p}: Zeile nur ${a ? 'beim Server' : 'am Release'}`, match); continue; }
    zeilen += 1;
    JE_SPALTEN.forEach((k, i) => { if (!gleich(a[i + 1], b[i + 1])) abweichung(`je.${k}`, `${match} ${p}: Server ${a[i + 1]} / Release ${b[i + 1]}`, match); });
  }

  /*
   * Je Spieler die Summen - nur, wer ganz in beiden steht: seine Zeilen am Bezug (clutch-je) decken alle seine Spiele ab und liegen alle in "beide".
   * Steht jedes Match des Bezugs auch beim Server, zaehlt jeder Spieler.
   */
  const allesDa = nurRelease.length === 0;
  const ihreMatchesVon = new Map();
  for (const [p, z] of Object.entries(refJe)) ihreMatchesVon.set(p, z.map((x) => x[0]));
  const spieler = new Set([...Object.keys(d.spiele ?? {}), ...Object.keys(ref.spiele ?? {})]);
  let gedeckt = 0;
  for (const p of spieler) {
    const m = ihreMatchesVon.get(p);
    const ganz = allesDa || (m && m.length === (ref.spiele?.[p] ?? -1) && m.every((id) => beideSet.has(id)));
    if (!ganz) continue;
    gedeckt += 1;
    for (const feld of ['spiele', 'summe', 'solo', 'leben', 'plattform', 'namen']) {
      const a = d[feld]?.[p]; const b = ref[feld]?.[p];
      if (gleich(a, b)) continue;
      /*
       * Der Name aus dem Replay (nur Ersatz, wenn Epic die Namensabfrage bremst) ist kein Wert: clutch-zusammen.mjs nimmt den des zuletzt eingearbeiteten
       * Teils. Hat ein Spieler mitten im Cup seinen Anzeigenamen geaendert, haengt er an der Reihenfolge der Teile (Squads Victory Cup R2 EU, 15.11.2026:
       * 12 von 1200). Das gilt als erklaert, wenn beide Namen in den Teilen dieses Spielers vorkommen - sonst ist es eine Abweichung.
       */
      if (feld === 'namen' && namenVon.get(p)?.has(a) && namenVon.get(p)?.has(b)) { erklaert.namen = (erklaert.namen ?? 0) + 1; continue; }
      abweichung(feld, `${p}: Server ${a} / Release ${b}`);
    }
    const sa = d.strecke?.[p] ?? [0, 0]; const sb = ref.strecke?.[p] ?? [0, 0];
    for (const i of [0, 1]) if (!gleich(sa[i], sb[i])) abweichung(`strecke[${i}]`, `${p}: Server ${sa[i]} / Release ${sb[i]}`);
    const da = d.schaden?.[p] ?? {}; const db = ref.schaden?.[p] ?? {};
    for (const k of new Set([...Object.keys(da), ...Object.keys(db)])) if (!gleich(da[k], db[k])) abweichung(`schaden.${k}`, `${p}: Server ${da[k]} / Release ${db[k]}`);
  }
  // Was den Spieltag als Ganzes beschreibt.
  for (const feld of ['eventId', 'windowId', 'gesamt']) if (!gleich(d[feld], ref[feld])) abweichung(feld, `Server ${d[feld]} / Release ${ref[feld]}`);
  if (JSON.stringify(d.regeln ?? []) !== JSON.stringify(ref.regeln ?? [])) abweichung('regeln', `Server ${JSON.stringify(d.regeln).slice(0, 80)} / Release ${JSON.stringify(ref.regeln).slice(0, 80)}`);
  if (allesDa && JSON.stringify([...(d.ohne ?? [])].sort()) !== JSON.stringify([...(ref.ohne ?? [])].sort())) abweichung('ohne', `Server ${d.ohne} / Release ${ref.ohne}`);
  return { jeFeld, jeMatch, beide, nurServer, nurRelease, zeilen, gedeckt, erklaert };
}

function ausgeben(titel, v, ref) {
  const refOhne = new Set(ref.ohne ?? []);
  console.log(titel);
  console.log(`  Matches: ${v.beide.length} in beiden, ${v.nurServer.length} nur beim Server, ${v.nurRelease.length} nur am Bezug${v.nurServer.filter((id) => refOhne.has(id)).length ? ` (davon beim Bezug "ohne Replay": ${v.nurServer.filter((id) => refOhne.has(id)).length})` : ''}`);
  if (v.nurServer.length) console.log(`    nur Server: ${v.nurServer.slice(0, BEISPIELE).join(', ')}${v.nurServer.length > BEISPIELE ? ' ...' : ''}`);
  if (v.nurRelease.length) console.log(`    nur Bezug: ${v.nurRelease.slice(0, BEISPIELE).join(', ')}${v.nurRelease.length > BEISPIELE ? ' ...' : ''}`);
  console.log(`  Verglichen: ${v.zeilen} Zeilen je Spieler und Match (je ${JE_SPALTEN.length} Spalten), ${v.gedeckt} Spieler mit allen Spielen in beiden`);
  if (v.erklaert.namen) console.log(`  Erklaert, keine Abweichung: ${v.erklaert.namen} Ersatznamen aus dem Replay, die von der Reihenfolge der Teile abhaengen (Spieler hiess im Cup verschieden, beide Namen in seinen Teilen)`);
  const gesamt = [...v.jeFeld.values()].reduce((n, e) => n + e.zahl, 0);
  if (!gesamt) { console.log('  Keine Abweichung.'); return 0; }
  console.log(`  ${gesamt} Abweichungen`);
  console.log('  nach Feld:');
  for (const [feld, e] of [...v.jeFeld].sort((a, b) => b[1].zahl - a[1].zahl)) {
    console.log(`    ${feld.padEnd(24)} ${String(e.zahl).padStart(7)}`);
    for (const b of e.beispiele) console.log(`        ${b}`);
  }
  if (v.jeMatch.size) {
    console.log('  nach Match:');
    for (const [m, z] of [...v.jeMatch].sort((a, b) => b[1] - a[1]).slice(0, Math.max(BEISPIELE, 20))) console.log(`    ${m} ${String(z).padStart(7)}`);
  }
  return gesamt;
}

/* -------------------------------------------------------------------- Ausgabe */

console.log(`Abgleich ${w}`);
console.log(`  Teile des Servers: ${teile.length} (${[...stempel].map(([k, v]) => `${v} mit ${k}`).join('; ')})`);
console.log(`  Release: ${(auth.matches ?? []).length} Matches, ${(auth.ohne ?? []).length} ohne Replay, Schadensregel ${auth.schadenFassung ?? '?'}, gerechnet ${auth.gerechnet ?? '?'}`);
const fehler1 = ausgeben('A) Teile des Servers auf leerer Grundlage gegen das Release (clutch + clutch-je):', vergleiche(ours, oursJe, auth, authJe), auth);

/*
 * B) Die Stufenprobe fuer den Live-Stand: die erste Haelfte der Teile auf leerer Grundlage (wie ein Release mitten im Cup, samt Folgeschritten - also
 * Fassung 3), darauf die zweite Haelfte wie in live-spur.mjs (bauen). Muss dasselbe ergeben wie alle Teile auf einmal (A) - sonst zaehlt das
 * Zusammenfuehren auf einem Release etwas doppelt oder verliert etwas.
 */
let fehler2 = 0;
if (teile.length >= 2) {
  const n = Math.floor(teile.length / 2);
  const stufe1 = await zusammenfuehren({ w, teile: teile.slice(0, n), log: console.log });
  const stufe2 = stufe1.d ? await zusammenfuehren({ w, basis: stufe1.d, basisJe: stufe1.je, basisRoh: stufe1.roh, teile: teile.slice(n), log: console.log }) : { d: null };
  if (!stufe2.d) { console.log('B) Stufenprobe: Zusammenfuehren scheiterte'); fehler2 = 1; } else {
    console.log(`  (Stufe 1: ${n} Teile, Fassung ${stufe1.d.version}; Stufe 2: +${teile.length - n} Teile -> ${stufe2.d.matches?.length} Matches)`);
    fehler2 = ausgeben(`B) Stufenprobe (Live-Stand): ${n} Teile, darauf ${teile.length - n} weitere - gegen alle auf einmal (A):`, vergleiche(stufe2.d, stufe2.je ? jeLesen(stufe2.je) : {}, ours, oursJe), ours);
  }
}
/*
 * C) Der Ablauf auf GitHub (clutch-rechnen.yml / clutch-ablegen.yml) mit den Skripten dieses Stands: jeder Rechner legt seine Teile sofort ab, der
 * Abschluss der Runde danach alle zusammen. Grundlage: der volle Stand (A) als Fassung 3 - so lag bis zum 15.11.2026 jeder kleine Spieltag am Release,
 * und der Plan liess ihn deshalb in jeder Runde ganz neu lesen. Danach eine zweite Runde auf dem Ergebnis (der Plan liest dann nichts neu - auch ein
 * zufaellig doppelt gelesener Teil darf nichts aendern). Jeder Zwischenstand muss in sich stimmen (Spiele = Zahl der Matches je Spieler), das Ende = A.
 */
let fehler3 = 0;
if (teile.length >= 2) {
  const n = Math.floor(teile.length / 2);
  // Wer in welchem Match spielte, steht in jedem Teil (spiele: je Spieler 1).
  const spielerJeMatch = new Map(teile.map((t) => [t.matches?.[0]?.id, new Set(Object.keys(t.spiele ?? {}))]));
  const stimmig = (x) => {
    const ids = (x.d.matches ?? []).map((m) => m.id);
    const soll = new Map();
    for (const id of ids) for (const p of spielerJeMatch.get(id) ?? []) soll.set(p, (soll.get(p) ?? 0) + 1);
    let falsch = 0;
    for (const p of new Set([...soll.keys(), ...Object.keys(x.d.spiele ?? {})])) if ((x.d.spiele?.[p] ?? 0) !== (soll.get(p) ?? 0)) falsch += 1;
    return { matches: ids.length, falsch, teilweise: !!x.d.teilweise, fassung: x.d.version };
  };
  const zeig = (titel, x) => { const s2 = stimmig(x); console.log(`    ${titel}: Fassung ${s2.fassung}, ${s2.matches} Matches, ${s2.falsch} Spieler mit Spielen, die nicht zu den Matches passen${s2.teilweise ? ', teilweise' : ''}`); return s2.falsch; };
  const stufen = [];
  const basis0 = { ...ours, version: 3 };
  const r1 = await zusammenfuehren({ w, basis: basis0, basisJe: voll.je, basisRoh: voll.roh, teile: teile.slice(0, n), wieGithub: true, log: console.log });
  const r2 = r1.d && await zusammenfuehren({ w, basis: r1.d, basisJe: r1.je, basisRoh: r1.roh, teile: teile.slice(n), wieGithub: true, log: console.log });
  const r3 = r2?.d && await zusammenfuehren({ w, basis: r2.d, basisJe: r2.je, basisRoh: r2.roh, teile, wieGithub: true, log: console.log });
  const r4 = r3?.d && await zusammenfuehren({ w, basis: r3.d, basisJe: r3.je, basisRoh: r3.roh, teile: teile.slice(0, n), wieGithub: true, log: console.log });
  console.log('C) Ablauf auf GitHub (Fassung-3-Grundlage, Rechner 1 sofort, Rechner 2 sofort, Abschluss mit allen, dann ein doppelt gelesener Teil):');
  if (!r4?.d) { console.log('  Zusammenfuehren scheiterte'); fehler3 = 1; } else {
    for (const [t, x] of [['nach Rechner 1', r1], ['nach Rechner 2', r2], ['nach Abschluss', r3], ['nach doppeltem Teil', r4]]) stufen.push(zeig(t, x));
    fehler3 = stufen.reduce((a, b) => a + b, 0);
    for (const [t, x] of [['  Ende (nach Abschluss) gegen A', r3], ['  Ende (nach doppeltem Teil) gegen A', r4]]) fehler3 += ausgeben(t, vergleiche(x.d, x.je ? jeLesen(x.je) : {}, ours, oursJe), ours);
  }
}
process.exit(fehler1 || fehler2 || fehler3 ? 1 : 0);
