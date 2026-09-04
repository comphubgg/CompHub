// Das Bilderverzeichnis wieder auf die Dateien zeigen lassen, die da sind.
//
// Wozu das noetig wurde: Ein Umwandlungslauf hat die Dateinamen angefasst,
// ohne data/spielerbilder.json mitzuziehen. Danach stand im Verzeichnis
// "scroll.webp", auf der Platte lag "scroll.jpg" - 309 von 433 Eintraegen
// zeigten ins Leere, und im Werkzeug blieben die Bilder schwarz.
//
// Drei Arten von Schaden waren dabei:
//
//   1. Endung geaendert       scroll.jpg    -> scroll.webp   (im Verzeichnis)
//   2. Name in Grossbuchstaben  vico.jpg    -> VICO.jpg      (auf der Platte)
//   3. Endung angehaengt      GOLDEN.png    -> GOLDEN.png.jpg
//
// Die Bilder selbst sind in keinem Fall verloren gegangen. Deshalb wird hier
// nichts neu geholt und nichts neu zugeordnet - wer zu welchem Konto gehoert,
// stand ja schon richtig da. Repariert wird allein der Dateiname.
//
//   node scripts/spielerbilder-reparieren.mjs           -> reparieren
//   node scripts/spielerbilder-reparieren.mjs --probe   -> nur berichten
//
// Vor dem Schreiben legt der Lauf eine Sicherung unter data/_sicherung ab.

import { promises as fs } from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const VERZEICHNIS = path.join(process.cwd(), 'data', 'spielerbilder.json');
const ORDNER = path.join(process.cwd(), 'public', 'spielerbilder');
const SICHERUNG = path.join(process.cwd(), 'data', '_sicherung');

const nurProbe = process.argv.slice(2).includes('--probe');
const ENDUNGEN = ['jpg', 'jpeg', 'png', 'webp'];

/**
 * Der Kern eines Dateinamens.
 *
 * Abgeraeumt werden ALLE angehaengten Bildendungen, nicht nur die letzte:
 * "GOLDEN.png.jpg" ist derselbe Spieler wie "golden.jpg". Kleingeschrieben,
 * weil Windows Gross- und Kleinschreibung nicht unterscheidet und der
 * Umwandlungslauf genau daraus Kraut und Rueben gemacht hat.
 */
function kern(name) {
  let s = name;
  for (;;) {
    const punkt = s.lastIndexOf('.');
    if (punkt < 0) break;
    if (!ENDUNGEN.includes(s.slice(punkt + 1).toLowerCase())) break;
    s = s.slice(0, punkt);
  }
  return s.toLowerCase();
}

/**
 * Welche Datei ist gemeint, wenn mehrere passen?
 *
 * Bevorzugt wird der schlichte Name mit einer einzigen Endung - also
 * "golden.jpg" vor "GOLDEN.png.jpg". Der doppelt beendete ist das Erzeugnis
 * des missglueckten Laufs; der schlichte ist der, der vorher schon da war.
 */
function beste(kandidaten) {
  const einfach = kandidaten.filter((f) => f.split('.').length === 2);
  const klein = einfach.filter((f) => f === f.toLowerCase());
  return klein[0] ?? einfach[0] ?? kandidaten[0];
}

async function main() {
  const eintraege = JSON.parse(await fs.readFile(VERZEICHNIS, 'utf8'));
  const dateien = await fs.readdir(ORDNER);

  const nachKern = new Map();
  for (const f of dateien) {
    const k = kern(f);
    if (!nachKern.has(k)) nachKern.set(k, []);
    nachKern.get(k).push(f);
  }

  let heil = 0; let lag = 0; const verloren = []; const kaputt = [];

  for (const e of eintraege) {
    const jetzt = e.datei ?? '';
    try {
      await fs.access(path.join(ORDNER, jetzt));
      lag++;
      continue;
    } catch { /* zeigt ins Leere */ }

    const kandidaten = nachKern.get(kern(jetzt)) ?? [];
    if (!kandidaten.length) { verloren.push(jetzt); continue; }

    const gewaehlt = beste(kandidaten);

    // Nicht blind uebernehmen: die Datei muss sich auch oeffnen lassen.
    // Ein Umwandlungslauf, der Namen verdreht, kann auch Inhalte zerstoert
    // haben - dann waere ein Eintrag zwar wieder "gueltig", das Bild aber
    // trotzdem schwarz.
    try {
      const m = await sharp(path.join(ORDNER, gewaehlt)).metadata();
      if (!m.width || !m.height) throw new Error('ohne Masse');
    } catch (err) {
      kaputt.push(`${gewaehlt}: ${err.message}`);
      continue;
    }

    if (!nurProbe) e.datei = gewaehlt;
    heil++;
  }

  console.log(`${eintraege.length} Eintraege`);
  console.log(`  lagen richtig : ${lag}`);
  console.log(`  repariert     : ${heil}`);
  console.log(`  unlesbar      : ${kaputt.length}`);
  for (const k of kaputt.slice(0, 8)) console.log('     ', k);
  console.log(`  ohne Datei    : ${verloren.length}`);
  for (const v of verloren.slice(0, 8)) console.log('     ', v);

  // Dateien, auf die niemand mehr zeigt - meist Doppelungen aus dem
  // missglueckten Lauf ("MOMSY (1).jpg"). Sie werden nur genannt, nicht
  // geloescht: was auf der Platte liegt, entscheidet der Mensch.
  const verwendet = new Set(eintraege.map((e) => kern(e.datei ?? '')));
  const verwaist = dateien.filter((f) => !verwendet.has(kern(f)));
  if (verwaist.length) {
    console.log(`\n${verwaist.length} Dateien ohne Eintrag:`);
    for (const v of verwaist) console.log('     ', v);
  }

  if (nurProbe) { console.log('\n--probe: nichts geschrieben.'); return; }

  await fs.mkdir(SICHERUNG, { recursive: true });
  const stempel = new Date().toISOString().replace(/[:.]/g, '-');
  await fs.copyFile(VERZEICHNIS,
    path.join(SICHERUNG, `spielerbilder-vor-reparatur-${stempel}.json`));
  await fs.writeFile(VERZEICHNIS, JSON.stringify(eintraege, null, 1), 'utf8');
  console.log('\nGeschrieben. Sicherung liegt unter data/_sicherung.');
}

main().catch((e) => { console.error('Fehlgeschlagen:', e.message); process.exit(1); });
