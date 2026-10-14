// Das zweifarbige Logo des Betreibers (das von seinem X-Konto) als Hauptlogo der Seite - 14.10.2026.
//
// Er schickte zwei Fassungen: das Zeichen auf Weiss (grau und blau) und dasselbe auf dunklem Grund mit Schein. Daraus entstehen:
//   public/logos/CompHub-Logo-frei.png   das Zeichen freigestellt (durchsichtiger Grund) - fuer Startseite, Anmeldung, Karten, Beitragsbilder
//   public/logos/CompHub-Logo.png        das Zeichen auf dunklem Grund, quadratisch - fuer die Kopfzeile
//   app/icon.png, app/apple-icon.png, app/favicon.ico   dasselbe fuer Browser-Tab und Lesezeichen
// Die bisherigen Dateien bleiben als *-alt.png daneben liegen.
//
//   node scripts/logo-uebernehmen.mjs <Zeichen-auf-Weiss.png> <Zeichen-auf-Dunkel.webp>

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [weiss, dunkel] = process.argv.slice(2);
if (!weiss || !dunkel) { console.error('Aufruf: node scripts/logo-uebernehmen.mjs <auf-weiss.png> <auf-dunkel.webp>'); process.exit(1); }
const LOGOS = path.join(process.cwd(), 'public', 'logos');
const APP = path.join(process.cwd(), 'app');
const sichern = (datei, alt) => { if (fs.existsSync(datei) && !fs.existsSync(alt)) fs.copyFileSync(datei, alt); };

// ---- 1. Freistellen: das Zeichen hat genau zwei Farben (Blau, Grau); jeder Pixel ist eine Mischung aus einer davon und Weiss.
const BLAU = [0, 162, 255]; const GRAU = [91, 101, 122];
const { data, info } = await sharp(weiss).flatten({ background: '#ffffff' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const aus = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  const p = [data[i], data[i + 1], data[i + 2]];
  let beste = null;
  for (const c of [BLAU, GRAU]) {
    // Deckkraft aus dem Kanal mit dem groessten Abstand zu Weiss, dann pruefen, wie gut die anderen Kanaele dazu passen.
    let k = 0; for (let j = 1; j < 3; j += 1) if (255 - c[j] > 255 - c[k]) k = j;
    const a = Math.min(1, Math.max(0, (255 - p[k]) / (255 - c[k])));
    let fehler = 0; for (let j = 0; j < 3; j += 1) fehler += Math.abs(a * c[j] + (1 - a) * 255 - p[j]);
    if (!beste || fehler < beste.fehler) beste = { a, c, fehler };
  }
  const a = beste.a < 0.04 ? 0 : beste.a;
  aus[i] = beste.c[0]; aus[i + 1] = beste.c[1]; aus[i + 2] = beste.c[2]; aus[i + 3] = Math.round(a * 255);
}
const frei = sharp(aus, { raw: { width: info.width, height: info.height, channels: 4 } });
const rand = await frei.clone().trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true });
const zugeschnitten = sharp(rand.data).extend({ top: 24, bottom: 24, left: 24, right: 24, background: { r: 0, g: 0, b: 0, alpha: 0 } });
sichern(path.join(LOGOS, 'CompHub-Logo-frei.png'), path.join(LOGOS, 'CompHub-Logo-frei-alt.png'));
await zugeschnitten.clone().resize({ height: 640, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(path.join(LOGOS, 'CompHub-Logo-frei.png'));

// ---- 2. Das Zeichen auf dunklem Grund, quadratisch
sichern(path.join(LOGOS, 'CompHub-Logo.png'), path.join(LOGOS, 'CompHub-Logo-alt.png'));
await sharp(dunkel).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(LOGOS, 'CompHub-Logo.png'));

// ---- 3. Browser-Symbole
sichern(path.join(APP, 'icon.png'), path.join(APP, 'icon-alt.png.bak'));
await sharp(dunkel).resize(512, 512).png().toFile(path.join(APP, 'icon.png'));
await sharp(dunkel).resize(180, 180).png().toFile(path.join(APP, 'apple-icon.png'));
// favicon.ico mit zwei PNG-Bildern (64 und 32 Pixel) - das Format erlaubt PNG-Daten im Eintrag.
const bilder = await Promise.all([64, 32].map((n) => sharp(dunkel).resize(n, n).ensureAlpha().png().toBuffer()));
const kopf = Buffer.alloc(6); kopf.writeUInt16LE(0, 0); kopf.writeUInt16LE(1, 2); kopf.writeUInt16LE(bilder.length, 4);
let versatz = 6 + 16 * bilder.length; const eintraege = [];
bilder.forEach((b, i) => {
  const n = [64, 32][i]; const e = Buffer.alloc(16);
  e.writeUInt8(n, 0); e.writeUInt8(n, 1); e.writeUInt8(0, 2); e.writeUInt8(0, 3); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(b.length, 8); e.writeUInt32LE(versatz, 12); versatz += b.length; eintraege.push(e);
});
fs.writeFileSync(path.join(APP, 'favicon.ico'), Buffer.concat([kopf, ...eintraege, ...bilder]));
console.log('Logo uebernommen: frei', rand.info.width + 'x' + rand.info.height, '- Kopfzeile, icon, apple-icon, favicon');
