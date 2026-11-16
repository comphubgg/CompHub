// Spieltags-Dateien ohne Schaden aus den voll ausgelesenen Replays wiederherstellen (16.11.2026) - fuer Spieltage, die aelter als 31 Tage sind.
//
// Befund: nach dem Ueberschreiben durch scripts/clutch-neu-rechnen.mjs (siehe scripts/clutch-aus-je.mjs) standen am 16.11. 10:40 UTC noch 148 clutch/<w>.json
// mit Matches ohne "schaden", 110 davon aelter als 31 Tage: Epic hat ihre Replays nicht mehr, der Planer liest sie nicht neu, und clutch-je fehlt oder ist
// unvollstaendig. Die voll ausgelesenen Replays (scripts/replay-voll-holen.mjs, replay-voll/<JJJJ-MM>/<w>/<matchId>.json, je Monat eigene Releases) sind
// die Ausgabe desselben Lesers (tools/replay-voll), die das volle Auslesen je Match durch lib/vollSchaden.mjs schadenAus schickt - daraus lassen sich
// "schaden", "spiele" und die Werte je Match ohne ein einziges Replay von Epic neu aufbauen. Nur fuer Spieltage, deren Matches ALLE als volle Datei mit
// Schaden-Werten vorliegen - sonst bliebe es eine halbe Summe.
//
// Geprueft am 16.11.2026 gegen Spieltage, die noch eine gute Datei haben (Datei ohne schaden/spiele/je nachgestellt, dann dieses Skript, dann Feld fuer Feld
// und Spieler fuer Spieler gegen das Original):
//   Leser-Fassung 2 (Sept., ohne "treffer"/"extra"): FNCS Divisional Cup Div. 1 Week 2 Final NAW, Week 3 Final EU - 990 von 990 Werten (dmg, dmgAlle, erlitten,
//     treffer, krit) und alle Spiele genau gleich: die guten Dateien dieser Zeit sind aus genau diesen Lesungen. Es ist die alte Schadensregel - an Reload Cash
//     Cup Duos ZB Event 5 Round 2 EU lagen die Kopien mit Fassung 2 bei dmg -8,3 %, erlitten +13,2 % gegen die Datei nach Schadensregel 18. Darum ohne
//     schadenFassung, wie die guten Dateien derselben Zeit.
//   Leser-Fassung 3 (mit Treffern, Inventar, Schild, Leben): Performance Evaluation Event 8 Round 2 EU/NAC, Event 9 Round 2 EU, Reload Cash Cup Duos ZB
//     Event 5 Round 2 EU/NAC, Event 6 Round 2 ME (alle Schadensregel 18) - alle Felder und Spiele genau gleich ausser
//       - selbstHolz/-Stein/-Metall: je Match bei genau einem Spieler 0 statt des Werts (der Leser-Fehler, den Fassung 18 behob: "der Spieler mit
//         WorldPlayerId 0 bekam keine Bauteile") - je Spieltag 1 bis 7 % dieser Summe; darum schadenFassung 17;
//       - killsEcht/killsNachAus: die heutige Regel (Fassung 19) auf dem alten Kill-Zaehler weicht ab (-7 bis -11 %) und ist fuer diese Dateien nicht gegen
//         Epic geprueft - wie in clutch-aus-je.mjs weggelassen (die Seite nimmt dann die Elims aus den schlanken Replay-Werten). todeEcht ebenso.
//     Die Werte je Match (Performance Evaluation Event 8 Round 2 EU gegen clutch-je am Release): alle 297 Zeilen, alle Zellen gleich ausser denselben neun
//     selbst*-Werten und "strecke" - die kam aus den Positionsproben des Replays selbst, die in der vollen Datei nicht stehen; sie bleibt leer.
//   Leser-Fassung 1 (nur Spieler, Kill-Feed, Zonen - MannekenPis Day 1/2, Division 1 Week 4 Final): kein Schaden in der Datei, nichts wiederherzustellen.
//     Auch sonst nirgends (16.11.2026 nachgesehen): kein clutch-je, kein clutch-umbau, clutch-roh nur Kill-Feed und Figuren, die Matches unter keinem anderen
//     Spieltag.
//
// Wo die Match-Dateien liegen, sagen die Verzeichnisse der Releases (manifest.json) - die koennen hinterherhinken (16.11.2026: 44 Dateien in
// daten-replayvoll-2026-09, die dort fehlten). Was im Verzeichnis fehlt, wird darum direkt an den Releases versucht, in die der Hochlader die Datei legt.
//
//   node scripts/clutch-aus-voll.mjs [--hoechstens 40] [--minuten 6] [--nur <windowId>] [--trocken]

