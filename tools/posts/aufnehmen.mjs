import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
// node tools/posts/aufnehmen.mjs <html[?query]> <aus.png> [breite] [hoehe]
const [html, aus, b = '1600', h = '900'] = process.argv.slice(2);
const [datei, query = ''] = html.split('?');
const LOKAL = '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const browser = await chromium.launch({ ...(fs.existsSync(LOKAL) ? { executablePath: LOKAL } : {}), args: ['--allow-file-access-from-files'] });
const p = await browser.newPage({ viewport: { width: +b, height: +h }, deviceScaleFactor: 2 });
await p.goto('file://' + path.resolve(datei) + (query ? `?${query}` : '')); await p.waitForTimeout(800); await p.waitForFunction(() => !document.querySelector("canvas") || document.body.dataset.fertig, null, { timeout: 15000 }).catch(() => {});
await p.screenshot({ path: aus }); await browser.close();
