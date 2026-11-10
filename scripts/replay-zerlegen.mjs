// Diagnose: eine heruntergeladene .replay-Datei in ihre Stuecke zerlegen (Kopf, Daten, Checkpoints, Ereignisse) - Zeiten, Groessen, Anfang jedes Datenstuecks.
//   node scripts/replay-zerlegen.mjs <datei>
import fs from 'node:fs';
const b = fs.readFileSync(process.argv[2]);
let o = 0;
const i32 = () => { const v = b.readInt32LE(o); o += 4; return v; };
const str = () => { const n = i32(); const s = n > 0 ? b.toString('utf8', o, o + n - 1) : b.toString('utf16le', o, o - n * 2 - 2); o += n > 0 ? n : -n * 2; return s; };
console.log('magic', i32().toString(16), 'version', i32(), 'laengeMs', i32(), 'netz', i32(), 'changelist', i32());
console.log('name', str(), 'live', i32()); o += 8; console.log('komprimiert', i32(), 'verschluesselt', i32()); const kl = i32(); o += kl;
const typen = { 0: 'Kopf', 1: 'Daten', 2: 'Checkpoint', 3: 'Ereignis' };
const zaehl = {}; let datenNr = 0; let letzteZeit = null; const ereignisGruppen = {};
while (o + 8 <= b.length) {
  const typ = i32(); const groesse = i32(); const start = o;
  zaehl[typ] = (zaehl[typ] ?? 0) + 1;
  if (typ === 1) {
    const t1 = i32(); const t2 = i32(); const len = i32(); const mem = i32();
    const anfang = b.subarray(o, o + 16).toString('hex');
    const text = b.subarray(o, o + 40).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
    const auffaellig = datenNr < 3 || len < 200 || /xml|error|Access|html/i.test(text) || (letzteZeit !== null && t1 !== letzteZeit);
    if (auffaellig) console.log(`Daten #${datenNr} t=${t1}-${t2} len=${len} mem=${mem} anfang=${anfang} ${text}`);
    letzteZeit = t2; datenNr++;
  } else if (typ === 2 || typ === 3) {
    const id = str(); const gruppe = str(); const meta = str(); const t1 = i32(); const t2 = i32(); const len = i32();
    ereignisGruppen[gruppe] = (ereignisGruppen[gruppe] ?? 0) + 1;
    if (typ === 2 && (zaehl[2] ?? 0) <= 3) console.log(`Checkpoint ${id} t=${t1} len=${len}`);
  } else if (typ === 0) console.log('Kopf-Stueck', groesse, 'Bytes');
  else { console.log('UNBEKANNTER TYP', typ, 'bei', start - 8, 'groesse', groesse); break; }
  o = start + groesse;
}
console.log('Stuecke', JSON.stringify(Object.fromEntries(Object.entries(zaehl).map(([k, v]) => [typen[k] ?? k, v]))), 'Datenstuecke', datenNr, 'letzte Zeit', letzteZeit, 'Ende bei', o, 'von', b.length);
console.log('Ereignisgruppen', JSON.stringify(ereignisGruppen));
