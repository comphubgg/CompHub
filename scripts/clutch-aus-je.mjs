// Spieltags-Dateien ohne Schaden aus ihren Werten je Match wiederherstellen (16.11.2026).
//
// Befund: am Release standen 199 von 397 juengeren clutch/<w>.json ohne "schaden" (version 3, nur matches/summe/solo/leben) - genau die Form, die
// scripts/clutch-neu-rechnen.mjs schrieb, wenn die Spieltags-Datei beim Holen fehlte (alt = {}). Beispiel: Performance Evaluation Cup Event 2
// Round 2 EU - clutch-je/<w>.json (58 KB, alle 78 Spieler, 4 Matches) wurde um 00:28 UTC von clutch-zusammen.mjs geschrieben, war also ganz
// gelesen; um 07:57 lag clutch/<w>.json ohne Schaden am Release. Die Seite zeigte Damage 0 und Treffer, Kopftreffer, Bauteile als "-", und der
// Planer stellte den Spieltag als "ganz offen" hinter 840.000 andere Matches.
//
// Die Werte je Match (lib/jeSpiel.mjs) sind dieselben Zahlen, die clutch-zusammen.mjs je Spieler aufsummiert - daraus laesst sich "schaden",
// "spiele" und "je" ohne ein einziges Replay wiederherstellen. Doppelte Zeilen (dasselbe Match zweimal eingearbeitet) zaehlen einmal.
// Nur fuer Dateien, deren Matches alle in den Werten je Match vorkommen - sonst bliebe es eine halbe Summe, und der Planer liest neu.
//
//   node scripts/clutch-aus-je.mjs [--hoechstens 80]

import fs from 'node:fs';
import path from 'node:path';
import { JE_SPALTEN, jeDatei, jeLesen, jeFehltVon } from '../lib/jeSpiel.mjs';
import { tagFuer } from '../lib/releaseTags.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const JE = path.join(DATEN, 'clutch-je');
const REPO = process.env.GITHUB_REPOSITORY || 'comphubgg/CompHub';
const arg = process.argv.slice(2);
const HOECHSTENS = Number(arg[arg.indexOf('--hoechstens') + 1]) || 80;
// Zeitrahmen (16.11.2026): der erste Lauf im Ablauf brach nach 8 Minuten ab, ohne eine Datei wiederhergestellt zu haben - und die Ausgabe ging mit "| tail" verloren.
const MINUTEN = arg.includes('--minuten') ? Number(arg[arg.indexOf('--minuten') + 1]) || 6 : Infinity;
const schluss = Date.now() + MINUTEN * 60_000;

const manifeste = new Map();
/** Das Verzeichnis eines Release (manifest.json) - null, wenn es nicht lesbar ist (dann wird die Datei wie bisher direkt versucht). */
async function manifestVon(tag) {
  if (!manifeste.has(tag)) {
    manifeste.set(tag, (async () => {
      for (let v = 0; v < 3; v += 1) {
        try {
          const r = await fetch(`https://github.com/${REPO}/releases/download/${tag}/manifest.json`, { redirect: 'follow', signal: AbortSignal.timeout(60_000) });
          if (r.ok) return await r.json();
        } catch { /* noch einmal */ }
        await new Promise((ok) => setTimeout(ok, 3000));
      }
      return null;
    })());
  }
  return manifeste.get(tag);
}

async function jeVomRelease(w) {
  const name = `clutch-je/${w}.json`;
  const lokal = path.join(DATEN, name);
  if (fs.existsSync(lokal)) return fs.readFileSync(lokal);
  const url = `https://github.com/${REPO}/releases/download/${tagFuer(name)}/${name.replace(/\//g, '__')}`;
  /*
   * Erst im Verzeichnis des Release nachsehen (16.11.2026): von 168 Spieltagen ohne Schaden hatten 132 gar keine Werte je Match. Jeder davon kostete hier 15 s
   * Warten auf 404 - die ersten 40 (alphabetisch) waren alle solche, und nach 8 Minuten war keine Datei wiederhergestellt. Kennt das Verzeichnis die Datei,
   * wird ein 404 weiter wiederholt (Austausch am Release, siehe scripts/ablage-github-holen.mjs).
   */
  const m = await manifestVon(tagFuer(name));
  if (m && !m[name.replace(/\//g, '__')]) return null;
  for (let v = 0; v < 3; v += 1) {
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120_000) });
      if (r.status === 404 && v === 2) return null;
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* noch einmal */ }
    await new Promise((ok) => setTimeout(ok, 5000 * (v + 1)));
  }
  return null;
}

// Ohne die Elims aus dem vollen Auslesen (killsEcht/todeEcht): vor Fassung 19 zaehlten sie Kills nach dem Aus mit (Event 2 Round 2 EU: 5 von 26 Teams ueber
// Epic). Die Seite nimmt dann die Elims aus den schlanken Replay-Werten, wie vor dem vollen Auslesen.
const SUMMEN = JE_SPALTEN.filter((k) => !['leben', 'strecke', 'killsEcht', 'todeEcht', 'killsNachAus'].includes(k));
let wieder = 0; let ohneJe = 0; let unvollstaendig = 0;
const dateien = fs.existsSync(ZIEL) ? fs.readdirSync(ZIEL).filter((f) => f.endsWith('.json') && !f.startsWith('_')) : [];
/*
 * Ohne Schaden heisst klein: erst den Text ansehen, nur Kandidaten parsen (16.11.2026). data/clutch/ haelt rund 900 Dateien, zusammen 5,2 GB (17 ueber 50 MB);
 * jede zu parsen kostete im Ablauf die ganzen 8 Minuten - "Schaden aus den Werten je Match" lief ab, bevor es zu einer der 199 Dateien kam. Die juengsten zuerst.
 */
