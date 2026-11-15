// CompHub Promo-Videos rendern (Szene Bild fuer Bild mit Playwright, dann ffmpeg). Gemeinsam fuer alle Videos unter tools/*-video.
//   node tools/stats-agent-video/aufnehmen.mjs --format quer|hoch [--szene tools/prediction-video/szene.html] [--name comphub-prediction]
//        [--aus datei.mp4] [--nur 10-20] [--jobs 4] [--standbilder 0,10,20] [--musik-db -5] [--medien ordner]
// --medien: ein Ordner ausserhalb des Repos (z. B. echte Seitenaufnahmen als Einzelbilder), den die Szene unter /medien/... laedt.
// Ablauf: Szene laden -> SFX-Zeitplan (+ window.ABSCHNITTE fuer die Musik) als JSON speichern -> Audio (ton.py) -> Bilder rendern -> ffmpeg (H.264 + AAC).
// Ohne --szene: das Stats-Agent-Video.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ORDNER = path.join(ROOT, 'tools/stats-agent-video');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const FPS = 30, FORMAT = arg('--format', 'quer'), JOBS = Number(arg('--jobs', 4));
const HOCH = FORMAT === 'hoch';
const SZENE = arg('--szene', 'tools/stats-agent-video/szene.html');
const NAME = arg('--name', 'comphub-stats-agent');
const ARBEIT = arg('--arbeit', path.join(process.env.TMPDIR || '/tmp', NAME));
const AUS = arg('--aus', path.join(ARBEIT, `${NAME}${HOCH ? '-hoch' : ''}.mp4`));
fs.mkdirSync(ARBEIT, { recursive: true });

// Playwright: globale Installation bevorzugen (passt zu den vorinstallierten Browsern)
function ladePlaywright() {
  const orte = [];
  try { orte.push(path.join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright')); } catch {}
  orte.push('playwright');
  for (const o of orte) { try { return createRequire(import.meta.url)(o); } catch {} }
  throw new Error('playwright nicht gefunden');
}
const { chromium } = ladePlaywright();

// Dateigroessen der Spielerbilder (nur echte Fotos > 4 KB verwenden)
const SB = path.join(ROOT, 'public/spielerbilder');
const GROESSEN = Object.fromEntries(fs.readdirSync(SB).map((f) => [f, fs.statSync(path.join(SB, f)).size]));

const typen = { '.mp4': 'video/mp4', '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const MEDIEN = arg('--medien', '') ? path.resolve(arg('--medien')) : null;
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const basis = MEDIEN && u.startsWith('/medien/') ? MEDIEN : ROOT;
  const f = path.join(basis, basis === MEDIEN ? u.slice('/medien/'.length) : u);
  if (!f.startsWith(basis) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': typen[path.extname(f).toLowerCase()] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => server.listen(0, ok));
const PORT = server.address().port;
const URL_ = `http://localhost:${PORT}/${SZENE}?f=${FORMAT}`;
const [B, H] = HOCH ? [1080, 1920] : [1920, 1080];

const browser = await chromium.launch();
async function seite() {
  const p = await browser.newPage({ viewport: { width: B, height: H }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('Fehler in der Szene:', e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.log('Konsole:', m.text()); });
  await p.addInitScript((g) => { window.GROESSEN = g; }, GROESSEN);
  await p.goto(URL_);
  await p.waitForFunction(() => window.BEREIT === true || window.FEHLER, null, { timeout: 180000 });
  const f = await p.evaluate(() => window.FEHLER); if (f) throw new Error(f);
  return p;
}

const erste = await seite();
const DAUER = await erste.evaluate(() => window.DAUER);
const SFX = await erste.evaluate(() => window.SFX);
const ABSCHNITTE = await erste.evaluate(() => window.ABSCHNITTE ?? null);
fs.writeFileSync(path.join(ARBEIT, 'sfx.json'), JSON.stringify({ dauer: DAUER, sfx: SFX, ...(ABSCHNITTE ? { abschnitte: ABSCHNITTE } : {}) }, null, 1));

// Nur Standbilder?
const still = arg('--standbilder', '');
if (still) {
  const ziel = path.join(ARBEIT, `standbilder-${FORMAT}`); fs.mkdirSync(ziel, { recursive: true });
  for (const s of still.split(',').map(Number)) {
    await erste.evaluate((t) => window.zeichne(t), s);
    await erste.screenshot({ path: path.join(ziel, `t${String(s).replace('.', '_').padStart(5, '0')}.png`) });
  }
  console.log('Standbilder:', ziel); await browser.close(); server.close(); process.exit(0);
}

const [von, bis] = (arg('--nur', '') || `0-${DAUER}`).split('-').map(Number);
const anzahl = Math.round((bis - von) * FPS);
const FRAMES = path.join(ARBEIT, `frames-${FORMAT}`); fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
console.log(`${FORMAT}: ${DAUER.toFixed(2)} s, ${anzahl} Bilder, ${JOBS} parallel`);
const seiten = [erste, ...(await Promise.all(Array.from({ length: JOBS - 1 }, seite)))];
let fertig = 0; const start = Date.now();
await Promise.all(seiten.map(async (p, j) => {
  for (let k = j; k < anzahl; k += JOBS) {
    await p.evaluate((t) => window.zeichne(t), von + k / FPS);
    await p.screenshot({ path: path.join(FRAMES, `${String(k).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    if (++fertig % 300 === 0) console.log(`Bild ${fertig}/${anzahl} (${((Date.now() - start) / 1000).toFixed(0)} s)`);
  }
}));
await browser.close(); server.close();

// Audio erzeugen (gleicher Zeitplan)
const WAV = path.join(ARBEIT, 'ton.wav');
execFileSync('python3', [path.join(ORDNER, 'ton.py'), path.join(ARBEIT, 'sfx.json'), WAV, ...(arg('--musik-db') ? ['--musik-db', arg('--musik-db')] : [])], { stdio: 'inherit' });

execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.jpg'), '-ss', String(von), '-t', String(bis - von), '-i', WAV,
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-profile:v', 'high', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', AUS], { stdio: 'inherit' });
console.log('Fertig:', AUS);
