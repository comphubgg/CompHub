// Setzt die Kacheln von Vital Scrims (cdn.vitalscrims.com/<Ordner>/<z>/<x>/<y>.webp) zu einem Kartenbild zusammen.
//   node scripts/vital-karte-bild.mjs 42.312 [zoom=3] [ziel=public/maps/vital/<Ordner>.webp]
// Zoom 3 = 8 x 8 Kacheln = 2048 x 2048 Pixel. Die Koordinaten von Vital laufen auf dem Quadrat 0..256 (lat -256..0, lng 0..256).
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ordner = process.argv[2];
const zoom = Number(process.argv[3] || 3);
const ziel = process.argv[4] || path.join('public', 'maps', 'vital', `${ordner}.webp`);
if (!ordner) { console.error('Ordner fehlt, z. B. 42.312'); process.exit(1); }

const n = 2 ** zoom;
const teile = [];
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) teile.push({ x, y });
const bilder = await Promise.all(teile.map(async ({ x, y }) => {
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      const r = await fetch(`https://cdn.vitalscrims.com/${ordner}/${zoom}/${x}/${y}.webp`);
      if (r.ok) return { input: Buffer.from(await r.arrayBuffer()), left: x * 256, top: y * 256 };
    } catch { /* noch einmal */ }
  }
  return null;
}));
const da = bilder.filter(Boolean);
console.log(`${da.length} von ${teile.length} Kacheln`);
if (!da.length) process.exit(2);
fs.mkdirSync(path.dirname(ziel), { recursive: true });
await sharp({ create: { width: n * 256, height: n * 256, channels: 3, background: '#0b2f83' } })
  .composite(da).webp({ quality: 85 }).toFile(ziel);
console.log('geschrieben:', ziel);
