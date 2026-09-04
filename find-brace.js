const fs = require('fs');
const content = fs.readFileSync('app/page.tsx', 'utf8');

let braceDepth = 0;
let parenDepth = 0;
let maxBraceDepth = 0;
let problems = [];

for (let i = 0; i < content.length; i++) {
  const char = content[i];
  
  if (char === '{') {
    braceDepth++;
    if (braceDepth > maxBraceDepth) maxBraceDepth = braceDepth;
  } else if (char === '}') {
    braceDepth--;
    if (braceDepth < 0) {
      const lineNum = content.substring(0, i).split('\n').length;
      problems.push(`Line ${lineNum}: More closing braces than opening`);
      braceDepth = 0;
    }
  } else if (char === '(') {
    parenDepth++;
  } else if (char === ')') {
    parenDepth--;
    if (parenDepth < 0) {
      const lineNum = content.substring(0, i).split('\n').length;
      problems.push(`Line ${lineNum}: More closing parens than opening`);
      parenDepth = 0;
    }
  }
}

console.log('Final brace depth:', braceDepth);
console.log('Final paren depth:', parenDepth);
console.log('Max brace depth:', maxBraceDepth);
console.log('\nProblems:');
problems.forEach(p => console.log(p));

// Find where the extra { is
let b = 0;
const lines = content.split('\n');
let braceLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const openCount = (line.match(/[^']\\{[^']?\}/g) || []).length;
  const closeCount = (line.match(/[^']\\}[^']?\{/g) || []).length;
  
  // Simple count
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  
  b += opens - closes;
  
  if (i >= 1190 && i <= 1280) {
    console.log(`${(i+1).toString().padStart(4)}: ${line.substring(0, 100)}`);
  }
}
