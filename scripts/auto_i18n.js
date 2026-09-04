const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scanDirs = [path.join(root, 'app')];
const outFile = path.join(root, 'i18n-candidates.json');

function walk(dir, cb) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, cb);
    } else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) {
      cb(full);
    }
  }
}

const candidates = [];
const seen = new Set();

for (const d of scanDirs) {
  if (!fs.existsSync(d)) continue;
  walk(d, (file) => {
    try {
      const src = fs.readFileSync(file, 'utf8');
      // Find JSX text nodes between >...< that are not tags and contain letters
      const jsxTextRegex = />\s*([^<>\n]{2,}?)\s*</g;
      let m;
      while ((m = jsxTextRegex.exec(src))) {
        const txt = m[1].trim();
        if (!txt) continue;
        // skip if looks like code or only punctuation or numbers
        if (/^[\W_]+$/.test(txt)) continue;
        if (/^\d+$/.test(txt)) continue;
        if (txt.length > 200) continue; // skip very long blocks
        const key = txt.replace(/\s+/g, ' ').slice(0, 60);
        const id = file + '::' + key;
        if (seen.has(id)) continue;
        seen.add(id);
        candidates.push({ file: path.relative(root, file).replace(/\\/g, '/'), text: txt });
      }
      // Also look for plain string literals in code that look like UI text
      const stringRegex = /(["'`])((?:(?!\\1).){3,60}?)\1/g;
      while ((m = stringRegex.exec(src))) {
        const txt = m[2].trim();
        if (!txt) continue;
        if (/^[\w\d_]+$/.test(txt)) continue;
        if (txt.length > 120) continue;
        // heuristic: contains a space and at least one lowercase or uppercase letter
        if (!/\s/.test(txt)) continue;
        const id = file + '::' + txt;
        if (seen.has(id)) continue;
        seen.add(id);
        candidates.push({ file: path.relative(root, file).replace(/\\/g, '/'), text: txt });
      }
    } catch (err) {
      console.error('err reading', file, err.message);
    }
  });
}

fs.writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), candidates }, null, 2), 'utf8');
console.log('Wrote', outFile, 'with', candidates.length, 'candidates');
