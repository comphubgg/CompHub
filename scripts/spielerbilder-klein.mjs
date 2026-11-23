// Kleine Fassungen der Spielerfotos fuer die Listen und Karten.
//
// Der Betreiber (11.10.2026): in der Statistik lud "Players" endlos, die Bilder kamen nicht. Die
// Originale sind bis 1600 x 2300 Pixel und 600 KB gross (562 Dateien, 46 MB); eine Liste mit 300
// Spielern zog dadurch 25 MB, und bei Netlify zaehlt jedes Megabyte gegen die 300 Punkte im Monat.
// Karten und Listen zeigen die Fotos hoechstens 300 Pixel breit.
//
// Aus public/spielerbilder/<name>.(jpg|png|jpeg) wird public/spielerbilder-klein/<name>.webp
// (480 Pixel breit). Vorhandene und aktuelle Dateien werden uebersprungen, die Laufzeit
// beim zweiten Mal liegt bei einer Sekunde. Laeuft vor jedem Bau (npm "prebuild") und am Ende der
// Foto-Skripte, damit nie ein Foto ohne kleine Fassung bleibt.
//
// Aufruf:  node scripts/spielerbilder-klein.mjs [--neu]     (--neu = alles neu schreiben)

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { FREIGEGEBEN, kennungGesperrt } from '../lib/fotoSperre.mjs';

const QUELLE = path.join(process.cwd(), 'public', 'spielerbilder');
const ZIEL = path.join(process.cwd(), 'public', 'spielerbilder-klein');
const BREITE = 480;
/*
 * Noch eine, winzige Fassung fuer die Tierlist (spielerbilder-mini, 128 Pixel breit, WebP).
 *
 * Die Tierlist zeigt je Spieler nur eine kleine Foto-Kachel (rund 48-96 Pixel); die 480er Fassung
 * war dort fuenfmal zu gross - bei Solo-Listen mit Hunderten Spielern zogen die 480er zusammen
 * mehrere Megabyte und liessen die Liste rund eine Minute laden (Betreiber, 23.11.2026). 128 Pixel
 * reichen fuer die Kachel (auch auf scharfen Displays) und wiegen nur einen Bruchteil.
 */
const ZIEL_MINI = path.join(process.cwd(), 'public', 'spielerbilder-mini');
const BREITE_MINI = 128;
const neuSchreiben = process.argv.includes('--neu');

