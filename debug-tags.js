const fs = require('fs');
const content = fs.readFileSync('app/page.tsx', 'utf8').split('\n');

// Track opening/closing braces
let braceCount = 0;
let braceLine = 0;

// Find the problem line around 1333
for (let i = 0; i < content.length; i++) {
  const line = content[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '{') braceCount++;
    if (line[j] === '}') braceCount--;
  }
  if (braceCount < 0) {
    console.log(`Brace mismatch at line ${i+1}: ${line}`);
    console.log(`Brace count: ${braceCount}`);
    break;
  }
}

// Find JSX tag mismatches
console.log('\n--- JSX Tag Mismatches ---');
for (let i = 1150; i < 1300; i++) {
  const line = content[i];
  const opens = (line.match(/<[a-zA-Z][^/>]*>/g) || []).length;
  const closes = (line.match(/<\/[^>]*>/g) || []).length;
  const selfClosing = (line.match(/<[^>]*\/>/g) || []).length;
  
  if ((opens + selfClosing) !== closes) {
    console.log(`${i+1}: +${opens + selfClosing} -${closes}: ${line.substring(0, 100)}`);
  }
}
