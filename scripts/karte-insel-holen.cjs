// Das Inselbild, das die Kartenseite fuer einen Spieltag nimmt (insel-bilder.json "BR:S<n>" bzw. "BR", Ordner kartenbilder in der Ablage).
//   node scripts/karte-insel-holen.cjs <windowId> <aus.png>
const fs = require('fs');
for (const z of (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '').split('\n')) {
  const m = z.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const jiti = require('jiti')(__filename, { alias: { '@': process.cwd() } });
(async () => {
  const [windowId, aus] = process.argv.slice(2);
  const { speicher } = jiti('../lib/ablage.ts');
  const roh = await speicher.lies('insel-bilder.json');
  const inseln = JSON.parse(String(roh));
  const s = /^S(\d+)_/.exec(windowId)?.[1];
  const id = (s && inseln[`BR:S${s}`]) || inseln.BR;
  console.log('Inseln:', JSON.stringify(inseln), '-> gewaehlt', id);
  const bild = await speicher.lies(`kartenbilder/${id}.png`);
  fs.writeFileSync(aus, bild);
  console.log('geschrieben', aus, bild.length, 'Bytes');
})().catch((e) => { console.error(e); process.exit(1); });