async function main() {
  await fs.mkdir(ZIEL, { recursive: true });
  await fs.mkdir(ZIEL_MINI, { recursive: true });
  await fs.mkdir(QUELLE, { recursive: true });
  /*
   * Die alten, entfernten Fotos (17.11.2026, lib/fotoSperre.mjs) duerfen nie wieder ausgeliefert werden - auch nicht, wenn eines aus einem
   * alten Vorrat (Desktop\players) zurueck in den Ordner kopiert wurde. Ihr Inhalts-Kennzeichen steht in lib/fotoGesperrt.json; eine solche
   * Datei wird hier geloescht, bevor die Seite gebaut wird.
   */
  const gesperrt = new Set(JSON.parse(await fs.readFile(path.join(process.cwd(), 'lib', 'fotoGesperrt.json'), 'utf8')));
  const kennung = async (datei) => createHash('sha1').update(await fs.readFile(datei)).digest('hex').slice(0, 8);
  // Freigegebene alte Fotos (lib/fotoSperre.mjs FREIGEGEBEN) bleiben - samt ihrer kleinen Fassung, solange das freigegebene Original daliegt.
  const freiNamen = new Set();
  for (const d of await fs.readdir(QUELLE)) {
    if (!/\.(jpe?g|png)$/i.test(d)) continue;
    const k = await kennung(path.join(QUELLE, d));
    if (FREIGEGEBEN[k] === d) freiNamen.add(d.replace(/\.(jpe?g|png)$/i, ''));
  }
  let entfernt = 0;
  for (const ordner of [QUELLE, ZIEL, ZIEL_MINI]) {
    for (const d of await fs.readdir(ordner)) {
      if (!/\.(jpe?g|png|webp)$/i.test(d)) continue;
      if (ordner !== QUELLE && freiNamen.has(d.replace(/\.webp$/i, ''))) continue;
      if (kennungGesperrt(await kennung(path.join(ordner, d)), gesperrt)) {
        await fs.rm(path.join(ordner, d), { force: true });
        entfernt += 1;
        console.warn(`Gesperrtes altes Foto entfernt: ${path.relative(process.cwd(), path.join(ordner, d))}`);
      }
    }
  }
  if (entfernt) console.warn(`${entfernt} gesperrte alte Fotos entfernt (lib/fotoSperre.mjs).`);
  const dateien = (await fs.readdir(QUELLE)).filter((d) => /\.(jpe?g|png|webp)$/i.test(d));
  let geschrieben = 0, uebersprungen = 0, fehler = 0;
  const gesehen = new Set();

  for (const datei of dateien) {
    const name = datei.replace(/\.(jpe?g|png|webp)$/i, '');
    const ziel = path.join(ZIEL, `${name}.webp`);
    // Zwei Dateien mit gleichem Namen und anderer Endung (x.jpg und x.png): die zuerst gelesene gilt.
    if (gesehen.has(name)) continue;
    gesehen.add(name);
    const zielMini = path.join(ZIEL_MINI, `${name}.webp`);
    try {
      const von = path.join(QUELLE, datei);
      if (!neuSchreiben) {
        const [a, b, c] = await Promise.all([
          fs.stat(von), fs.stat(ziel).catch(() => null), fs.stat(zielMini).catch(() => null),
        ]);
        // Nur ueberspringen, wenn BEIDE Fassungen schon aktuell sind.
        if (b && b.mtimeMs >= a.mtimeMs && c && c.mtimeMs >= a.mtimeMs) { uebersprungen += 1; continue; }
      }
      const bild = sharp(von).rotate();
      await bild.clone()
        .resize({ width: BREITE, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(ziel);
      await bild.clone()
        .resize({ width: BREITE_MINI, withoutEnlargement: true })
        .webp({ quality: 72 })
        .toFile(zielMini);
      geschrieben += 1;
    } catch (e) {
      fehler += 1;
      console.warn(`Kleine Fassung von ${datei} gescheitert: ${e.message}`);
    }
  }

  // Kleine und winzige Fassungen ohne Original (Foto geloescht) wegraeumen.
  let weg = 0;
  for (const ordner of [ZIEL, ZIEL_MINI]) {
    for (const datei of await fs.readdir(ordner)) {
      if (!/\.webp$/i.test(datei)) continue;
      if (!gesehen.has(datei.replace(/\.webp$/i, ''))) {
        await fs.rm(path.join(ordner, datei), { force: true });
        weg += 1;
      }
    }
  }
  /*
   * Ein Kennzeichen je Foto (die ersten acht Zeichen seines Inhalts-Hashs) fuer lib/spielerbildKlein: es haengt als "?v=" an der Adresse.
   * Cloudflare laesst Browser Fotos vier Stunden lang aus dem eigenen Speicher zeigen; ein neu zugeschnittenes Foto unter demselben Namen sah
   * der Betreiber deshalb erst Stunden spaeter (31.10.2026: Salko auf der Startseite noch mit dem zweiten Spieler im Bild). Mit neuem Inhalt
   * kommt eine neue Adresse, und jeder Browser laedt sofort neu.
   */
  const stand = {};
  for (const datei of dateien.sort()) {
    stand[datei] = createHash('sha1').update(await fs.readFile(path.join(QUELLE, datei))).digest('hex').slice(0, 8);
  }
  await fs.writeFile(path.join(process.cwd(), 'lib', 'fotoStand.json'), JSON.stringify(stand));

  console.log(`Spielerfotos klein: ${geschrieben} geschrieben, ${uebersprungen} aktuell, ${weg} entfernt`
    + (fehler ? `, ${fehler} Fehler` : '') + '.');
}

main().catch((e) => {
  // Ein Fehler hier darf den Bau nicht anhalten: dann bleiben eben die Originale in Gebrauch.
  console.warn('Spielerfotos klein: uebersprungen -', e.message);
});
