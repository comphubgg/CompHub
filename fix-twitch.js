const fs = require('fs');

const dataPath = 'C:\\Users\\jumik\\Desktop\\streamer-dashboard\\data\\players.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Diese Streamer sind in EU_STREAMERS definiert - hole ihre echten Twitter-Handles
const euStreamerNames = [
  'Akiira', 'Chap', 'AmoZz', 'charyy', 'Darm', 'demus', 'Flickzy', 'Focus', 'Kami', 'Malibuca',
  'PabloWingu', 'Pixie', 'Scroll', 'Sky', 'Shxrk', 'SwizzY', 't3eny', 'Th0masHD', 'Tjino', 'vicotryona',
  'Faded', 'Vadeal', 'Vampi', 'Noahreyli', 'Velo', 'Ghonzo', 'Twek', 'Juu'
];

// Hole Twitter-Handles für diese Spieler
const twitchNames = [];
for (const name of euStreamerNames) {
  const player = data.players[name];
  if (player && player.twitter) {
    twitchNames.push(player.twitter.toLowerCase());
    console.log(name + ' -> ' + player.twitter + ' -> ' + player.twitter.toLowerCase());
  } else {
    console.log('⚠️ ' + name + ' nicht gefunden');
  }
}

// Erstelle neues Array
const arrayStr = "const EU_STREAMERS = [\n  '" + twitchNames.join("', '") + "',\n];";

// Lese page.tsx
const pagePath = 'C:\\Users\\jumik\\Desktop\\streamer-dashboard\\app\\page.tsx';
let pageContent = fs.readFileSync(pagePath, 'utf-8');

// Ersetze das komplette EU_STREAMERS Array
const regex = /const EU_STREAMERS = \[[\s\S]*?\];/;
pageContent = pageContent.replace(regex, arrayStr);

fs.writeFileSync(pagePath, pageContent);
console.log('\n✅ page.tsx aktualisiert mit echten Twitter-Handles');
