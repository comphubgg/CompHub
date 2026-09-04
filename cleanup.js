const fs = require('fs');

function cleanupName(name) {
  // Zahlen am Anfang entfernen
  let cleaned = name.replace(/^\d+/, '');
  // FN/FNBR/fnr/fn/fbr am Ende entfernen
  cleaned = cleaned.replace(/(FN|FNBR|fnr|fn|fbr)$/i, '');
  // Zahlen am Ende entfernen
  cleaned = cleaned.replace(/\d+$/, '');
  return cleaned.trim();
}

const dataPath = 'C:\\Users\\jumik\\Desktop\\streamer-dashboard\\data\\players.json';
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Bereinige Player-Namen
const cleanedPlayers = {};
for (const [name, playerData] of Object.entries(data.players)) {
  const cleanedName = cleanupName(name);
  cleanedPlayers[cleanedName] = playerData;
}

// Bereinige Regions
for (const region of ['NAC_PLAYERS', 'EU_PLAYERS']) {
  if (data.regions[region]) {
    data.regions[region] = data.regions[region].map(name => cleanupName(name));
    data.regions[region] = [...new Set(data.regions[region])];
  }
}

// Bereinige Duos
if (data.duos) {
  data.duos = data.duos.map(duo => duo.map(name => cleanupName(name)));
}

data.players = cleanedPlayers;
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log('✅ players.json aktualisiert');

// Bereinige page.tsx
const pagePath = 'C:\\Users\\jumik\\Desktop\\streamer-dashboard\\app\\page.tsx';
let pageContent = fs.readFileSync(pagePath, 'utf-8');

const oldEuStreamers = [
  'akiiraL2', 'Chapfnr', 'AmoZz42', 'charyyy__', 'darmfn1', 'demus_fn', 
  'flickzyV2', 'focusyhyh', 'Kamifn1', 'Pablowingu', 'pixiefnbr1', 
  'ScrollSZN', 'skyfnrr', 'shxrkfnbr', 'swizzy281_', 'T3ney', 'Th0masHD', 
  'Tjino9', 'Vicotyona', 'rezonfn', 'Vadeal', 'vampifn_', 'noahreyli', 
  'velofps', 'predagefn', 'JulianCOM', 'Juufnr_'
];

const newEuStreamers = oldEuStreamers.map(name => cleanupName(name).toLowerCase());

// Erstelle alte und neue Array-Strings
let oldArrayStr = "const EU_STREAMERS = [\n  '" + oldEuStreamers.join("', '") + "',\n];";
let newArrayStr = "const EU_STREAMERS = [\n  '" + newEuStreamers.join("', '") + "',\n];";

if (pageContent.includes(oldArrayStr)) {
  pageContent = pageContent.replace(oldArrayStr, newArrayStr);
  fs.writeFileSync(pagePath, pageContent);
  console.log('✅ page.tsx EU_STREAMERS aktualisiert');
} else {
  console.log('⚠️  Konnte EU_STREAMERS String nicht exakt finden, überspringen');
}
