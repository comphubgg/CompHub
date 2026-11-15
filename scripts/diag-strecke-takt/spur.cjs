const fs=require('fs');const M=process.argv[2];const epic=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));const matches=process.argv.slice(4);
const ev={};for(const e of epic)for(const s of e.sitzungen)ev[String(s.id).toLowerCase()+'|'+String(e.ids[0]).toLowerCase()]=s.st?.Travel_Distance_Ground;
const data=[];
for(const m of matches){const sp=JSON.parse(fs.readFileSync(`${M}/aus/spur-${m}.json`,'utf8'));const d=JSON.parse(fs.readFileSync(`${M}/aus/${m}.json`,'utf8'));
 for(const p of d.spieler){const e=ev[m+'|'+String(p.epic).toLowerCase()];if(!(e>0))continue;const pts0=sp.spur[p.id]||[];const pts=process.env.TS?pts0.map(a=>a[8]>=0?[a[8],...a.slice(1)]:null).filter(Boolean):pts0;const zu=sp.zust[p.id]||[];let zi=0;const st={};const S=[];const absprung=(zu.find(z=>z[1]==='bIsSkydiving'&&z[2]==='1')||[Infinity])[0];const sprung=zu.filter(z=>z[1]==='bIsSkydiving'&&z[2]==='1').map(z=>z[0]);const tot=(d.feed||[]).filter(f=>f.opfer===p.id&&f.art==='tot'&&f.ursache!==50).map(f=>f.t);const totIv=tot.map(t=>[t,sprung.find(s=>s>t)??Infinity]);
  for(let q=0;q<pts.length;q++){const a=pts[q];const tz=process.env.TS?pts0.find?null:null:null;while(zi<zu.length&&zu[zi][0]<=(process.env.TS?a[0]-0.12:a[0])){const [t,n,v,k]=zu[zi];(st[k]??={})[n]=v;zi++}S.push({...(st[a[7]]||{}),vor:a[0]<absprung||a[0]<d.busAb||(process.env.OHNE_TOT&&totIv.some(([x,y])=>a[0]>=x&&a[0]<y))})}
  data.push({m,n:p.name,e:e/100,pts,S})}}
const F={
 basis:(s)=>!s.vor&&s.bIsSkydiving!=='1'&&s.bIsParachuteOpen!=='1',
 ohne0:(s)=>F.basis(s)&&s.ReplicatedMovementMode!=='0',
 ohneFall:(s)=>F.basis(s)&&s.ReplicatedMovementMode!=='3',
 nur1:(s)=>F.basis(s)&&s.ReplicatedMovementMode==='1',
 ohneFz:(s)=>F.basis(s)&&(s.Vehicle??'0')==='0',
 ohneGleit:(s)=>F.basis(s)&&s.bInGliderRedeploy!=='1'&&s.ReplicatedMovementMode!=='19',
};
function run(filt,dim,interp,phi=0){const r=[];for(const {e,pts,S} of data){let sum=0,last=null,i=0;if(!pts.length){r.push(0/e);continue}
 for(let T=Math.ceil(pts[0][0])+phi;T<=pts[pts.length-1][0]+1;T+=1){while(i+1<pts.length&&pts[i+1][0]<=T)i++;const a=pts[i];if(a[0]>T||!filt(S[i])){last=null;continue}
  let P=a;if(interp&&i+1<pts.length&&pts[i+1][7]===a[7]&&pts[i+1][0]>a[0]){const b=pts[i+1];const f=(T-a[0])/(b[0]-a[0]);P=[T,a[1]+(b[1]-a[1])*f,a[2]+(b[2]-a[2])*f,a[3]+(b[3]-a[3])*f,0,0,0,a[7]]}
  if(last&&last[7]===P[7])sum+=(dim===3?Math.hypot(P[1]-last[1],P[2]-last[2],P[3]-last[3]):Math.hypot(P[1]-last[1],P[2]-last[2]))/100;last=P}
 r.push(sum/e)}return r}
const st=r=>{const s=r.slice().sort((a,b)=>a-b);const med=s[s.length>>1];const ab=r.map(x=>Math.abs(x-1));const tot=data.reduce((a,x,i)=>a+x.e*r[i],0)/data.reduce((a,x)=>a+x.e,0);return `med ${med.toFixed(4)} summe ${tot.toFixed(4)} mittl|x-1| ${(ab.reduce((a,b)=>a+b,0)/ab.length*100).toFixed(2)}% <=0.1% ${ab.filter(x=>x<=0.001).length} <=0.5% ${ab.filter(x=>x<=0.005).length} <=1% ${ab.filter(x=>x<=0.01).length} n ${r.length}`};
module.exports={data,run,F,st};
if(require.main===module){for(const f of Object.keys(F))for(const interp of [0,1])console.log(f.padEnd(9),'3D interp',interp,st(run(F[f],3,interp)));}
