// Eine Seite wie ein eingeloggter Admin oeffnen und Fehler mitschreiben (Konsole, Seitenfehler, API-Antworten >= 400).
//   KEKS="name=wert" node scripts/seiten-probe.mjs <basis> <pfad> [<pfad> ...]
import { chromium } from 'playwright';
const [basis, ...pfade] = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext();
const [n, ...w] = (process.env.KEKS ?? '').split('=');
if (n) await ctx.addCookies([{ name: n, value: w.join('='), url: basis }]);
for (const pfad of pfade) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log(`SEITENFEHLER ${pfad}: ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`));
  p.on('console', (m) => { if (m.type() === 'error') console.log(`KONSOLE ${pfad}: ${m.text().slice(0, 400)}`); });
  p.on('response', async (r) => { if (r.status() >= 400 && r.url().includes('/api/')) console.log(`API ${r.status()} ${r.url()} ${(await r.text().catch(() => '')).slice(0, 300)}`); });
  const r = await p.goto(basis + pfad, { waitUntil: 'networkidle', timeout: 90000 }).catch((e) => { console.log(`LADEN ${pfad}: ${e.message}`); return null; });
  console.log(`SEITE ${pfad}: ${r?.status()} ${(await p.title().catch(() => ''))}`);
  console.log(`TEXT ${pfad}: ${(await p.innerText('body').catch(() => '')).slice(0, 300).replace(/\s+/g, ' ')}`);
  await p.close();
}
await browser.close();
