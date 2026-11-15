// Die Wiki-Bilder der Waffen und Gegenstaende bei uns ablegen (Betreiber, 15.11.2026: "das echte Waffen-Symbol im Kill-Feed ... Bilder lokal speichern").
//
// scripts/waffen-bilder.mjs fuehrt je Kennung (WID_...) Name und Bildadresse aus dem Fortnite-Wiki; der Besucher lud die Bilder bisher direkt von
// static.wikia.nocookie.net (fremder Server, kann ausfallen oder sperren). Dieses Skript laedt jedes Bild, das noch nicht unter public/waffen liegt
// (Kern der Kennung nicht in app/replays/spielSymbole.json oder app/replays/wikiSymbole.json), einmal herunter, macht daraus ein 160 px breites WebP
// (public/waffen/wiki-<datei>.webp) und traegt Kern -> [Name, Datei] in app/replays/wikiSymbole.json ein. Hoeflich: eins nach dem anderen, kurze Pause.
// Die Sandbox kommt nicht ans Wiki - es laeuft auf dem Runner (.github/workflows/waffen-bilder-lokal.yml).
//
//   node scripts/waffen-bilder-lokal.mjs [Quelle der Tabelle: Datei oder Adresse, Standard https://www.thecomphub.com/api/waffen-bilder]

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const QUELLE = process.argv[2] || 'https://www.thecomphub.com/api/waffen-bilder';
const WAFFEN = path.join(process.cwd(), 'public', 'waffen');
const SPIEL = path.join(process.cwd(), 'app', 'replays', 'spielSymbole.json');
const WIKI = path.join(process.cwd(), 'app', 'replays', 'wikiSymbole.json');
const KOPF = { 'User-Agent': 'CompHub/1.0 (+https://thecomphub.com)' };

// Wie kern() in app/replays/SpielerEbene.tsx.
const kern = (s) => s.replace(/^(B|BP|WID|WMID|AGID|CID)_/i, '').replace(/_C$/i, '').replace(/_(C|UC|R|VR|SR|UR|X|XR|Exotic)(_Ore_T0\d|_T0\d)?$/i, '')
  .split('_').filter((t) => t && !/^(athena|weap|weapon|child|held|spytech|figment)$/i.test(t)).join('_').toLowerCase();

const tabelle = /^https?:/.test(QUELLE) ? await (await fetch(QUELLE, { headers: KOPF })).json() : JSON.parse(fs.readFileSync(QUELLE, 'utf8'));
const spiel = JSON.parse(fs.readFileSync(SPIEL, 'utf8'));
const wiki = fs.existsSync(WIKI) ? JSON.parse(fs.readFileSync(WIKI, 'utf8')) : {};
fs.mkdirSync(WAFFEN, { recursive: true });

const geladen = new Map(); // Bildadresse -> Datei (ohne Endung) oder null
let neu = 0; let fehler = 0;
for (const [kennung, { name, bild }] of Object.entries(tabelle)) {
  const k = kern(kennung);
  if (!k || spiel[k] || wiki[k] || !bild) continue;
  if (!geladen.has(bild)) {
    const roh = decodeURIComponent(new URL(bild).pathname.split('/revision/')[0].split('/').pop() ?? '');
    const datei = `wiki-${roh.replace(/\.[a-z]+$/i, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80)}`;
    let ok = fs.existsSync(path.join(WAFFEN, `${datei}.webp`));
    for (let v = 0; v < 3 && !ok; v += 1) {
      try {
        const r = await fetch(bild, { headers: KOPF, signal: AbortSignal.timeout(30_000) });
        if (!r.ok) throw new Error(String(r.status));
        // Erstes Bild eines GIFs; auf 160 px Breite, durchsichtig bleibt durchsichtig.
        await sharp(Buffer.from(await r.arrayBuffer()), { animated: false }).resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 }).toFile(path.join(WAFFEN, `${datei}.webp`));
        ok = true;
      } catch { await new Promise((w) => setTimeout(w, 1500 * (v + 1))); }
    }
    geladen.set(bild, ok ? datei : null);
    if (!ok) fehler += 1;
    await new Promise((w) => setTimeout(w, 200));
  }
  const datei = geladen.get(bild);
  if (datei) { wiki[k] = [name, datei]; neu += 1; }
}
fs.writeFileSync(WIKI, `${JSON.stringify(Object.fromEntries(Object.entries(wiki).sort(([a], [b]) => a.localeCompare(b))))}\n`);
console.log(`${neu} Kennungen neu, ${[...geladen.values()].filter(Boolean).length} Bilder, ${fehler} nicht ladbar`);
