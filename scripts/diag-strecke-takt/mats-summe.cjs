const fs=require('fs');const M=process.argv[2];
const H=new Set(['48d40898ab454867b4759aa4343d915b','29f22c5ad86f43c6ae3d623bfe082fdb','1b4dc38675594fc991086276caf8ab79','d987c9824b664e528028845fd082415c','023efdbcf296434d829ee699aab77b83','4425091c6c3643dfb1d44f3af7a9c854','9aa575a791654c078e42c311975364d2','21b572818204438282e6ca19c0e21b97']);
const alt={};for(const f of fs.readdirSync(M+'/aus').filter(f=>/^[0-9a-f]{32}\.json$/.test(f))){}
const Q=['Kiste','Boden','Gegner','Team','selbst','Wiedereinstieg','unbekannt','Rueckgabe'];
for(const [nm,sel] of [['FNCS Solo Reload Heat 1 EU',m=>H.has(m)],['Performance Evaluation Trios EU Event1 R2',m=>!H.has(m)]]){
 const S={farm:[0,0,0],sam:[0,0,0],q:Q.map(()=>[0,0,0])};let n=0;const pro=[];
 for(const f of fs.readdirSync(M+'/neu').filter(f=>f.endsWith('.json')&&sel(f.slice(0,32)))){const d=JSON.parse(fs.readFileSync(M+'/neu/'+f,'utf8'));
  for(const p of d.spieler){if(p.bot)continue;const x=d.extra[p.id];if(!x)continue;n++;const q=d.matsQuellen[p.id];const farm=[x[9],x[10],x[11]],sam=[x[6],x[7],x[8]];for(let s=0;s<3;s++){S.farm[s]+=farm[s];S.sam[s]+=sam[s]}if(q)q.forEach((v,i)=>v.forEach((y,s)=>S.q[i][s]+=y));pro.push({n:p.name,m:f.slice(0,4),farm,coll:farm.map((v,i)=>v+sam[i])})}}
 const coll=S.farm.map((v,i)=>v+S.sam[i]);const sum=a=>a.reduce((x,y)=>x+y,0);
 console.log('==',nm,'Spieler-Matches',n);console.log(' Farmed  H/S/M',S.farm.join('/'),'=',sum(S.farm),' je Spieler-Match',(sum(S.farm)/n).toFixed(1));console.log(' Collected H/S/M',coll.join('/'),'=',sum(coll),' je Spieler-Match',(sum(coll)/n).toFixed(1));
 console.log(' Differenz Collected-Farmed',sum(coll)-sum(S.farm),'=',((sum(coll)/sum(S.farm)-1)*100).toFixed(1)+'% mehr als Farmed; Farmed-Anteil',(sum(S.farm)/sum(coll)*100).toFixed(1)+'%');
 Q.forEach((q,i)=>console.log('  Quelle',q.padEnd(15),S.q[i].join('/'),'=',sum(S.q[i])));
 const r=pro.filter(p=>sum(p.coll)>0).map(p=>sum(p.farm)/sum(p.coll)).sort((a,b)=>a-b);console.log(' Farmed-Anteil je Spieler-Match: Median',(r[r.length>>1]*100).toFixed(1)+'%','P10',(r[Math.floor(r.length*0.1)]*100).toFixed(1)+'%','P90',(r[Math.floor(r.length*0.9)]*100).toFixed(1)+'%');
 fs.writeFileSync(M+'/mats-'+(H.has([...H][0])&&nm.startsWith('FNCS')?'heat1':'pe')+'.json',JSON.stringify(pro));}
