// CompHub-Videos aufnehmen (Betreiber, 10.11.2026): das Logo-Maennchen springt durch die Seiten und erklaert sie.
//   node tools/intro/aufnehmen.mjs --nur-screenshots                 Screenshots der Live-Seite nach tools/intro/bilder
//   node tools/intro/aufnehmen.mjs --video intro --format quer      Video rendern (intro | erklaer | seite-<schluessel>), Format quer (YouTube) oder hoch (TikTok)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const ORDNER = path.join(ROOT, 'tools/intro');
const BILDER = path.join(ORDNER, 'bilder');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const FPS = Number(arg('--fps', 30)), BASIS = arg('--basis', 'https://www.thecomphub.com');
const VIDEO = arg('--video', 'intro'), FORMAT = arg('--format', 'quer');

export const SEITEN = [
  { schluessel: 'home', pfad: '/', name: 'The <span>Comp</span>Hub', symbol: 'haus',
    text: 'Welcome to <b>The CompHub</b>! Everything competitive Fortnite in one place.',
    lang: 'Welcome to <b>The CompHub</b>! Live cups, rankings, stats, streams and drop maps - everything competitive Fortnite in one place.' },
  { schluessel: 'streams', pfad: '/streams', name: 'Streams', symbol: 'play',
    text: '<b>Streams</b>: watch the pros live while the cup is running.',
    lang: '<b>Streams</b>: see which pros are live right now and jump straight into their stream while the cup is running.' },
  { schluessel: 'rankings', pfad: '/power-rankings', name: 'Power Rankings', symbol: 'krone',
    text: '<b>Power Rankings</b>: the best players of every region, every week.',
    lang: '<b>Power Rankings</b>: the best players of every region, updated every week from real tournament results.' },
  { schluessel: 'events', pfad: '/events', name: 'Events', symbol: 'kalender',
    text: '<b>Events</b>: every cup and every round, with live leaderboards.',
    lang: '<b>Events</b>: every cup and every round - schedule, live leaderboard and results as soon as Epic posts them.' },
  { schluessel: 'cup', pfad: '/events/*', name: 'Cup Stats', symbol: 'ziel',
    text: 'Open a cup: <b>leaderboard, player stats, team stats</b> and drop maps.',
    lang: 'Open any cup and get everything: <b>leaderboard, player stats, team stats</b> and the drop map of every team.' },
  { schluessel: 'statistics', pfad: '/statistics', name: 'Statistics', symbol: 'balken',
    text: '<b>Statistics</b>: damage, eliminations, time alive - for every player.',
    lang: '<b>Statistics</b>: damage, eliminations, accuracy, time alive and more - for every player, cup after cup.' },
  { schluessel: 'tierlist', pfad: '/tierlist', name: 'Tier List', symbol: 'stufen',
    text: 'The <b>Tier List</b>: the top players ranked from S to F.',
    lang: 'The <b>Tier List</b>: the top players of the scene ranked from S to F. Who is S-tier right now?' },
  { schluessel: 'maps', pfad: '/tournament-maps', name: 'Tournament Maps', symbol: 'karte',
    text: '<b>Tournament Maps</b>: see where every team lands.',
    lang: '<b>Tournament Maps</b>: the drop spot of every team, so you know who lands where before the cup starts.' },
  { schluessel: 'fncs', pfad: '/fncs', name: 'FNCS', symbol: 'pokal',
    text: '<b>FNCS</b>: every final and every champion since Chapter 1.',
    lang: '<b>FNCS</b>: every final, every champion and the all-time stats - all the way back to Chapter 1.' },
  { schluessel: 'replays', pfad: '/replays', name: 'Replays', symbol: 'liste',
    text: '<b>Replays</b>: every game of the finals - zones, kill feed and more.',
    lang: '<b>Replays</b>: every game of the big finals - all zones, the full kill feed and where every fight happened.' },
];

