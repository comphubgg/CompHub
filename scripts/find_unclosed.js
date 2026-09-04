const fs = require('fs');
const s = fs.readFileSync('app/admin/maps/page.tsx', 'utf8');
let stack = [];
let inSingle = false, inDouble = false, inBack = false, inBraces = 0;
for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (c === "'" && !inDouble && !inBack) { inSingle = !inSingle; continue; }
  if (c === '"' && !inSingle && !inBack) { inDouble = !inDouble; continue; }
  if (c === '`' && !inSingle && !inDouble) { inBack = !inBack; continue; }
  if (inSingle || inDouble || inBack) continue;
  if (c === '{') { inBraces++; continue; }
  if (c === '}') { if (inBraces > 0) inBraces--; continue; }
  if (inBraces > 0) continue;
  if (c === '<') {
    const rest = s.slice(i);
    const mClose = rest.match(/^<\/(\w[\w-\d:]*)\s*>/);
    if (mClose) { const name = mClose[1]; if (stack.length === 0 || stack[stack.length - 1] !== name) { console.log('mismatch close for', name, 'at line', s.slice(0,i).split('\n').length); process.exit(0); } stack.pop(); i += mClose[0].length - 1; continue; }
    const mOpen = rest.match(/^<(\w[\w-\d:]*)\b([^>]*)>/);
    if (mOpen) { const name = mOpen[1]; const attrs = mOpen[2]; const self = /\/\s*>$/.test(mOpen[0]); if (!self) { stack.push(name); } i += mOpen[0].length - 1; continue; }
  }
}
if (stack.length > 0) {
  console.log('Unclosed tag stack top:', stack[stack.length - 1], 'stacklen', stack.length);
  console.log('Stack tail:', stack.slice(-20).join(' > '));
} else {
  console.log('All tags balanced or parser inconclusive');
}
