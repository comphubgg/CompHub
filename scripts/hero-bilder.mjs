// Kleine Kopien der Bilder fuer den Hintergrund der Startseite (public/hero). Einmal laufen lassen, wenn sich die Auswahl aendert:
//   node scripts/hero-bilder.mjs
// Die Startseite laedt so zwoelf Bilder von je rund 30 KB direkt von der eigenen Seite, statt grosse Originale oder fremde Karten ueber /api/maps-bild.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const QUELLEN = [
  ['cup-performance', 'public/tournaments/Fortnite Performance Evaluation.jpg'],
  ['cup-division', 'public/tournaments/FNCS Division 1.jpg'],
  ['cup-global', 'public/cups/fncs-global-championship-2026-hd.jpg'],
  ['cup-reload', 'public/tournaments/Reload Elite Series Finals.jpg'],
  ['karte-1', 'public/maps/archiv/karte-21.webp'],
  ['karte-2', 'public/maps/archiv/karte-05.jpg'],
  ['karte-3', 'public/maps/archiv/karte-03.jpg'],
  ['karte-4', 'public/maps/archiv/karte-01.jpg'],
  ['karte-5', 'public/maps/archiv/karte-06.jpg'],
  ['karte-6', 'public/maps/archiv/karte-02.jpg'],
  ['karte-7', 'public/maps/archiv/karte-12.jpg'],
  ['karte-8', 'public/maps/archiv/karte-09.jpg'],
];
fs.mkdirSync('public/hero', { recursive: true });
for (const [name, quelle] of QUELLEN) {
  const ziel = path.join('public/hero', `${name}.webp`);
  await sharp(quelle).resize(576, 352, { fit: 'cover' }).webp({ quality: 72 }).toFile(ziel);
  console.log(ziel, Math.round(fs.statSync(ziel).size / 1024), 'KB');
}
