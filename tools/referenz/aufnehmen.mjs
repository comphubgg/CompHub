// Nimmt eine fremde Replay-Seite als Referenz auf (Screenshots + JSON-Antworten), nur fuer interne Analyse.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const url = process.argv[2];
const aus = process.argv[3] || 'referenz';
fs.mkdirSync(aus, { recursive: true });
const log = [];
let n = 0;
const shot = async (page, name) => {
  n++;
  const f = path.join(aus, String(n).padStart(2, '0') + '-' + name + '.png');
  try { await page.screenshot({ path: f, fullPage: true }); log.push('shot ' + f); } catch (e) { log.push('shotfail ' + name + ' ' + e.message); }
};
const browser = await chromium.launch();
for (const [vw, vh, tag] of [[1600, 1000, 'desk'], [390, 844, 'mobil']]) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: tag === 'mobil' ? 2 : 1 });
  const page = await ctx.newPage();
  let j = 0;
  page.on('response', async (r) => {
    try {
      const ct = r.headers()['content-type'] || '';
      const u = r.url();
      if (tag !== 'desk') return;
      if (ct.includes('json') || /\.json(\?|$)/.test(u)) {
        const b = await r.body();
        j++;
        const f = path.join(aus, 'json', String(j).padStart(3, '0') + '-' + u.replace(/^https?:\/\//, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) + '.json');
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, b.length > 30e6 ? b.subarray(0, 30e6) : b);
        log.push('json ' + r.status() + ' ' + b.length + ' ' + u);
      } else if (!/\.(png|jpe?g|webp|svg|woff2?|css|js|gif|ico)(\?|$)/.test(u)) log.push('resp ' + r.status() + ' ' + ct + ' ' + u);
    } catch {}
  });
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 }); } catch (e) { log.push('goto ' + e.message); }
  await page.waitForTimeout(6000);
  await shot(page, tag + '-start');
  fs.writeFileSync(path.join(aus, tag + '-start.html'), await page.content());
  // alle klickbaren Texte protokollieren
  const texte = await page.$$eval('button, [role=tab], [role=button], a, label, input', (els) => els.map((e) => (e.tagName + ' | ' + (e.getAttribute('aria-label') || '') + ' | ' + (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 80))));
  fs.writeFileSync(path.join(aus, tag + '-bedienelemente.txt'), texte.join('\n'));
  const klick = async (sel, name, warte = 2500) => {
    try {
      const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
      await el.click({ timeout: 5000 });
      await page.waitForTimeout(warte);
      await shot(page, tag + '-' + name);
      return true;
    } catch (e) { log.push('klickfail ' + name + ' ' + e.message.split('\n')[0]); return false; }
  };
  // Load replay
  if (await klick('text=/load replay/i', 'laden', 4000)) {
    fs.writeFileSync(path.join(aus, tag + '-laden.html'), await page.content());
    const t2 = await page.$$eval('button, [role=tab], a, select, option, input', (els) => els.map((e) => (e.tagName + ' | ' + (e.innerText || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 80))));
    fs.writeFileSync(path.join(aus, tag + '-laden-bedien.txt'), t2.join('\n'));
    // erstes Cup/Game waehlen, dann Analyze
    for (const s of ['text=/heat/i', 'text=/fncs/i', '[role=dialog] li >> nth=0', '[role=dialog] button >> nth=3']) { if (await klick(s, 'laden-wahl', 3000)) break; }
    for (const s of ['text=/game 1/i', 'text=/^1$/']) { if (await klick(s, 'laden-game', 2000)) break; }
    if (await klick('text=/analy[sz]e/i', 'analyze', 15000)) {}
    else await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(3000);
  await shot(page, tag + '-geladen');
  // Wiedergabe starten
  await klick('button[aria-label*=lay i]', 'play', 6000);
  await shot(page, tag + '-laeuft');
  // Settings
  for (const s of ['button[aria-label*=etting i]', 'button[title*=etting i]', 'text=/settings/i']) {
    if (await klick(s, 'settings', 2000)) {
      fs.writeFileSync(path.join(aus, tag + '-settings.html'), await page.content());
      await page.keyboard.press('Escape');
      break;
    }
  }
  for (const t of ['Players', 'Killfeed', 'Kill feed']) await klick(`text="${t}"`, 'tab-' + t.replace(/\s/g, ''), 1500);
  for (const t of ['Height', 'Height timeline', 'Zone luck', 'Zone Luck', 'Luck vs', 'Luck vs performance']) {
    if (await klick(`text=/${t}/i`, 'analyse-' + t.replace(/\s/g, ''), 4000)) {
      fs.writeFileSync(path.join(aus, tag + '-analyse-' + t.replace(/\s/g, '') + '.html'), await page.content());
      if (/zone luck/i.test(t)) {
        try { const row = page.locator('tr, li, [class*=row]').filter({ hasText: /\d/ }).nth(3); await row.hover(); await page.waitForTimeout(1500); await shot(page, tag + '-zoneluck-hover'); await row.click(); await page.waitForTimeout(2500); await shot(page, tag + '-zoneluck-klick'); } catch (e) { log.push('hover ' + e.message.split('\n')[0]); }
        try { const info = page.locator('[aria-label*=info i], [title*=formula i], [title*=info i], svg[class*=info i]').first(); await info.hover({ timeout: 3000 }); await page.waitForTimeout(1200); await shot(page, tag + '-zoneluck-info'); } catch {}
      }
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(aus, 'log.txt'), log.join('\n'));
