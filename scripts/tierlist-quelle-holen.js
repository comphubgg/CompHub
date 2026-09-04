/**
 * Scrape EUCompetitive Tier List
 * Extracts solo players and duos from https://eucompetitive.com/tierlist
 * Runs daily to update local player database
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Helper to fetch HTML
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', reject);
  });
}

// Extract player name from HTML structure
function extractPlayerName(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1].trim() : null;
}

// Parse HTML to extract tier list data
function parseTierListHTML(html) {
  const solos = [];
  const duos = [];

  // Extract solo players - look for S tier, A tier, etc.
  // Pattern: Look for player cards with flags and names
  const playerPattern = /<generic[^>]*>[\s\n]*<img[^>]*>[\s\n]*<generic[^>]*>[\s\n]*<generic[^>]*>(.*?)<\/generic>[\s\n]*<generic[^>]*>(.*?)<\/generic>/g;

  let match;
  const playerMatches = [];
  while ((match = playerPattern.exec(html)) !== null) {
    playerMatches.push({
      name1: match[1].trim(),
      name2: match[2].trim(),
    });
  }

  // Separate solos and duos based on structure
  playerMatches.forEach((item) => {
    if (item.name1 && item.name2) {
      // If both names exist and are different, it's a duo
      if (item.name1 !== item.name2) {
        duos.push({
          player1: item.name1,
          player2: item.name2,
          region: 'EU',
        });
      } else {
        // Same name twice might indicate solo
        solos.push({
          name: item.name1,
          region: 'EU',
        });
      }
    } else if (item.name1) {
      solos.push({
        name: item.name1,
        region: 'EU',
      });
    }
  });

  return { solos, duos };
}

// Main scrape function
async function scrapeEUCompetitive() {
  try {
    console.log('🌍 Scraping EUCompetitive tier list...');

    const html = await fetchHTML('https://eucompetitive.com/tierlist');
    const { solos, duos } = parseTierListHTML(html);

    // Remove duplicates
    const uniqueSolos = Array.from(
      new Map(solos.map((s) => [s.name.toLowerCase(), s])).values()
    );
    const uniqueDuos = Array.from(
      new Map(
        duos.map((d) => [`${d.player1.toLowerCase()}-${d.player2.toLowerCase()}`, d])
      ).values()
    );

    const result = {
      solos: uniqueSolos,
      duos: uniqueDuos,
      lastUpdated: new Date().toISOString(),
    };

    // Save to JSON file
    const outputPath = path.join(__dirname, '../data/eucompetitive-tierlist.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`✅ Scraped ${uniqueSolos.length} solos and ${uniqueDuos.length} duos`);
    console.log(`📁 Saved to ${outputPath}`);

    return result;
  } catch (error) {
    console.error('❌ Error scraping EUCompetitive:', error.message);
    throw error;
  }
}

// Export for use in API routes
module.exports = { scrapeEUCompetitive };

// Run if executed directly
if (require.main === module) {
  scrapeEUCompetitive().catch(console.error);
}
