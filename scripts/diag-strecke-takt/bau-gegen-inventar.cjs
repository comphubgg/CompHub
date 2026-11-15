const fs=require('fs');const M=process.argv[2];const T={teile:[0,0,0],passend:[0,0,0],misch:[0,0,0],ohne:[0,0,0],restMinus:[0,0,0],sp:0,spGleich:0};
for(const f of fs.readdirSync(M+'/aus').filter(f=>/^[0-9a-f]{32}\.json$/.test(f))){const d=JSON.parse(fs.readFileSync(M+'/aus/'+f,'utf8'));const m=d.msDiag;const ws={};for(const [w,l] of Object.entries(m.wurzelFigur)){const s=l.find(x=>x>=0);if(s!==undefined)ws[w]=s}
 const st={},steps={};for(const r of m.inv.slice().sort((a,b)=>a[0]-b[0])){const sid=ws[String(r[1])];if(sid===undefined)continue;const k=r[1]+':'+r[2]+':'+r[3];const alt=st[k]??0;st[k]=r[5];if(r[5]!==alt)(steps[sid+':'+r[4]]??=[]).push([r[0],r[5]-alt])}
 for(const p of d.spieler){if(p.bot)continue;for(let s=0;s<3;s++){const S=steps[p.id+':'+s]||[];const b=m.bauListe.filter(x=>x[1]===p.id&&x[2]==='WSM'[s]&&x[3]===1&&x[4]===0).sort((a,c)=>a[0]-c[0]);
  const cap=S.map(x=>x[1]<0&&x[1]>-70&&x[1]%10===0?-x[1]/10:0);let ohne=0,misch=0;
  for(const x of b){let best=-1,bd=9;for(let i=0;i<S.length;i++)if(cap[i]>0){const dt=S[i][0]-x[0];if(dt>=-0.3&&dt<=0.8&&Math.abs(dt)<bd){bd=Math.abs(dt);best=i}}if(best>=0){cap[best]--;T.passend[s]++;continue}
   // gemischt: Schritt nahe, der nicht in Zehnern ist (Bau und Abbau/Aufheben im selben Update)
   const j=S.findIndex(y=>y[1]%10!==0&&Math.abs(y[0]-x[0])<=0.8&&!y.used);if(j>=0){S[j].used=1;misch++;T.misch[s]++;continue}ohne++;T.ohne[s]++}
  T.teile[s]+=b.length;T.restMinus[s]+=cap.reduce((a,c)=>a+c,0);T.sp++;if(ohne===0&&cap.reduce((a,c)=>a+c,0)===0)T.spGleich++}}}
console.log(JSON.stringify(T));
