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
  const rows = await page.evaluate(() => {
    const table = document.querySelector('table');
    const headers = Array.from(document.querySelectorAll('table thead th')).map(h => h.textContent?.trim() || '');
    const rowData = Array.from(document.querySelectorAll('table tbody tr')).slice(0, 5).map(row =>
      Array.from(row.querySelectorAll('td')).map(td => td.textContent?.trim() || '')
    );
    return { headers, rowData };
  });
  console.log('HEADERS:', rows.headers);
  console.log('ROW DATA:', JSON.stringify(rows.rowData, null, 2));
  await browser.close();
})();
