const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const candidatesFile = path.join(root, 'i18n-candidates.json');
if (!fs.existsSync(candidatesFile)) {
  console.error('Candidates file not found:', candidatesFile);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(candidatesFile, 'utf8'));
const candidates = data.candidates || [];

const groupedByFile = {};
for (const c of candidates) {
  groupedByFile[c.file] = groupedByFile[c.file] || [];
  groupedByFile[c.file].push(c.text);
}

const files = Object.keys(groupedByFile);
let totalReplacements = 0;

for (const relFile of files) {
  const filePath = path.join(root, relFile);
  if (!fs.existsSync(filePath)) continue;
  let src = fs.readFileSync(filePath, 'utf8');
  const texts = Array.from(new Set(groupedByFile[relFile]));
  texts.sort((a,b) => b.length - a.length);

  for (const txt of texts) {
    // create a key from the text
    const key = txt.replace(/\s+/g,' ').replace(/[^a-zA-Z0-9 ]/g,'').trim().toLowerCase().slice(0,60).replace(/ /g,'_');
    const escaped = txt.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

    // replace JSX text nodes: > text <
    const jsxRegex = new RegExp('(>)\\s*(' + escaped + ')\\s*(<)', 'g');
    const replacementJsx = `$1{require('../app/lib/i18n').t('${key}', '${txt.replace(/'/g,"\\'")}')} $3`;
    const newSrc = src.replace(jsxRegex, replacementJsx);
    if (newSrc !== src) {
      totalReplacements++;
      src = newSrc;
    }

    // replace plain string literals: 'text' or "text"
    const litRegex = new RegExp("([\"'])" + escaped + "\\1", 'g');
    const replacementLit = `require('../app/lib/i18n').t('${key}', '${txt.replace(/'/g,"\\'")}')`;
    const newSrc2 = src.replace(litRegex, replacementLit);
    if (newSrc2 !== src) {
      totalReplacements++;
      src = newSrc2;
    }
  }

  fs.writeFileSync(filePath, src, 'utf8');
  console.log('Patched', relFile);
}

console.log('Total replacements:', totalReplacements);
