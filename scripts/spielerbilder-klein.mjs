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

const QUELLE = path.join(process.cwd(), 'public', 'spielerbilder');
const ZIEL = path.join(process.cwd(), 'public', 'spielerbilder-klein');
const BREITE = 480;
const neuSchreiben = process.argv.includes('--neu');

async function main() {
  await fs.mkdir(ZIEL, { recursive: true });
  const dateien = (await fs.readdir(QUELLE)).filter((d) => /\.(jpe?g|png|webp)$/i.test(d));
  let geschrieben = 0, uebersprungen = 0, fehler = 0;
  const gesehen = new Set();

  for (const datei of dateien) {
    const name = datei.replace(/\.(jpe?g|png|webp)$/i, '');
    const ziel = path.join(ZIEL, `${name}.webp`);
    // Zwei Dateien mit gleichem Namen und anderer Endung (x.jpg und x.png): die zuerst gelesene gilt.
    if (gesehen.has(name)) continue;
    gesehen.add(name);
    try {
      const von = path.join(QUELLE, datei);
      if (!neuSchreiben) {
        const [a, b] = await Promise.all([fs.stat(von), fs.stat(ziel).catch(() => null)]);
        if (b && b.mtimeMs >= a.mtimeMs) { uebersprungen += 1; continue; }
      }
      await sharp(von)
        .rotate()
        .resize({ width: BREITE, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(ziel);
      geschrieben += 1;
    } catch (e) {
      fehler += 1;
      console.warn(`Kleine Fassung von ${datei} gescheitert: ${e.message}`);
    }
  }

  // Kleine Fassungen ohne Original (Foto geloescht) wegraeumen.
  let weg = 0;
  for (const datei of await fs.readdir(ZIEL)) {
    if (!/\.webp$/i.test(datei)) continue;
    if (!gesehen.has(datei.replace(/\.webp$/i, ''))) {
      await fs.rm(path.join(ZIEL, datei), { force: true });
      weg += 1;
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
