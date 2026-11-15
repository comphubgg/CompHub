// Diagnose (15.11.2026, exakt-mats-strecke): die Ereignisse einer .replay-Datei, die keiner liest - ActorsPosition, AdditionGFPEventGroup, sessionG0, Timecode.
// Je Ereignis Groesse, Zeiten, Anfang (hex/Text) und Entropie (nahe 8 Bit je Byte = verschluesselt oder gepackt). Die Rohdaten landen in <ordner>/ereignis-<gruppe>-<n>.bin.
//   node scripts/diag-ereignisse.mjs <datei> <ordner>
import fs from 'node:fs';
import path from 'node:path';
const [datei, ordner] = process.argv.slice(2);
const b = fs.readFileSync(datei);
let o = 0;
const i32 = () => { const v = b.readInt32LE(o); o += 4; return v; };
const str = () => { const n = i32(); const s = n > 0 ? b.toString('utf8', o, o + n - 1) : b.toString('utf16le', o, o - n * 2 - 2); o += n > 0 ? n : -n * 2; return s; };
i32(); i32(); i32(); i32(); i32(); str(); i32(); o += 8; i32(); i32(); const kl = i32(); o += kl;
const entropie = (x) => { const h = new Array(256).fill(0); for (const c of x) h[c]++; let e = 0; for (const n of h) if (n) { const p = n / x.length; e -= p * Math.log2(p); } return e; };
const zahl = {};
while (o + 8 <= b.length) {
  const typ = i32(); const groesse = i32(); const start = o;
  if (typ === 3) {
    const id = str(); const gruppe = str(); const meta = str(); const t1 = i32(); const t2 = i32(); const len = i32();
    const roh = b.subarray(o, o + len);
    if (gruppe !== 'CharacterSample' && gruppe !== 'playerElim' && gruppe !== 'ZoneUpdate') {
      const n = (zahl[gruppe] = (zahl[gruppe] ?? 0) + 1);
      console.log(`EREIGNIS ${gruppe} #${n} id=${id} meta=${meta.slice(0, 60)} t=${t1}-${t2} len=${len} entropie=${entropie(roh).toFixed(3)} hex=${roh.subarray(0, 96).toString('hex')} text=${roh.subarray(0, 120).toString('latin1').replace(/[^\x20-\x7e]/g, '.')}`);
      if (ordner && n <= 3) fs.writeFileSync(path.join(ordner, `ereignis-${gruppe}-${n}.bin`), roh);
    }
  }
  o = start + groesse;
}
