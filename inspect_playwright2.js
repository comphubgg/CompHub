import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  const url = 'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=1';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForTimeout(15000);
  await page.screenshot({ path: 'inspect_playwright2.png', fullPage: true });
  console.log('screenshot saved');
  const text = await page.content();
  console.log('html length', text.length);
  console.log('find table', text.toLowerCase().includes('<table'));
  console.log('find rank', text.toLowerCase().includes('rank'));
  await browser.close();
})();