const zeitVon = (f) => { try { return fs.statSync(path.join(ZIEL, f)).mtimeMs; } catch { return 0; } };
const kandidaten = dateien.filter((f) => {
  try { return !/"schaden":\s*\{\s*"/.test(fs.readFileSync(path.join(ZIEL, f), 'utf8')); } catch { return false; }
}).sort((a, b) => zeitVon(b) - zeitVon(a));
console.log(`${kandidaten.length} von ${dateien.length} Spieltags-Dateien ohne Schaden`);
for (const f of kandidaten) {
  if (wieder >= HOECHSTENS) break;
  if (Date.now() > schluss) { console.log(`Zeitrahmen (${MINUTEN} min) erreicht - der Rest im naechsten Lauf`); break; }
  const ziel = path.join(ZIEL, f);
  let d;
  try { d = JSON.parse(fs.readFileSync(ziel, 'utf8')); } catch { continue; }
  if (d.schaden && Object.keys(d.schaden).length) continue;
  if (d.ohneRohRechnung || !(d.matches?.length)) continue;
  const w = f.replace(/\.json$/, '');
  const roh = await jeVomRelease(w);
  if (!roh) { ohneJe += 1; continue; }
  const alle = jeLesen(roh);
  // Je Spieler jedes Match nur einmal (die letzte Zeile gilt - doppelte sind gleich).
  for (const [id, zeilen] of Object.entries(alle)) alle[id] = [...new Map(zeilen.map((z) => [z[0], z])).values()];
  const fehlt = jeFehltVon(d, alle);
  if (fehlt) { unvollstaendig += 1; console.log(`  ${w}: ${fehlt} von ${d.matches.length} Matches ohne Werte je Match - bleibt, wird neu gelesen`); continue; }
  const bekannt = new Set(d.matches.map((m) => m.id));
  const schaden = {}; const spiele = {}; const leben = {};
  for (const [id, zeilen] of Object.entries(alle)) {
    const z = zeilen.filter((x) => bekannt.has(x[0]));
    if (!z.length) continue;
    const s = {};
    for (const k of SUMMEN) {
      const i = 1 + JE_SPALTEN.indexOf(k);
      const werte = z.map((x) => x[i]).filter((v) => typeof v === 'number');
      if (werte.length) s[k] = werte.reduce((a, v) => a + v, 0);
    }
    // Inventar-Leser (Bauteile, Mats, echte Elims) nur, wo die Zeile den Wert hat - dieselbe Regel wie beim Lesen (invSpiele).
    s.invSpiele = z.filter((x) => typeof x[1 + JE_SPALTEN.indexOf('selbstHolz')] === 'number').length;
    for (const k of ['dmg', 'erlitten', 'treffer', 'krit', 'sturm', 'wiederbelebt', 'rebootet']) s[k] ??= 0;
    schaden[id] = s;
    spiele[id] = z.length;
    const l = z.map((x) => x[1 + JE_SPALTEN.indexOf('leben')]).filter((v) => typeof v === 'number');
    if (l.length) leben[id] = l.reduce((a, v) => a + v, 0);
  }
  if (!Object.keys(schaden).length) { unvollstaendig += 1; continue; }
  const { inhalt, lage } = jeDatei(alle);
  fs.mkdirSync(JE, { recursive: true });
  fs.writeFileSync(path.join(JE, `${w}.json`), inhalt);
  /*
   * Mit welcher Leser-Fassung die Zeilen entstanden, steht nirgends mehr. Fassung 18 angenommen: so liest der Planer kleine Spieltage (bis 3.000 Matches)
   * noch einmal ganz nach der heutigen Regel (Elims nur aus dem Kill-Zaehler, Mats exakt) - an Event 2 Round 2 EU stimmten die Elims aus den Zeilen bei
   * 21 von 26 Teams mit Epic ueberein, die uebrigen lagen darueber (die alte Regel vor Fassung 19). Bis dahin zeigt die Seite die Werte statt Nullen.
   */
  const neu = {
    ...d, version: 4, schadenFassung: 18, schaden, spiele, leben: Object.keys(d.leben ?? {}).length ? d.leben : leben,
    gesamt: Math.max(d.gesamt ?? 0, d.matches.length), je: { spalten: JE_SPALTEN, lage, bytes: inhalt.length }, jeGeprueft: inhalt.length,
    ausJe: new Date().toISOString(), gerechnet: d.gerechnet ?? new Date().toISOString(),
  };
  delete neu.teilweise; delete neu.jeFehlt;
  fs.writeFileSync(ziel, JSON.stringify(neu));
  wieder += 1;
  console.log(`  ${w}: aus den Werten je Match wiederhergestellt (${Object.keys(schaden).length} Spieler, ${d.matches.length} Matches)`);
}
console.log(`Aus Werten je Match: ${wieder} wiederhergestellt, ${ohneJe} ohne Werte je Match, ${unvollstaendig} unvollstaendig.`);
