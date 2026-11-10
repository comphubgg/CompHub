// Das CompHub-Intro aufnehmen: Screenshots der Seiten, dann die 3D-Szene (szene.html) Bild fuer Bild, dann MP4.
//   node tools/intro/aufnehmen.mjs [--ohne-screenshots] [--fps 30] [--nur 0-5]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const ORDNER = path.join(ROOT, 'tools/intro');
const BILDER = path.join(ORDNER, 'bilder'); const FRAMES = path.join(ORDNER, 'frames');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('--fps', 30));
const BASIS = arg('--basis', 'https://www.thecomphub.com');
const SEITEN = [
  { pfad: '/', titel: 'thecomphub.com', farbe: ['#1fb4ff', '#0077d6'], symbol: 'stern' },
  { pfad: '/events', titel: 'thecomphub.com/events', farbe: ['#ff7a59', '#e5482a'], symbol: 'kalender' },
  { pfad: '/power-rankings', titel: 'thecomphub.com/power-rankings', farbe: ['#ffcc33', '#f29a00'], symbol: 'krone' },
  { pfad: '/statistics', titel: 'thecomphub.com/statistics', farbe: ['#4cd964', '#1fa83f'], symbol: 'balken' },
  { pfad: '/fncs', titel: 'thecomphub.com/fncs', farbe: ['#b07cff', '#7b3ff2'], symbol: 'pokal' },
  { pfad: '/tierlist', titel: 'thecomphub.com/tierlist', farbe: ['#ff6fb1', '#e2367f'], symbol: 'stufen' },
  { pfad: '/maps', titel: 'thecomphub.com/maps', farbe: ['#3fd2c7', '#139c94'], symbol: 'karte' },
  { pfad: '/posts', titel: 'thecomphub.com/posts', farbe: ['#5a6478', '#2f3747'], symbol: 'liste' },
  { pfad: '/streams', titel: 'thecomphub.com/streams', farbe: ['#9146ff', '#6420d6'], symbol: 'play' },
];
fs.mkdirSync(BILDER, { recursive: true }); fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ ...(process.env.CHROME_PFAD ? { executablePath: process.env.CHROME_PFAD } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
if (!process.argv.includes('--ohne-screenshots')) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  for (const [i, s] of SEITEN.entries()) {
    const p = await ctx.newPage();
    try { await p.goto(BASIS + s.pfad, { waitUntil: 'networkidle', timeout: 45000 }); } catch { console.log('langsam:', s.pfad); }
    await p.waitForTimeout(3500);
    await p.screenshot({ path: path.join(BILDER, `${i}.png`) });
    console.log('Screenshot', s.pfad); await p.close();
  }
  await ctx.close();
}
// Kleiner Server ab dem Projektordner (die Szene laedt three.js und das Logo relativ).
const typen = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': typen[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8765);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log('Szene:', m.text())); page.on('pageerror', (e) => console.log('Fehler in der Szene:', e.message));
await page.addInitScript((s) => { window.SEITEN = s; }, SEITEN.map((s, i) => ({ ...s, bild: `bilder/${i}.png` })));
await page.goto('http://localhost:8765/tools/intro/szene.html');
await page.waitForFunction(() => window.BEREIT === true, null, { timeout: 120000 });
const dauer = await page.evaluate(() => window.DAUER);
const [von, bis] = (arg('--nur', '') || `0-${dauer}`).split('-').map(Number);
const anzahl = Math.round((bis - von) * FPS);
console.log(`Dauer ${dauer.toFixed(1)} s, ${anzahl} Bilder`);
for (let k = 0; k < anzahl; k++) {
  await page.evaluate((t) => window.zeichne(t), von + k / FPS);
  await page.screenshot({ path: path.join(FRAMES, `${String(k).padStart(5, '0')}.png`) });
  if (k % 150 === 0) console.log('Bild', k);
}
await browser.close(); server.close();
const aus = arg('--aus', path.join(ORDNER, 'comphub-intro.mp4'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', aus], { stdio: 'inherit' });
console.log('Fertig:', aus);
