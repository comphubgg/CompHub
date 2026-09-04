const fs=require('fs');
const s=fs.readFileSync('app/admin/maps/page.tsx','utf8');
const needle='id="td-map-content"';
const start=s.indexOf(needle);
if(start===-1){console.log('not found');process.exit(1)}
// find '<div' before needle on same line
let divStart = s.lastIndexOf('<div', start);
console.log('divStart at', s.slice(0,divStart).split('\n').length);
let i=divStart; let stack=0;
for(;i<s.length;i++){
  if(s.slice(i,i+4)==='<div'){
    const m=s.slice(i).match(/^<div\b[^>]*>/);
    if(m && !/\/\s*>$/.test(m[0])) stack++;
    i+= (m?m[0].length:1)-1; continue;
  }
  if(s.slice(i,i+6)==='</div>'){
    stack--;
    if(stack===0){ console.log('closing at line', s.slice(0,i).split('\n').length); console.log('pos',i); process.exit(0);} i+=6-1;
  }
}
console.log('not found');
