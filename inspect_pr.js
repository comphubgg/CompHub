import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = 'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=1';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(10000);

  const columns = await page.evaluate(() => {
    const headers = Array.from(document.querySelectorAll('table thead th'));
    return headers.map((h) => h.textContent?.trim() || '');
  });

  const rows = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('table tbody tr')).slice(0, 5).map((row) =>
      Array.from(row.querySelectorAll('td')).map((td) => td.textContent?.trim() || '')
    );
  });

  console.log('COLUMNS:', columns);
  console.log('ROWS:', JSON.stringify(rows, null, 2));
  await browser.close();
})();
