// LAN-Konten den echten Konten der Spieler zuordnen.
//
// An einem LAN (Globals, EWC) spielen die Profis nicht auf ihrem eigenen
// Konto, sondern auf einem Turnierkonto, das Epic stellt: "[FNCSGC26] BIG
// Vico" statt "BIG Vico". Epics Bestenliste fuehrt diese Turnierkonten - ohne
// Zuordnung fehlten im Werkzeug Flagge, X-Konto und Statistik jedes Spielers.
//
// Der Betreiber (28.9.2026): "Big Vico ... ist Vico ... alle Spieler haben
// einfach vor ihren Namen noch Klammer FNCS GC26. Aber die Spieler musst du
// zuteilen koennen mit Flagge." Die Namen in der Bestenliste bleiben, wie
// Epic sie fuehrt.
//
// So wird zugeordnet, nur aus eigenen Daten (Epics Bestenliste und Epics
// Anzeigenamen in epic-namen.json), je LAN-Spieltag - mindestens 80 % der
// Konten tragen einen Vorsatz "[...]":
//   Name ohne den Vorsatz -> Namensschluessel; es zaehlt nur ein eindeutiger
//   Treffer unter den Epic-Namen aller Konten ohne Vorsatz. Tragen zwei Konten
//   denselben Namen, wird keins eingetragen - der Admin kann von Hand nachhelfen.
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
const VORSATZ = /^\s*\[[^\]]*\]\s*/;
const ohneVorsatz = (n) => String(n ?? '').replace(VORSATZ, '');

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

// Alle Konten mit einem Epic-Namen ohne Vorsatz - je Namensschluessel; doppelt = nicht eindeutig (null).
const nachSchluessel = new Map();
for (const [id, n] of Object.entries(namen ?? {})) {
  if (!n || VORSATZ.test(n)) continue;
  const k = schluessel(n);
  if (k.length < 2) continue;
  nachSchluessel.set(k, nachSchluessel.has(k) ? null : { epicId: id, username: n });
}

for (const p of alleDateien(path.join(DATEN, 'epic-spieltage'))) {
  const tag = liesJson(p, null);
  if (!tag?.windowId || !Array.isArray(tag.teams) || !tag.teams.length) continue;
  const lanIds = [...new Set(tag.teams.flatMap((t) => t.spieler ?? []))];
  // Nur, wenn die Namen wirklich Turnierkonten sind ("[...] Name").
  const mitVorsatz = lanIds.filter((id) => VORSATZ.test(namen[id] ?? ''));
  if (!lanIds.length || mitVorsatz.length < lanIds.length * 0.8) continue;
  tageGeprueft += 1;

  const zu = new Map();
  for (const id of mitVorsatz) {
    const x = nachSchluessel.get(schluessel(ohneVorsatz(namen[id])));
    if (x && x.epicId !== id) zu.set(id, x);
  }
  for (const [id, x] of zu) {
    const alt = neu[id];
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
  console.log(`  ${tag.windowId}: ${zu.size}/${lanIds.length} zugeordnet`);
}

console.log(`LAN-Tage ${tageGeprueft}, neue Zuordnungen ${dazu}, zusammen ${Object.keys(neu).length}`);
if (!probe && dazu > 0) fs.writeFileSync(ZIEL, JSON.stringify(neu, null, 1));
