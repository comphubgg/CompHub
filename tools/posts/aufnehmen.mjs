import { chromium } from 'playwright';
import path from 'node:path';
const [html, aus, b = '1600', h = '900'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const p = await browser.newPage({ viewport: { width: +b, height: +h }, deviceScaleFactor: 2 });
await p.goto('file://' + path.resolve(html)); await p.waitForTimeout(800);
await p.screenshot({ path: aus }); await browser.close();
