// LAN-Konten den echten Konten der Spieler zuordnen.
//
// An einem LAN (Globals, EWC) spielen die Profis nicht auf ihrem eigenen
// Konto, sondern auf einem Turnierkonto, das Epic stellt: "[FNCSGC26] BIG
// Vico" statt "BIG Vico". Epics Bestenliste fuehrt diese Turnierkonten; die
// Szene-Quelle fuehrt die Werte (Damage, Elims, ...) unter den echten Konten.
// Beide Listen hatten fuer die Globals 2026 keine einzige gemeinsame Id -
// und damit fehlten im Werkzeug Flagge, X-Konto und Statistik jedes Spielers.
//
// Der Betreiber (28.9.2026): "Big Vico ... ist Vico ... alle Spieler haben
// einfach vor ihren Namen noch Klammer FNCS GC26. Aber die Spieler musst du
// zuteilen koennen mit Flagge." Die Namen in der Bestenliste bleiben, wie
// Epic sie fuehrt.
//
// So wird zugeordnet, je Spieltag, an dem Bestenliste und Szene-Werte keine
// gemeinsame Id haben:
//   1. Name ohne den Vorsatz in eckigen Klammern -> Namensschluessel; es
//      zaehlt nur ein eindeutiger Treffer unter den Szene-Konten des Tages.
//   2. Gegenprobe ueber die Elims: die Summe der beiden echten Konten eines
//      Teams muss Epics Team-Elims entsprechen. Wer das nie besteht, wird
//      nicht eingetragen.
// Bei den Globals 2026 traf Schritt 1 alle hundert Konten, und die Gegenprobe
// stimmte bei 99 von 100 Team-Tagen (einer lag um einen Elim daneben - das
// Team ist an beiden Tagen dasselbe, der andere Tag stimmt).
//
// Ergebnis: data/lan-konten.json  { "<LAN-Id>": { echt, lan, name, fenster[] } }
// Die Seite liest sie vom Release (lib/lanKonten.ts). Bestehende Eintraege
// bleiben; ein neuer Lauf ergaenzt nur.
//
//   node scripts/lan-konten-zuordnen.mjs [--probe]

import fs from 'node:fs';
import path from 'node:path';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'lan-konten.json');
const probe = process.argv.includes('--probe');

const liesJson = (p, standard) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return standard; } };

/** Wie lib/homoglyph: nur Buchstaben und Ziffern, klein, ohne Akzente. */
const schluessel = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9]+/g, '').toLowerCase();
const ohneVorsatz = (n) => String(n ?? '').replace(/^\s*\[[^\]]*\]\s*/, '');

async function namenHolen() {
  const lokal = liesJson(path.join(DATEN, 'epic-namen.json'), null);
  if (lokal) return lokal;
  // Auf dem Laufrechner liegt die Datei nur am Release.
  const r = await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/epic-namen.json');
  return r.ok ? r.json() : {};
}

function alleDateien(ordner) {
  const raus = [];
  if (!fs.existsSync(ordner)) return raus;
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) raus.push(...alleDateien(p));
    else if (e.name.endsWith('.json')) raus.push(p);
  }
  return raus;
}

const namen = await namenHolen();
const bisher = liesJson(ZIEL, {});
const neu = { ...bisher };
let tageGeprueft = 0; let dazu = 0;

// Die Szene-Werte je Fenster (Region egal - ein LAN steht unter einer Region).
const szeneNach = new Map();
for (const p of alleDateien(path.join(DATEN, 'szene-stats'))) {
  if (p.endsWith('index.json')) continue;
  const s = liesJson(p, null);
  if (s?.windowId && Array.isArray(s.players) && !szeneNach.has(s.windowId)) szeneNach.set(s.windowId, s);
}

for (const p of alleDateien(path.join(DATEN, 'epic-spieltage'))) {
  const tag = liesJson(p, null);
  if (!tag?.windowId || !Array.isArray(tag.teams) || !tag.teams.length) continue;
  const szene = szeneNach.get(tag.windowId);
  if (!szene) continue;
  const lanIds = [...new Set(tag.teams.flatMap((t) => t.spieler ?? []))];
  const szeneIds = new Set(szene.players.map((x) => x.epicId));
  // Nur Tage, an denen die beiden Listen nichts gemeinsam haben - ein LAN.
  if (lanIds.some((id) => szeneIds.has(id))) continue;
  // Und nur, wenn die Namen wirklich Turnierkonten sind ("[...] Name").
  const mitVorsatz = lanIds.filter((id) => /^\s*\[[^\]]+\]/.test(namen[id] ?? ''));
  if (mitVorsatz.length < lanIds.length * 0.8) continue;
  tageGeprueft += 1;

  const nachSchluessel = new Map();
  for (const x of szene.players) {
    const k = schluessel(x.username);
    nachSchluessel.set(k, nachSchluessel.has(k) ? null : x); // doppelt -> nicht eindeutig
  }
  const zu = new Map();
  for (const id of lanIds) {
    const x = nachSchluessel.get(schluessel(ohneVorsatz(namen[id])));
    if (x) zu.set(id, x);
  }
  // Gegenprobe ueber die Team-Elims.
  const bestanden = new Set();
  for (const t of tag.teams) {
    const [a, b] = t.spieler ?? [];
    if (!zu.has(a) || !zu.has(b) || typeof t.teamElims !== 'number') continue;
    if ((zu.get(a).eliminations ?? NaN) + (zu.get(b).eliminations ?? NaN) === t.teamElims) {
      bestanden.add(a); bestanden.add(b);
    }
  }
  for (const [id, x] of zu) {
    const alt = neu[id];
    // Ein Konto, das an keinem Tag die Gegenprobe besteht, kommt nicht hinein.
    if (!bestanden.has(id) && !alt) continue;
    if (alt && alt.echt !== x.epicId) {
      console.log(`  Widerspruch: ${namen[id]} war ${alt.echt}, jetzt ${x.epicId} - bleibt beim alten`);
      continue;
    }
    if (!alt) dazu += 1;
    neu[id] = {
      echt: x.epicId, lan: namen[id], name: x.username,
      fenster: [...new Set([...(alt?.fenster ?? []), tag.windowId])],
    };
  }
  console.log(`  ${tag.windowId}: ${zu.size}/${lanIds.length} zugeordnet, Gegenprobe ${bestanden.size}`);
}

console.log(`LAN-Tage ${tageGeprueft}, neue Zuordnungen ${dazu}, zusammen ${Object.keys(neu).length}`);
if (!probe && dazu > 0) fs.writeFileSync(ZIEL, JSON.stringify(neu, null, 1));
