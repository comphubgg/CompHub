/**
 * API Endpoint: Sync EUCompetitive Tier List
 * GET /api/sync/eucompetitive
 * Fetches latest EU solo players from Fortnite Power Rankings using Playwright
 */

import { chromium } from 'playwright';

async function scrapeFortnitePowerRankingsWithPlaywright() {
  let browser = null;
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const urls = [
      'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100',
      'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=2',
      'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=3',
      'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=4',
      'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=5',
    ];

    const solos: { name: string; region: string }[] = [];
    const seen = new Set<string>();

    for (const url of urls) {
      const page = await browser.newPage();
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      await page.waitForTimeout(3000);

      const pageSolos = await page.evaluate(() => {
        const results: { name: string; region: string }[] = [];
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        rows.forEach((row) => {
          try {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length < 2) return;

            const nameCell = cells[1];
            const name = nameCell.textContent?.trim() || '';
            if (!name) return;

            let region = 'EU';
            const img = nameCell.querySelector('img');
            if (img) {
              const src = img.getAttribute('src') || img.src || '';
              const match = src.match(/flag-([a-z]{2,5})/i);
              if (match) {
                region = match[1].toUpperCase();
                if (region === 'GLOBE') region = 'EU';
              }
            }

            results.push({ name, region });
          } catch (error) {
            // ignore row errors
          }
        });
        return results;
      });

      await page.close();

      pageSolos.forEach((solo) => {
        const key = solo.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          solos.push(solo);
        }
      });
    }

    return { solos, duos: [] };
  } catch (error) {
    console.error('Playwright scrape error:', error);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

export async function GET(request: Request) {
  try {
    console.log('🌐 Scraping Fortnite Power Rankings for EU solos...');
    const { solos, duos } = await scrapeFortnitePowerRankingsWithPlaywright();

    console.log(
      `✅ Scraped ${solos.length} solos and ${duos.length} duos`
    );

    return Response.json(
      {
        success: true,
        data: {
          solos,
          duos,
        },
        timestamp: new Date().toISOString(),
        message: `Found ${solos.length} solos from Fortnite Power Rankings`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error syncing EUCompetitive:', error);

    // Fallback to mock data if scraping fails
    const fallbackData = {
      solos: [
        { name: 'BUGHA', region: 'EU' },
        { name: 'CLIX', region: 'EU' },
        { name: 'VISXALS', region: 'EU' },
        { name: 'THREATS', region: 'EU' },
        { name: 'DASH', region: 'EU' },
        { name: 'NOXY', region: 'EU' },
        { name: 'GOLDEN', region: 'EU' },
        { name: 'OZONE', region: 'EU' },
        { name: 'RITUAL', region: 'EU' },
        { name: 'COLD', region: 'EU' },
        { name: 'VOID', region: 'EU' },
        { name: 'MAGMA', region: 'EU' },
        { name: 'RAPID', region: 'EU' },
      ],
      duos: [
        { player1: 'PETERBOT', player2: 'POLLO', region: 'EU' },
        { player1: 'BUGHA', player2: 'BRAYDZ', region: 'EU' },
        { player1: 'DASH', player2: 'NOXY', region: 'EU' },
        { player1: 'GOLDEN', player2: 'OZONE', region: 'EU' },
        { player1: 'RITUAL', player2: 'COLD', region: 'EU' },
        { player1: 'VOID', player2: 'MAGMA', region: 'EU' },
        { player1: 'CLIX', player2: 'RAPID', region: 'EU' },
      ],
    };

    return Response.json(
      {
        success: true,
        data: fallbackData,
        timestamp: new Date().toISOString(),
        message: `Using fallback data. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      { status: 200 }
    );
  }
}
