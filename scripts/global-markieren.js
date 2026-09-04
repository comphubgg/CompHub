#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');

const PLAYERS_FILE = path.join(process.cwd(), 'data', 'players.json');

async function scrapeSolos() {
  const urls = [
    'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100',
    'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=2',
    'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=3',
    'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=4',
    'https://www.fortnite.com/competitive/power-rankings?region=EU&pageSize=100&page=5',
  ];

  const browser = await chromium.launch({ headless: true });
  try {
    const solos = [];
    const seen = new Set();

    for (const url of urls) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const pageSolos = await page.evaluate(() => {
        const results = [];
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        rows.forEach(row => {
          try {
            const cells = Array.from(row.querySelectorAll('td'));
            if (cells.length < 2) return;
            const nameCell = cells[1];
            const name = nameCell.textContent?.trim() || '';
            if (!name) return;
            results.push({ name, region: 'EU' });
          } catch (e) {}
        });
        return results;
      });

      await page.close();

      for (const s of pageSolos) {
        const key = s.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          solos.push(s);
        }
      }
    }

    return solos;
  } finally {
    await browser.close();
  }
}

async function loadPlayers() {
  try {
    const content = await fs.readFile(PLAYERS_FILE, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

async function savePlayers(data) {
  await fs.mkdir(path.dirname(PLAYERS_FILE), { recursive: true });
  await fs.writeFile(PLAYERS_FILE, JSON.stringify(data, null, 2));
}

async function main() {
  console.log('Scraping EUCompetitive for solos...');
  const solos = await scrapeSolos();
  console.log(`Found ${solos.length} solos`);

  const data = (await loadPlayers()) || { players: {}, regions: { NAC_PLAYERS: [], EU_PLAYERS: [] }, duos: [] };

  const playersLower = new Map(Object.keys(data.players).map(k => [k.toLowerCase(), k]));

  const updated = [];
  const added = [];

  for (const s of solos) {
    const lower = s.name.toLowerCase();
    if (playersLower.has(lower)) {
      const key = playersLower.get(lower);
      if (!data.players[key].isGlobal) {
        data.players[key].isGlobal = true;
        updated.push(key);
      }
    } else {
      // Add new player entry
      data.players[s.name] = { region: s.region === 'NAC' ? 'NAC' : 'EU', twitter: '', isGlobal: true };
      // push into region list if missing
      const regionArr = s.region === 'NAC' ? data.regions.NAC_PLAYERS : data.regions.EU_PLAYERS;
      if (!regionArr.includes(s.name)) regionArr.push(s.name);
      added.push(s.name);
    }
  }

  if (updated.length === 0 && added.length === 0) {
    console.log('No changes needed. All scraped players already marked.');
    return;
  }

  await savePlayers(data);

  if (updated.length) console.log('Updated isGlobal for:', updated.join(', '));
  if (added.length) console.log('Added new global players:', added.join(', '));
  console.log('Saved', PLAYERS_FILE);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
