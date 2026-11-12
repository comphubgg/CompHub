// Namen auf der Karte wie auf der Kartenseite: Profil-Anzeigename, sonst Nobles Name, dann kartenName (ohne Orgtag/Zierrat, max. 16, gross).
//   node scripts/karte-namen.cjs <karte-daten.js>   (schreibt die Datei mit Feld "anzeige" je Team neu)
const fs = require('fs');
const jiti = require('jiti')(__filename, { alias: { '@': process.cwd() } });
(async () => {
  const datei = process.argv[2];
  const K = JSON.parse(fs.readFileSync(datei, 'utf8').replace(/^window\.KARTE=/, '').replace(/;\s*$/, ''));
  const { kernname, ohneZierrat } = jiti('../lib/homoglyph.ts');
  const kartenName = (n) => ohneZierrat(kernname(String(n ?? ''))).slice(0, 16).toUpperCase();
  let prof = {};
  try { prof = await (await fetch('https://github.com/comphubgg/CompHub/releases/download/daten/spieler-profile.json')).json(); } catch { /* ohne */ }
  const anzeige = {};
  for (const p of Object.values(prof)) if (p?.id && p.anzeige) anzeige[p.id] = p.anzeige;
  for (const f of K.formen) for (const t of f.teams) t.anzeige = t.ids.map((id, i) => kartenName(anzeige[id] || t.roh?.[i] || t.namen[i]));
  fs.writeFileSync(datei, `window.KARTE=${JSON.stringify(K)};`);
  console.log(K.formen.flatMap((f) => f.teams.map((t) => t.anzeige.join(' '))).join(' | '));
})();
