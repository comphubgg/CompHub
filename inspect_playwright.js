import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=1';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  const html = await page.content();
  console.log('HTML LENGTH', html.length);
  console.log('HTML HEAD', html.slice(0, 2000));
  const columns = await page.evaluate(() => Array.from(document.querySelectorAll('table thead th')).map(h => h.textContent?.trim() || ''));
  const rows = await page.evaluate(() => Array.from(document.querySelectorAll('table tbody tr')).slice(0,5).map(row => Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim() || '')));
  console.log('COLUMNS', columns);
  console.log('ROWS', JSON.stringify(rows, null, 2));
  await browser.close();
})();
