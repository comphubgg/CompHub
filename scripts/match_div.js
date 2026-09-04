const fs=require('fs');const s=fs.readFileSync('app/admin/maps/page.tsx','utf8');const lines=s.split('\n');const targetLine=629;console.log('line629:',lines[targetLine-1]);let idx=0;for(let i=0;i<targetLine-1;i++)idx+=lines[i].length+1; // position at start of line
// find first '<div' occurrence on that line
const line = lines[targetLine-1];const posInLine = line.indexOf('<div');if(posInLine===-1){console.log('No <div on line');process.exit(0);}idx += posInLine;console.log('start index',idx);
let count=0;for(let i=idx;i<s.length;i++){if(s.startsWith('<div',i)){ // ensure it's a tag
 // check for self-closing
 const m = s.slice(i).match(/^<div\b[^>]*>/);
 if(m){ if(/\/\s*>$/.test(m[0])){ /* self-closing */ } else { count++; } i+=m[0].length-1; continue; }
 }
 if(s.startsWith('</div>',i)){ count--; if(count===0){ const upto = s.slice(0,i).split('\n').length; console.log('matching closing at line', upto); console.log('context before:\n', s.slice(Math.max(0,i-200), i+50)); process.exit(0);} i+=6-1; continue; }
}
console.log('not found, final count',count);
