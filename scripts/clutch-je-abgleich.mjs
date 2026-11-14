// clutch/<w>.json und clutch-je/<w>.json zusammenhalten (14.11.2026).
//
// clutch/<w>.json traegt unter "je" die Lage der 256 Stuecke in clutch-je/<w>.json (lib/jeSpiel.mjs); die Seite liest mit einer Teilanfrage genau dort
// (app/api/spieler-detail, liesBereich). Passt die Lage nicht zur Datei am Release, bekommt ein Spieler ein falsches Stueck oder gar keins. Bis zum 14.11.2026 lud
// die Sofort-Ablage (clutch-ablegen.yml) nur clutch/ hoch: am Release passten danach 70 von 118 Spieltagen nicht mehr (Lage zeigte in eine aeltere, kuerzere
// Datei), und die Zeilen der dazwischen eingearbeiteten Teile fehlten (z. B. S43_TriosCashCup_Event2_BR: 122 von 488 Matches).
//
//   node scripts/clutch-je-abgleich.mjs --heilen [--alle]
//       vor clutch-zusammen.mjs: jeder Spieltag in data/clutch, dessen Lage nicht zur Groesse von clutch-je am Release passt (mit --alle: jeder), bekommt die
//       Lage aus der Datei am Release neu, und die Matches ohne Zeile kommen in jeOhne - der Planer liest sie nach (scripts/clutch-berechnen.mjs, nurJe).
//   node scripts/clutch-je-abgleich.mjs --pruefen
//       nach dem Hochladen von clutch-je, vor clutch: ein clutch/<w>.json, dessen Lage nicht zu dem passt, was jetzt am Release liegt, wird nicht hochgeladen
//       (die Datei wird hier entfernt). Die Teile dieser Runde kommen dann beim naechsten Ablegen noch einmal dran; doppelte Zeilen verhindert clutch-zusammen.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JE_SPALTEN, jeDatei, jeLesen, jeOhneZeilen } from '../lib/jeSpiel.mjs';
import { releaseLeser } from '../lib/releaseStand.mjs';

const DATEN = path.join(process.cwd(), 'data');
const ZIEL = path.join(DATEN, 'clutch');
const JE = path.join(DATEN, 'clutch-je');
const arg = process.argv.slice(2);
const pruefsumme = (daten) => createHash('sha256').update(daten).digest('hex').slice(0, 24);
const warte = (ms) => new Promise((ok) => setTimeout(ok, ms));
const liesDatei = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

const leser = releaseLeser();
/** Wo clutch-je/<w>.json am Release liegt (Release, Name, Groesse, Summe) - oder null. */
const amRelease = (w) => leser.wo(`clutch-je/${w}.json`);

const tage = (fs.existsSync(ZIEL) ? fs.readdirSync(ZIEL) : []).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));

if (arg.includes('--heilen')) {
  const alle = arg.includes('--alle');
  let geheilt = 0; let fehltGesamt = 0;
  for (const w of tage) {
    const datei = path.join(ZIEL, `${w}.json`);
    const d = liesDatei(datei);
    if (!d?.je?.lage?.length) continue;
    // Schon in diesem Lauf geschrieben (lokal da): clutch-zusammen hat die Lage dann aus genau dieser Datei.
    if (fs.existsSync(path.join(JE, `${w}.json`))) continue;
    let rel;
    try { rel = await amRelease(w); } catch (e) { console.log(`  ${w}: Verzeichnis nicht lesbar (${e.message}) - diesmal nicht geprueft`); continue; }
    if (!alle && rel && rel.groesse === d.je.bytes) continue;
    let inhalt;
    try { inhalt = rel ? await leser.inhalt(rel) : null; } catch (e) { console.log(`  ${w}: ${e.message} - diesmal nicht geheilt`); continue; }
    const je = inhalt ? jeLesen(inhalt) : {};
    const neu = jeDatei(je);
    const ohne = jeOhneZeilen(d.matches, je, d.jeLeer);
    const vorher = d.je.bytes;
    if (neu.inhalt.length === vorher && ohne.length === (d.jeOhne?.length ?? 0) && !alle) continue;
    fs.mkdirSync(JE, { recursive: true });
    fs.writeFileSync(path.join(JE, `${w}.json`), neu.inhalt);
    d.je = { spalten: d.je.spalten ?? JE_SPALTEN, lage: neu.lage, bytes: neu.inhalt.length };
    if (ohne.length) d.jeOhne = ohne; else delete d.jeOhne;
    fs.writeFileSync(datei, JSON.stringify(d));
    geheilt += 1; fehltGesamt += ohne.length;
    console.log(`  ${w}: Lage ${vorher} -> ${neu.inhalt.length} Bytes (Release ${rel?.groesse ?? 'fehlt'}), ${ohne.length} von ${d.matches.length} Matches ohne Werte je Match`);
  }
  console.log(`Abgleich: ${geheilt} Spieltage neu ausgerichtet, ${fehltGesamt} Matches zum Nachlesen vorgemerkt.`);
} else if (arg.includes('--pruefen')) {
  // Nur, was dieser Lauf geschrieben hat (lokales clutch-je) oder was eine Lage traegt, die das Release nicht hat.
  let gesperrt = 0;
  const offen = [];
  for (const w of tage) {
    const d = liesDatei(path.join(ZIEL, `${w}.json`));
    if (d?.je?.lage?.length) offen.push([w, d]);
  }
  let schlecht = [];
  for (let v = 0; v < 3; v += 1) {
    schlecht = [];
    leser.vergessen();
    for (const [w, d] of offen) {
      let rel;
      try { rel = await amRelease(w); } catch { rel = undefined; }
      const lokal = path.join(JE, `${w}.json`);
      const summe = fs.existsSync(lokal) ? pruefsumme(fs.readFileSync(lokal)) : null;
      const passt = rel && rel.groesse === d.je.bytes && (!summe || rel.summe === summe);
      if (!passt) schlecht.push([w, rel, summe]);
    }
    if (!schlecht.length) break;
    // Das Verzeichnis kommt am Ende des Hochladens - kurz warten und noch einmal fragen, bevor etwas zurueckgehalten wird.
    await warte(20_000);
    const nochOffen = new Set(schlecht.map(([w]) => w));
    offen.splice(0, offen.length, ...offen.filter(([w]) => nochOffen.has(w)));
  }
  for (const [w, rel, summe] of schlecht) {
    console.log(`  ${w}: clutch-je am Release ${rel ? `${rel.groesse} Bytes${summe && rel.summe !== summe ? ', andere Summe' : ''}` : 'fehlt'} - clutch/${w}.json wird nicht hochgeladen`);
    fs.rmSync(path.join(ZIEL, `${w}.json`), { force: true });
    gesperrt += 1;
  }
  console.log(`Pruefung: ${gesperrt} Spieltage zurueckgehalten.`);
} else {
  console.log('node scripts/clutch-je-abgleich.mjs --heilen [--alle] | --pruefen');
  process.exit(1);
}