function drehbuch(video) {
  if (video === 'intro') return [{ art: 'intro' }, ...SEITEN.map((s, i) => ({ art: 'seite', i, schnell: true, scroll: 0.35 })), { art: 'ende' }];
  if (video === 'erklaer') return [{ art: 'intro' }, ...SEITEN.map((s, i) => ({ art: 'seite', i, text: s.lang, scroll: 0.7 })), { art: 'ende' }];
  const s = SEITEN.findIndex((x) => `seite-${x.schluessel}` === video);
  if (s < 0) throw new Error('Unbekanntes Video: ' + video);
  return [{ art: 'intro' }, { art: 'seite', i: s, text: SEITEN[s].lang, scroll: 0.8 }, { art: 'ende', text: SEITEN[s].name.replace(/<[^>]+>/g, '') + ' · thecomphub.com' }];
}

const browser = await chromium.launch({ ...(process.env.CHROME_PFAD ? { executablePath: process.env.CHROME_PFAD } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

if (process.argv.includes('--nur-screenshots')) {
  fs.mkdirSync(BILDER, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  for (const s of SEITEN) {
    const p = await ctx.newPage();
    let ziel = BASIS + s.pfad;
    if (s.pfad.endsWith('/*')) {
      await p.goto(BASIS + s.pfad.slice(0, -2), { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      await p.waitForTimeout(3000);
      const href = await p.evaluate(() => [...document.querySelectorAll('a[href^="/events/"]')].map((a) => a.getAttribute('href')).find((h) => /^\/events\/[^/?#]+/.test(h ?? '')));
      console.log('Cup-Seite:', href);
      ziel = href ? BASIS + href : BASIS + '/events';
    }
    try { await p.goto(ziel, { waitUntil: 'networkidle', timeout: 60000 }); } catch { console.log('langsam:', ziel); }
    await p.waitForTimeout(5000);
    const hoehe = Math.min(3600, await p.evaluate(() => document.documentElement.scrollHeight));
    await p.setViewportSize({ width: 1440, height: Math.max(900, hoehe) }); await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(BILDER, `${s.schluessel}.png`), clip: { x: 0, y: 0, width: 1440, height: Math.max(900, hoehe) } });
    console.log('Screenshot', ziel, hoehe); await p.close();
  }
  await browser.close(); process.exit(0);
}

const typen = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': typen[path.extname(f)] ?? 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(8765);
const hoch = FORMAT === 'hoch';
const page = await browser.newPage({ viewport: { width: hoch ? 720 : 1280, height: hoch ? 1280 : 720 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('Fehler in der Szene:', e.message));
await page.addInitScript(({ s, d, f }) => { window.SEITEN = s; window.DREHBUCH = d; window.FORMAT = f; }, { s: SEITEN.map((s) => ({ ...s, titel: 'thecomphub.com' + (s.pfad === '/' ? '' : s.pfad.replace('/*', '')), bild: `bilder/${s.schluessel}.png` })), d: drehbuch(VIDEO), f: FORMAT });
await page.goto('http://localhost:8765/tools/intro/szene.html');
await page.waitForFunction(() => window.BEREIT === true, null, { timeout: 180000 });
const dauer = await page.evaluate(() => window.DAUER);
const [von, bis] = (arg('--nur', '') || `0-${dauer}`).split('-').map(Number);
const anzahl = Math.round((bis - von) * FPS);
const FRAMES = path.join(ORDNER, `frames-${VIDEO}-${FORMAT}`); fs.rmSync(FRAMES, { recursive: true, force: true }); fs.mkdirSync(FRAMES, { recursive: true });
console.log(`${VIDEO} ${FORMAT}: ${dauer.toFixed(1)} s, ${anzahl} Bilder`);
for (let k = 0; k < anzahl; k++) {
  await page.evaluate((t) => window.zeichne(t), von + k / FPS);
  await page.screenshot({ path: path.join(FRAMES, `${String(k).padStart(5, '0')}.png`) });
  if (k % 300 === 0) console.log('Bild', k);
}
await browser.close(); server.close();
const aus = arg('--aus', path.join(ORDNER, `comphub-${VIDEO}-${FORMAT}.mp4`));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, '%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', aus], { stdio: 'inherit' });
console.log('Fertig:', aus);
