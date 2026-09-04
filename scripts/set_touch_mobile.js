const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'data', 'tournaments.json');
let data = JSON.parse(fs.readFileSync(file, 'utf8'));
let changed = 0;
for (let t of data) {
  if (t.name && typeof t.name === 'string' && t.name.toLowerCase().includes('touch-only test cup')) {
    if (t.type !== 'mobile') {
      t.type = 'mobile';
      changed++;
    }
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
console.log('Updated', changed, 'tournaments to mobile');