import fs from 'node:fs';
import path from 'node:path';
import { JE_SPALTEN, jeDatei, jeZeile } from '../lib/jeSpiel.mjs';
import { tagsFuer } from '../lib/releaseTags.mjs';
import { schadenAus } from '../lib/vollSchaden.mjs';
import { lebenJeMatch } from '../lib/clutchLeben.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const JE = path.join(DATEN, 'clutch-je');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const arg = process.argv.slice(2);
const wert = (name) => (arg.includes(name) ? arg[arg.indexOf(name) + 1] : undefined);
const HOECHSTENS = Number(wert('--hoechstens')) || 40;
const MINUTEN = Number(wert('--minuten')) || Infinity;
const NUR = wert('--nur');
const TROCKEN = arg.includes('--trocken');
const schluss = Date.now() + MINUTEN * 60_000;
const warte = (ms) => new Promise((ok) => setTimeout(ok, ms));
// Die Elims aus dem Kill-Zaehler des alten Lesers sind nicht gegen Epic geprueft (siehe oben) - weder in der Summe noch in den Werten je Match.
const OHNE = new Set(['killsEcht', 'todeEcht', 'killsNachAus']);

const url = (tag, name) => `https://github.com/${REPO}/releases/download/${tag}/${name}`;
/** Eine Datei vom Release (JSON). 404 erst nach weiteren Versuchen als "fehlt": waehrend eines Austauschs am vollen Release fehlt sie kurz (clutch-aus-je.mjs). */
async function hole(tag, name, { versuche = 3, pausen = [10_000, 30_000] } = {}) {
  for (let v = 0; v < versuche; v += 1) {
    try {
      const r = await fetch(url(tag, name), { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (r.ok) return await r.json();
      if (r.status === 404 && v === versuche - 1) return null;
    } catch { /* noch einmal */ }
    if (v < versuche - 1) await warte(pausen[Math.min(v, pausen.length - 1)]);
  }
  return null;
}

// Kandidaten wie in clutch-aus-je.mjs: erst den Text ansehen, nur Dateien ohne Schaden parsen.
const dateien = fs.existsSync(ZIEL) ? fs.readdirSync(ZIEL).filter((f) => f.endsWith('.json') && !f.startsWith('_')) : [];
const kandidaten = [];
for (const f of dateien) {
  const w = f.replace(/\.json$/, '');
  if (NUR && w !== NUR) continue;
  let text;
  try { text = fs.readFileSync(path.join(ZIEL, f), 'utf8'); } catch { continue; }
  if (/"schaden":\s*\{\s*"/.test(text)) continue;
  let d;
  try { d = JSON.parse(text); } catch { console.log(`  ${w}: Datei nicht lesbar - uebersprungen`); continue; }
  if (Object.keys(d.schaden ?? {}).length || !(d.matches?.length) || d.umbau) continue;
  kandidaten.push({ w, d });
}
console.log(`${kandidaten.length} von ${dateien.length} Spieltags-Dateien ohne Schaden`);
if (!kandidaten.length) process.exit(0);

/*
 * Wo liegt welches Match? Die Verzeichnisse aller Replay-Releases der Monate seit August 2026 (davor gab es keine). Ein Release ohne Verzeichnis ist kein
 * Fehler (die meisten Ueberlauf-Releases gibt es noch nicht).
 */
const monate = [];
for (let d = new Date(Date.UTC(2026, 7, 1)); d <= new Date(); d.setUTCMonth(d.getUTCMonth() + 1)) monate.push(d.toISOString().slice(0, 7));
const tags = [...new Set(monate.flatMap((m) => tagsFuer(`replay-voll/${m}/`)))];
/*
 * Ein Match kann in mehreren Releases liegen (16.11.2026: 3.979 Namen doppelt) - neu gelesen, als ein neueres Release dazukam. Reload Cash Cup Duos ZB Event 4
 * Round 2: im Stamm-Release Leser-Fassung 2, in -b/-c dieselben Matches mit Fassung 3. Darum alle Kopien merken und die mit der hoechsten Leser-Fassung nehmen.
 */
const lage = new Map(); // windowId -> Map(matchId -> [{ tag, monat }])
let verzeichnisse = 0;
await Promise.all(Array.from({ length: 8 }, async (unbenutzt, n) => {
  for (let i = n; i < tags.length; i += 8) {
    // Ein Verzeichnis, das nicht kommt, kostet nur diesen Lauf: fehlende Matches werden unten direkt versucht, der Spieltag sonst im naechsten Lauf.
    const m = await hole(tags[i], 'manifest.json', { versuche: 2, pausen: [3000] });
    if (!m) continue;
    verzeichnisse += 1;
    for (const k of Object.keys(m)) {
      const x = k.match(/^replay-voll__(\d{4}-\d{2})__(.+)__([0-9a-f]{32})\.json$/);
      if (!x) continue;
      if (!lage.has(x[2])) lage.set(x[2], new Map());
      const hier = lage.get(x[2]);
      hier.set(x[3], [...(hier.get(x[3]) ?? []), { tag: tags[i], monat: x[1] }]);
    }
  }
}));
console.log(`${verzeichnisse} Verzeichnisse von ${tags.length} Replay-Releases gelesen, ${lage.size} Spieltage mit vollen Replays`);

let wieder = 0; let ohneVoll = 0; let unvollstaendig = 0; let ohneSchaden = 0;
for (const { w, d } of kandidaten) {
  if (wieder >= HOECHSTENS) break;
  if (Date.now() > schluss) { console.log(`Zeitrahmen (${MINUTEN} min) erreicht - der Rest im naechsten Lauf`); break; }
  const hier = lage.get(w);
  if (!hier) { ohneVoll += 1; continue; }
  // Nicht im Verzeichnis: direkt an den Releases versuchen, in die der Hochlader die Datei nach Monat und Streuung legt (Monate der anderen Matches).
  const fehlt = d.matches.map((m) => m.id).filter((id) => !hier.has(id));
  for (const id of fehlt) {
    const gefunden = [];
    for (const monat of new Set([...hier.values()].flat().map((x) => x.monat))) {
      const name = `replay-voll/${monat}/${w}/${id}.json`;
      for (const tag of tagsFuer(name)) {
        const r = await fetch(url(tag, name.replace(/\//g, '__')), { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(60_000) }).catch(() => null);
        if (r?.ok) gefunden.push({ tag, monat });
      }
    }
    if (gefunden.length) hier.set(id, gefunden);
  }
  const nochFehlt = d.matches.filter((m) => !hier.has(m.id)).length;
  if (nochFehlt) { unvollstaendig += 1; console.log(`  ${w}: ${nochFehlt} von ${d.matches.length} Matches ohne volles Replay - bleibt`); continue; }

  const schaden = {}; const spiele = {}; const leben = {}; const plattform = {}; const namen = {}; const je = {}; const leser = {};
  let grund = null;
  for (const { id } of d.matches) {
    // Alle Kopien laden, die mit der hoechsten Leser-Fassung gilt (bei gleicher die zuerst gefundene).
    let voll = null;
    for (const { tag, monat } of hier.get(id)) {
      const v = await hole(tag, `replay-voll__${monat}__${w}__${id}.json`);
      if (v && (!voll || (Number(v.version) || 0) > (Number(voll.version) || 0))) voll = v;
    }
    if (!voll) { grund = `${id} nicht ladbar`; break; }
    if ((voll.match && voll.match !== id) || !Array.isArray(voll.schaden) || !voll.schaden.length) {
      grund = `${id}: Leser-Fassung ${voll.version ?? '?'} ohne Schaden-Werte`; break;
    }
    leser[voll.version] = (leser[voll.version] ?? 0) + 1;
    const werte = schadenAus(voll);
    if (!werte) { grund = `${id}: Schaden nicht rechenbar`; break; }
    // Wie lib/vollMatch.mjs einarbeiten und scripts/clutch-zusammen.mjs: Summen je Spieler, Spiele, Plattform, Name, Ueberlebenszeit, Werte je Match.
    const lebenHier = lebenJeMatch(voll);
    for (const [k, v] of Object.entries(werte)) {
      const s = schaden[k] ??= {};
      for (const [f, x] of Object.entries(v)) if (!OHNE.has(f)) s[f] = (s[f] ?? 0) + (x ?? 0);
      const zeile = jeZeile(id, v, lebenHier.get(k), typeof v.streckeBoden === 'number' ? v.streckeBoden : undefined);
      for (const f of OHNE) zeile[1 + JE_SPALTEN.indexOf(f)] = null;
      (je[k] ??= []).push(zeile);
    }
    for (const p of voll.spieler ?? []) {
      if (p.bot || !p.epic) continue;
      spiele[p.epic] = (spiele[p.epic] ?? 0) + 1;
      if (p.plattform) plattform[p.epic] = String(p.plattform);
      if (p.name && typeof p.name === 'string') namen[p.epic] = p.name;
    }
    for (const [k, v] of lebenHier) leben[k] = Math.round((leben[k] ?? 0) + v);
  }
  if (grund) { ohneSchaden += 1; console.log(`  ${w}: ${grund} - bleibt`); continue; }

  const { inhalt, lage: jeLage } = jeDatei(je);
  const alteLeser = Object.keys(leser).some((v) => Number(v) < 3);
  const neu = {
    ...d, version: Math.max(4, Number(d.version) || 0), schaden, spiele,
    leben: Object.keys(d.leben ?? {}).length ? d.leben : leben,
    plattform: Object.keys(d.plattform ?? {}).length ? d.plattform : plattform,
    namen: { ...namen, ...(d.namen ?? {}) },
    gesamt: Math.max(d.gesamt ?? 0, d.matches.length),
    je: { spalten: JE_SPALTEN, lage: jeLage, bytes: inhalt.length }, jeGeprueft: inhalt.length,
    // Herkunft: Zeitpunkt und Leser-Fassungen der vollen Replays (Anzahl Matches je Fassung).
    ausVoll: { zeit: new Date().toISOString(), leser },
    gerechnet: d.gerechnet ?? new Date().toISOString(),
  };
  // Fassung 2: alte Schadensregel, wie die guten Dateien derselben Zeit ohne Angabe. Fassung 3: Schadensregel 17 (siehe oben).
  if (alteLeser) delete neu.schadenFassung; else neu.schadenFassung = 17;
  delete neu.jeFehlt;
  wieder += 1;
  console.log(`  ${w}: aus den vollen Replays wiederhergestellt (${Object.keys(schaden).length} Spieler, ${d.matches.length} Matches, Leser ${JSON.stringify(leser)})${TROCKEN ? ' - trocken, nichts geschrieben' : ''}`);
  if (TROCKEN) continue;
  fs.mkdirSync(JE, { recursive: true });
  fs.writeFileSync(path.join(JE, `${w}.json`), inhalt);
  fs.writeFileSync(path.join(ZIEL, `${w}.json`), JSON.stringify(neu));
}
console.log(`Aus vollen Replays: ${wieder} wiederhergestellt, ${ohneVoll} ohne volle Replays, ${unvollstaendig} unvollstaendig, ${ohneSchaden} ohne Schaden-Werte.`);
